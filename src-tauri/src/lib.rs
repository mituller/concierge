use native_tls::TlsConnector;

use imap::types::Flag;

use tauri::menu::{MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

// ─── IMAP (read-only) ────────────────────────────────────────────────────────
//
// Concierge talks to Gmail over IMAP instead of the Gmail REST API. Everything
// here is strictly read-only by construction:
//   * `EXAMINE` (not `SELECT`) opens the mailbox read-only, so the server
//     refuses any STORE/EXPUNGE/DELETE.
//   * `BODY.PEEK[...]` (not plain `BODY[...]`) fetches without setting \Seen.
//   * We only ever issue LOGIN, EXAMINE, SEARCH/UID SEARCH, FETCH, and LOGOUT.
// There is no code path that flags, moves, or deletes messages.

type ImapSession = imap::Session<native_tls::TlsStream<std::net::TcpStream>>;

fn imap_session(host: &str, port: u16, email: &str, password: &str) -> Result<ImapSession, String> {
    let tls = TlsConnector::builder().build().map_err(|e| e.to_string())?;
    let client = imap::connect((host, port), host, &tls).map_err(|e| e.to_string())?;
    client
        .login(email, password)
        .map_err(|(e, _)| e.to_string())
}

fn examine(session: &mut ImapSession, folder: &str) -> Result<u32, String> {
    let mailbox = session.examine(folder).map_err(|e| e.to_string())?;
    Ok(mailbox.exists)
}

/// Join a list of UIDs into an IMAP sequence-set string ("1,4,7").
fn seq_set(uids: &[u32]) -> String {
    uids.iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

#[derive(serde::Serialize)]
struct ImapMeta {
    uid: u32,
    seen: bool,
    header: String,
}

#[derive(serde::Serialize)]
struct ImapRaw {
    uid: u32,
    raw: String,
}

#[derive(serde::Serialize)]
struct ImapMetaBatch {
    total: u32,
    messages: Vec<ImapMeta>,
}

fn imap_test_impl(host: &str, port: u16, email: &str, password: &str, folder: &str) -> Result<String, String> {
    let mut session = imap_session(host, port, email, password)?;
    let count = examine(&mut session, folder)?;
    let _ = session.logout();
    Ok(format!("Connected — {count} messages in \"{folder}\""))
}

fn imap_fetch_meta_impl(
    host: &str,
    port: u16,
    email: &str,
    password: &str,
    folder: &str,
    last_uid: u32,
    limit: u32,
) -> Result<ImapMetaBatch, String> {
    let mut session = imap_session(host, port, email, password)?;
    let total = examine(&mut session, folder)?;

    // SEARCH ALL returns every UID, but as an *unordered* HashSet — sort it
    // ascending so batches page through the mailbox in stable UID order.
    let uids = session.uid_search("ALL").map_err(|e| e.to_string())?;
    let mut all: Vec<u32> = uids.into_iter().collect();
    all.sort_unstable();
    let batch: Vec<u32> = all
        .into_iter()
        .filter(|u| *u > last_uid)
        .take(limit as usize)
        .collect();
    if batch.is_empty() {
        let _ = session.logout();
        return Ok(ImapMetaBatch { total, messages: Vec::new() });
    }

    let fetches = session
        .uid_fetch(seq_set(&batch), "(UID FLAGS BODY.PEEK[HEADER])")
        .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(batch.len());
    for f in fetches.iter() {
        if let Some(uid) = f.uid {
            let header = f
                .header()
                .map(|h| String::from_utf8_lossy(h).to_string())
                .unwrap_or_default();
            let seen = f.flags().contains(&Flag::Seen);
            out.push(ImapMeta { uid, seen, header });
        }
    }
    let _ = session.logout();
    Ok(ImapMetaBatch { total, messages: out })
}

fn imap_fetch_bodies_impl(
    host: &str,
    port: u16,
    email: &str,
    password: &str,
    folder: &str,
    uids: Vec<u32>,
) -> Result<Vec<ImapRaw>, String> {
    if uids.is_empty() {
        return Ok(Vec::new());
    }
    let mut session = imap_session(host, port, email, password)?;
    examine(&mut session, folder)?;

    let fetches = session
        .uid_fetch(seq_set(&uids), "(BODY.PEEK[])")
        .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(uids.len());
    for f in fetches.iter() {
        if let (Some(uid), Some(body)) = (f.uid, f.body()) {
            out.push(ImapRaw {
                uid,
                raw: String::from_utf8_lossy(body).to_string(),
            });
        }
    }
    let _ = session.logout();
    Ok(out)
}

#[tauri::command]
async fn imap_test(host: String, port: u16, email: String, password: String, folder: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || imap_test_impl(&host, port, &email, &password, &folder))
        .await
        .map_err(|e| format!("IMAP task failed: {e}"))?
}

#[tauri::command]
async fn imap_fetch_meta(
    host: String,
    port: u16,
    email: String,
    password: String,
    folder: String,
    last_uid: u32,
    limit: u32,
) -> Result<ImapMetaBatch, String> {
    tauri::async_runtime::spawn_blocking(move || {
        imap_fetch_meta_impl(&host, port, &email, &password, &folder, last_uid, limit)
    })
    .await
    .map_err(|e| format!("IMAP task failed: {e}"))?
}

#[tauri::command]
async fn imap_fetch_bodies(
    host: String,
    port: u16,
    email: String,
    password: String,
    folder: String,
    uids: Vec<u32>,
) -> Result<Vec<ImapRaw>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        imap_fetch_bodies_impl(&host, port, &email, &password, &folder, uids)
    })
    .await
    .map_err(|e| format!("IMAP task failed: {e}"))?
}

// ─── App ─────────────────────────────────────────────────────────────────────

pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "concierge initial schema",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "person mentions + Sales/Health defaults",
            sql: include_str!("../migrations/002_people.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add Invoices / receipts default category",
            sql: include_str!("../migrations/003_invoices.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .setup(|app| {
            // Set the dock/window icon explicitly so it shows in dev mode.
            if let Some(icon) = app.default_window_icon().cloned() {
                for window in app.webview_windows().values() {
                    let _ = window.set_icon(icon.clone());
                }
            }

            // macOS conventions: About + Settings… live in the app menu; add a
            // "Sync now" item under File.
            if let Some(menu) = app.menu() {
                let settings_item = MenuItem::with_id(
                    app,
                    "menu-settings",
                    "Settings…",
                    true,
                    Some("CmdOrCtrl+,"),
                )?;
                let sync_item =
                    MenuItem::with_id(app, "menu-sync", "Sync now", true, Some("CmdOrCtrl+R"))?;

                let mut is_first = true;
                for item in menu.items()? {
                    if let MenuItemKind::Submenu(submenu) = item {
                        if is_first {
                            let about_meta = tauri::menu::AboutMetadata {
                                name: Some(String::from("Concierge")),
                                version: Some(app.package_info().version.to_string()),
                                ..Default::default()
                            };
                            let about_item = PredefinedMenuItem::about(
                                app,
                                Some("About Concierge"),
                                Some(about_meta),
                            )?;
                            let _ = submenu.remove_at(0);
                            let _ = submenu.insert(&about_item, 0);
                            let _ = submenu.insert(&settings_item, 1);
                            is_first = false;
                            continue;
                        }
                        if submenu.text().ok().as_deref() == Some("File") {
                            submenu.append(&PredefinedMenuItem::separator(app)?)?;
                            submenu.append(&sync_item)?;
                        }
                    }
                }
            }

            app.on_menu_event(move |app_handle, event| {
                match event.id().as_ref() {
                    "menu-settings" => {
                        let _ = app_handle.emit("menu-settings", ());
                    }
                    "menu-sync" => {
                        let _ = app_handle.emit("menu-sync", ());
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:concierge.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            imap_test,
            imap_fetch_meta,
            imap_fetch_bodies
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seq_set_formats_uid_list() {
        assert_eq!(seq_set(&[]), "");
        assert_eq!(seq_set(&[1]), "1");
        assert_eq!(seq_set(&[1, 4, 7]), "1,4,7");
    }

    #[test]
    fn seq_set_handles_large_uids() {
        assert_eq!(seq_set(&[4294967295]), "4294967295");
    }

    #[test]
    fn meta_batch_serializes_total_and_messages() {
        let batch = ImapMetaBatch {
            total: 100,
            messages: vec![ImapMeta {
                uid: 42,
                seen: false,
                header: "Subject: hi\r\n".to_string(),
            }],
        };
        let json = serde_json::to_string(&batch).unwrap();
        assert!(json.contains("\"total\":100"));
        assert!(json.contains("\"uid\":42"));
        assert!(json.contains("\"seen\":false"));
    }
}