# Concierge — agent guide

Native macOS Tauri v2 app that syncs Gmail over **IMAP (read-only)** and classifies
mail with AI (Jev or DeepSeek Pro via OpenRouter). No Gmail API / OAuth. Nothing is
ever deleted, flagged, or moved on the server.

## Stack

- Tauri v2 (Rust) + React 19 + TypeScript + Vite + Tailwind v4 (`@custom-variant dark`)
- Zustand state; SQLite via `tauri-plugin-sql` (db name `sqlite:concierge.db`)
- Settings via `tauri-plugin-store` (`concierge-settings.json`)
- IMAP in Rust via the `imap` crate (native-tls), exposed as Tauri commands
- AI = `openRouterChat()` (chat) in `src/services/openRouter.ts` and
  `classifyEmailWithJev()` (Decisions API) in `src/services/jev.ts`

## Read-only guarantee (do not regress this)

- Rust opens mailboxes with `EXAMINE` (never `SELECT`) and fetches with
  `BODY.PEEK[...]` (never plain `BODY[...]`). No STORE/EXPUNGE/DELETE/COPY commands.
- The frontend has no write path to the server — it only reads and stores locally.

## Layout

- `src/types/index.ts` — domain types, defaults, default topic categories
- `src/services/imap.ts` — IMAP Tauri-command wrapper + header/body parsing (reuses `emlParser.ts`)
- `src/services/classify.ts` — sync (IMAP) + auto-people + classification + summaries
- `src/services/db.ts` — all SQLite access (parameterized `$1..$n`)
- `src/services/jev.ts` — Jev Decisions API (`POST /api/alpha/decisions`, `~typesafe/jev-latest`)
- `src/services/openRouter.ts` — OpenRouter catalog + chat completions
- `src/stores/*` — Zustand (settings, categories, inbox)
- `src/components/*` — dashboard / category / inbox / email / settings
- `src-tauri/src/lib.rs` — IMAP commands (`imap_test`, `imap_fetch_meta`, `imap_fetch_bodies`) + menu + migrations

## Conventions

- Migrations in `src-tauri/migrations/*.sql`, registered in `src-tauri/src/lib.rs`.
  New migration = full restart required.
- DB columns snake_case; TS objects camelCase (mapped in `src/services/db.ts`).
- `emails.id` stores the IMAP UID as a string; `account_id` = the IMAP email.
- Sync is metadata-first (headers only); the body is fetched lazily during
  classification/summarization (`imap_fetch_bodies`).
- `emails.classified` (0/1) marks whether classification has run, so a
  zero-category result doesn't loop forever.
- `sync_state.next_page_token` stores the highest-synced IMAP UID (resume cursor).

## Build

```bash
pnpm build                       # tsc + vite
source ~/.cargo/env && pnpm tauri dev
```