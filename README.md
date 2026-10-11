# Concierge

**The mail concierge for a crowded inbox.** A native macOS desktop app that syncs
your Gmail over IMAP (read-only), classifies every message into categories with AI,
and shows a live dashboard of counts + trends so you can work through the backlog.

<img src="public/icon.svg" alt="Concierge" width="128" height="128" />

---

## What it does

- **Gmail sync (IMAP, read-only)** — metadata-first sync with a resumable UID
  cursor and incremental refreshes. Uses `EXAMINE` + `BODY.PEEK`, so nothing is
  ever flagged, moved, or deleted.
- **Live progress + cancel/resume** — the sidebar shows real `N / M` counts for
  syncing *and* classifying, with a **Cancel** button. Everything resumes where it
  left off (UID cursor + `classified` flag), even across app restarts.
- **AI classification (multi-label)** — every email is sorted into topic
  categories — **Jev** (fast typed yes/no, the default) or **DeepSeek Flash**
  (chat + JSON). One email can be in several categories at once.
- **People categories = who the email is *about*** — AI extracts the people
  central to each email's *content* (not just the sender). The **top 10** people
  become person-categories automatically; add more manually. Example: a doctor's
  appointment email lands in **Health** *and* a person category for the doctor.
- **Live dashboard** — category cards tick up as emails are categorized; a bar
  chart + 12-month multi-line trend chart update as you watch. Category views
  refresh themselves while open.
- **Drill-down & summaries** — click any card to see its messages; expand one and
  get an on-demand **DeepSeek summary** ("what this is" + "why it needs follow-up").

v1 is **read-only** — no delete, no archive, no label write-back to Gmail.

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
| Charts | hand-rolled SVG (bar + multi-line trend) |
| AI | **Jev** (`~typesafe/jev-latest`) + **DeepSeek V4.1 Flash** (`deepseek/deepseek-v4.1-flash`) via OpenRouter |
| Email | IMAP (read-only — `EXAMINE` + `BODY.PEEK`) |

---

## Setup

### Prerequisites

- macOS (Apple Silicon or Intel)
- Node.js v20+ and [pnpm](https://pnpm.io/installation)
- Rust (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- An [OpenRouter](https://openrouter.ai) API key
- Gmail with an **App Password** (IMAP is always on for personal accounts since Jan 2025)

### Install

```bash
cd Concierge
pnpm install
source ~/.cargo/env && pnpm tauri dev
```

The first Rust compile takes a few minutes; subsequent starts are quick.

---

## Configuration

Everything is configured in **Settings** — nothing is hardcoded.

### AI (`Settings → AI`)

1. Paste your **OpenRouter API key** (both Jev and DeepSeek bill to it).
2. Choose the **email classifier**:
   - **Jev (TypeSafe)** — the default. Fast, cheap, typed yes/no per category via
     OpenRouter's Decisions API. Output tokens are free.
   - **DeepSeek** — chat + JSON classification, using the model below.
3. **Model (DeepSeek)** — defaults to **`deepseek/deepseek-v4.1-flash`** (pinned
   explicitly so you know which version runs; the `~…-latest` alias follows new
   releases automatically);
   change it with the model picker if you like. DeepSeek is used for on-demand
   summaries and for classification when the classifier is set to DeepSeek.
   (People extraction always uses a fast model.)

### Gmail (`Settings → Gmail (IMAP)`)

1. Create an **App Password** (requires **2-Step Verification** on first):
   **Google Account → Security → 2-Step Verification** (enable it), then
   **myaccount.google.com/apppasswords** → name it `Concierge` → copy the
   16-character code.
2. In Concierge:
   - **Email** — your Gmail address
   - **App password** — the 16-char code *(not your normal Google password)*
   - **IMAP server** — `imap.gmail.com`, **Port** — `993`, **Folder** — `INBOX`
3. Click **Test connection**, then **Sync now**.

Concierge opens the mailbox read-only (`EXAMINE`) and fetches with `BODY.PEEK`, so
it can never flag, move, or delete your messages.

### Categories (`Settings → Categories`)

- **Topic categories** — multi-label buckets. Defaults: *Follow-up required,
  Potential spam, Billing, Sales, Health, Personal, Newsletters / promotions,
  Invoices / receipts, Security, Other*. Add, rename, recolor, or delete any of them.
- **Person categories** — *who an email is about*, detected from content by AI.
  The **top 10 most-mentioned people** are auto-created (and backfilled) as
  classification runs; add more manually (name + optional email) at any time.
  Emails are matched to people by email, then by name.

---

## Usage

- **Sync now** (sidebar, or ⌘R) — syncs new mail, then classifies the backlog with
  live `N / M` progress. **Cancel** stops at the next batch; **Sync now** resumes.
- **Dashboard** — stat cards, category cards (updating live), bar chart, 12-month
  trend chart. Click a card to drill down.
- **Category view** — refreshes automatically while open; expand any message for
  the full body or a **DeepSeek summary**.
- **Inbox** — the full synced mailbox, newest first.

---

## Testing

```bash
pnpm test          # frontend unit tests (vitest)
cd src-tauri && cargo test   # rust unit tests
```

Frontend tests live in `src/**/*.test.ts` (currently MIME parsing + classifier
helpers). Rust tests are inline in `src-tauri/src/lib.rs`. GitHub Actions CI runs
`pnpm build`, `pnpm test`, `cargo check`, and `cargo test` on every push.

---

## Development

```bash
pnpm dev                             # vite only (no app window)
pnpm build                           # tsc type-check + bundle
pnpm test                            # vitest unit tests
cd src-tauri && cargo check          # rust type-check
cd src-tauri && cargo test           # rust unit tests
source ~/.cargo/env && pnpm tauri dev    # full dev mode (app window)
source ~/.cargo/env && pnpm tauri build # production bundle
```

**Full restart (not just HMR) is required when:**
- anything in `src-tauri/` changes (Rust recompiles),
- a SQLite migration is added in `src-tauri/migrations/`,
- `src-tauri/capabilities/default.json` changes.

### Data locations

```
~/Library/Application Support/com.mituller.concierge/concierge.db            ← SQLite
~/Library/Application Support/com.mituller.concierge/concierge-settings.json ← settings + keys
```

---

## Data & privacy

All mail is stored locally in SQLite. External calls are made only to services you
explicitly configure: your Gmail over IMAP (read-only) and OpenRouter (your key)
for classification/summarization. No analytics, no telemetry. Nothing on Gmail is
ever modified, marked read, moved, or deleted.