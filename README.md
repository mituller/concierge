# Concierge

**The mail concierge for a crowded inbox.** A native macOS desktop app that syncs
your Gmail over IMAP, classifies every message into categories with AI, and shows
a dashboard of counts + trends so you can work through the backlog.

<img src="public/icon.svg" alt="Concierge" width="128" height="128" />

---

## What it does

- **Gmail sync (IMAP)** — connects via IMAP read-only, pulls the full mailbox
  (metadata-first, resumable via a UID cursor), and keeps incremental refreshes.
  Uses `EXAMINE` + `BODY.PEEK`, so nothing is ever flagged, moved, or deleted.
- **AI classification** — every email is classified into user-defined topic
  categories (multi-label, with confidence) by **Jev** (TypeSafe's typed
  yes/no decision model) — or **DeepSeek Pro** if you switch the classifier.
- **Auto people** — frequent senders become their own person-category (free, no AI).
- **Dashboard** — category cards with counts, plus a bar chart (messages per
  category) and a 12-month multi-line trend chart with show/hide toggles.
- **Drill-down** — click a category card to see its messages, expand a message for
  the full body, and generate an on-demand **DeepSeek summary** ("what this is" +
  "why it needs follow-up").

Iteration 1 is **read-only** — no delete, no archive, no label write-back.

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | Tauri v2 (Rust) — macOS desktop |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 (light / dark / automatic) |
| State | Zustand |
| DB | SQLite via `tauri-plugin-sql` |
| Settings | JSON store via `tauri-plugin-store` |
| HTTP | `tauri-plugin-http` (all `https://` calls) |
| AI | **Jev** (classification) + **DeepSeek Pro** (summaries) via OpenRouter |
| Email | IMAP (read-only — `EXAMINE` + `BODY.PEEK`) |

---

## Setup

### Prerequisites

- macOS (Apple Silicon or Intel)
- Node.js v20+
- Rust (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- An [OpenRouter](https://openrouter.ai) API key
- Gmail with IMAP enabled + a Gmail **App Password**

### Install

```bash
cd concierge
pnpm install
source ~/.cargo/env && pnpm tauri dev
```

The first Rust compile takes a few minutes.

---

## Configuration

Everything is configured in **Settings** — nothing is hardcoded.

### AI (`Settings → AI`)

1. Paste your **OpenRouter API key** (Jev and DeepSeek Pro both bill to it).
2. Choose the **email classifier**:
   - **Jev (TypeSafe)** — the default. Fast, cheap, typed yes/no per category via
     OpenRouter's Decisions API. Output tokens are free.
   - **DeepSeek Pro** — chat + JSON classification using the model below.
3. Pick **`~deepseek/deepseek-pro-latest`** (or any model) for on-demand
   **summaries** — Jev can't write prose, so summaries always use this model.

### Gmail (`Settings → Gmail (IMAP)`)

1. In Gmail, enable IMAP: **Gmail → Settings → See all settings → Forwarding and
   POP/IMAP → Enable IMAP**.
2. Create an **App Password** (requires 2-Step Verification):
   **Google Account → Security → 2-Step Verification → App passwords**, select
   *Mail* and *Other*, then copy the 16-character password.
3. In Concierge, fill in:
   - **Email** — your Gmail address
   - **App password** — the 16-character app password (not your normal password)
   - **IMAP server** — `imap.gmail.com`, **Port** — `993`, **Folder** — `INBOX`
4. Click **Test connection**, then **Sync now**.

Concierge only opens the mailbox read-only (`EXAMINE`) and fetches with
`BODY.PEEK`, so it can never flag, move, or delete your messages.

### Categories (`Settings → Categories`)

- **Topic categories** are the buckets DeepSeek Pro classifies into. The defaults
  are *Follow-up required, Potential spam, Billing, Personal, Newsletters /
  promotions, Other* — add, rename, recolor, or delete at will.
- **Person categories** are created automatically for senders you hear from often
  (default threshold: 5 messages). They're deterministic sender-based — no AI.

---

## Usage

- **Sync now** (sidebar button, or ⌘R) — pulls new mail, builds person categories,
  and classifies the backlog. It batches and resumes, so you can close and re-open
  the app mid-way. Progress shows in the sidebar.
- **Dashboard** — stat cards + category cards + charts. Click a card to drill down.
- **Inbox** — the full synced mailbox, newest first.
- **Summaries** — expand any message in a list and click "Summarize with DeepSeek".

---

## Development

```bash
pnpm build            # type-check + bundle (no app window)
cd src-tauri && cargo check   # rust only
source ~/.cargo/env && pnpm tauri dev   # full dev mode
source ~/.cargo/env && pnpm tauri build # production build
```

Full restart (not just HMR) is required when `src-tauri/` changes, when a SQLite
migration is added to `src-tauri/migrations/`, or when
`src-tauri/capabilities/default.json` changes.

### Data locations

```
~/Library/Application Support/com.mituller.concierge/concierge.db            ← SQLite
~/Library/Application Support/com.mituller.concierge/concierge-settings.json ← settings + keys
```

---

## Data & privacy

All mail is stored locally in SQLite. External calls are made only to services you
explicitly configure: the Gmail API (your account) and OpenRouter (your key), for
fully local classification/summarization. No analytics, no telemetry.