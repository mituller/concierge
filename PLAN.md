# Plan: Concierge — email inbox triage & classification (IMAP + AI)

> STATUS: **built** (v1). App name **Concierge** · Location `/Users/mituller/Development/ai/Concierge/`
> Tagline: **“The mail concierge for a crowded inbox.”**

## Context

13,000+ unread emails — a native desktop app that connects to Gmail over **IMAP
(read-only)**, classifies each email into user-defined categories using AI, and
shows a dashboard of counts + trends to work through the backlog. v1 is
**read-only** — nothing is ever flagged, moved, or deleted on the server.

## Key decision — Jev + DeepSeek Pro (both via OpenRouter)

Classification uses **Jev (TypeSafe)** — a typed yes/no decision model — through
OpenRouter's Decisions API (`~typesafe/jev-latest`). It is fast, cheap, and output
tokens are free. **DeepSeek Pro** (`~deepseek/deepseek-pro-latest`) handles
on-demand summaries and is available as an alternate classifier. Both run through
one OpenRouter API key — no separate TypeSafe account is needed.

## Stack

| Layer | Technology |
|---|---|
| Shell | Tauri v2 (Rust) — macOS desktop |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 (`.dark` variant; light/dark/automatic) |
| State | Zustand |
| DB | SQLite via `tauri-plugin-sql` |
| Settings/keys | JSON store via `tauri-plugin-store` |
| HTTP | `tauri-plugin-http` `fetch` (never `window.fetch`) |
| AI | **DeepSeek Pro** via OpenRouter (OpenAI-compatible chat + JSON output) |
| Icons | lucide-react |
| Email | IMAP (read-only — Rust `EXAMINE` + `BODY.PEEK`, `imap` crate + native-tls) |

## Data model (SQLite, `001_initial.sql`)

- `emails` — IMAP UID (as text), account_id (= IMAP email), subject, from_name, from_email, date, snippet, body_text, unread, summary, classified, timestamps
- `categories` — id, name, color, kind ('topic'|'person'), person_email, sort_order, builtin
- `email_categories` — email_id, category_id, confidence (many-to-many)
- `sync_state` — account_id, last_sync_at, next_page_token, updated_at

## How it works

1. **Sync** — IMAP `UID SEARCH` + `BODY.PEEK[HEADER]` (metadata-first), batched by
   UID; resumable via a persisted UID cursor (`sync_state.next_page_token`).
2. **Auto people** — frequent senders (≥ threshold) become person categories,
   assigned deterministically (no AI).
3. **Classify** — for each uncategorized email (`classified=0`), fetch the body
   lazily and send from/subject/snippet/body to the classifier. **Jev** answers one
   typed yes/no question per topic category; **DeepSeek Pro** returns JSON
   multi-label tags. Confidence is stored; `classified=1` prevents empty-result loops.
4. **Summarize** — on-demand per expanded message; cached in `emails.summary`.
5. **Dashboard** — stat cards, category cards, bar chart (per-category counts),
   12-month multi-line trend with show/hide toggles.

## Files

- Rust: `src-tauri/src/lib.rs` (IMAP commands + native menu + migrations),
  `Cargo.toml`, `tauri.conf.json`, `capabilities/default.json`
- `src/types/index.ts` — domain types + defaults
- `src/services/` — `store.ts`, `db.ts`, `emlParser.ts` (reused), `imap.ts`,
  `openRouter.ts` (catalog + chat), `jev.ts` (Decisions API), `classify.ts` (orchestration)
- `src/stores/` — `settings.ts`, `categories.ts`, `inbox.ts`
- `src/components/` — `layout/`, `dashboard/`, `category/`, `inbox/`, `email/`, `settings/`

## Status

- [x] Scaffold + rebrand (Concierge; Nexus-specific views/services stripped)
- [x] Branding (navy bell icon, app icon set generated via `tauri icon`)
- [x] Theme: light / dark / automatic (matchMedia)
- [x] Native menu: About Concierge + Settings… (⌘,) + Sync now (⌘R)
- [x] Settings: IMAP (host/port/email/app-password/folder + test), OpenRouter key + model picker, category management
- [x] DB migrations (emails, categories, email_categories, sync_state)
- [x] Read-only IMAP sync (EXAMINE + BODY.PEEK, UID cursor + resume)
- [x] Jev classifier (typed yes/no per category, confidence, resume) + DeepSeek Pro alternate
- [x] DeepSeek Pro summaries (on-demand, cached)
- [x] Auto person-categories (sender frequency)
- [x] Dashboard: stat cards + category cards + bar/line charts
- [x] Category drill-down + Inbox list (paginated)
- [x] Verification: `pnpm build` (tsc + vite) ✓ · `cargo check` ✓

## Out of scope for v1 (deferred)

- Delete / archive actions; label write-back to Gmail
- AI "who the email is *about*" entity detection (people are sender-based)
- Additional mail providers (Yahoo / Outlook) — the connector is IMAP, so they're easy to add
- Batch pre-summary of the whole mailbox (summaries are on-demand)