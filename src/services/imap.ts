import { invoke } from "@tauri-apps/api/core";
import { parseEml } from "./emlParser";
import { AppSettings, Email } from "../types";

/**
 * IMAP (read-only) access to Gmail. All network work happens in Rust
 * (src-tauri/src/lib.rs) — the webview only shells out to Tauri commands.
 * The Rust backend uses EXAMINE + BODY.PEEK so nothing is ever flagged,
 * moved, or deleted.
 */

export interface ImapConfig {
  host: string;
  port: number;
  email: string;
  password: string;
  folder: string;
}

export function imapConfigFromSettings(s: AppSettings): ImapConfig {
  return {
    host: s.imapHost,
    port: s.imapPort,
    email: s.imapEmail,
    password: s.imapPassword,
    folder: s.imapFolder,
  };
}

export function hasImapConfig(s: AppSettings): boolean {
  return !!(s.imapHost && s.imapEmail && s.imapPassword);
}

export interface ImapMeta {
  uid: number;
  seen: boolean;
  header: string;
}

export interface ImapRaw {
  uid: number;
  raw: string;
}

export async function imapTest(cfg: ImapConfig): Promise<string> {
  return invoke<string>("imap_test", { ...cfg });
}

export async function imapFetchMeta(
  cfg: ImapConfig,
  lastUid: number,
  limit: number
): Promise<ImapMeta[]> {
  return invoke<ImapMeta[]>("imap_fetch_meta", { ...cfg, lastUid, limit });
}

export async function imapFetchBodies(cfg: ImapConfig, uids: number[]): Promise<ImapRaw[]> {
  return invoke<ImapRaw[]>("imap_fetch_bodies", { ...cfg, uids });
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function splitFrom(from: string): { name: string; email: string } {
  const m = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: from.trim(), email: from.trim() };
}

function parseHeaderDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Build a Concierge Email row from one IMAP metadata entry (header only). */
export function metaToEmail(cfg: ImapConfig, meta: ImapMeta): Email {
  const parsed = parseEml(meta.header);
  const { name, email } = splitFrom(parsed.from);
  const now = new Date().toISOString();

  return {
    id: String(meta.uid),
    accountId: cfg.email,
    subject: parsed.subject,
    fromName: name,
    fromEmail: email,
    date: parseHeaderDate(parsed.date),
    snippet: "",
    unread: !meta.seen,
    categoryIds: [],
    confidences: {},
    createdAt: now,
    fetchedAt: now,
  };
}

/** Extract the plain-text body from a full raw message. */
export function rawToBody(raw: string): string {
  return parseEml(raw).body;
}