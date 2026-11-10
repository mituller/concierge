import { Fragment, ReactNode, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";

/** Wrap case-insensitive occurrences of `term` in <mark>. */
export function Highlight({ text, term }: { text: string; term?: string }) {
  const t = term?.trim();
  if (!t || !text) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLowerCase();
  const needle = t.toLowerCase();
  let from = 0;
  let idx = lower.indexOf(needle);
  let k = 0;
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark
        key={k++}
        className="rounded-sm bg-amber-200/80 dark:bg-amber-500/40 text-inherit px-0.5 -mx-0.5"
      >
        {text.slice(idx, idx + t.length)}
      </mark>
    );
    from = idx + t.length;
    idx = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

const URL_RE = /\b(https?:\/\/[^\s<>"')\]]+|mailto:[^\s<>"')\]]+)/gi;

/** Plain text → text with clickable links (opened in the default browser) and highlights. */
function Linkified({ text, term }: { text: string; term?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    // Drop trailing punctuation that is almost never part of the URL.
    const url = m[0].replace(/[.,;:!?]+$/, "");
    if (start > last) out.push(<Highlight key={k++} text={text.slice(last, start)} term={term} />);
    out.push(
      <a
        key={k++}
        href={url}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void open(url);
        }}
        className="text-sky-600 dark:text-sky-400 underline decoration-sky-600/30 hover:decoration-sky-600 break-all"
      >
        <Highlight text={url} term={term} />
      </a>
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(<Highlight key={k++} text={text.slice(last)} term={term} />);
  return <>{out}</>;
}

type Block = { quoted: boolean; lines: string[] };

/** Split a body into runs of normal vs. quoted lines. A quoted run starts at
 *  either a `>`-prefixed line or a reply header ("On … wrote:"). */
function splitQuoted(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const isQuote = (l: string) => /^\s*>/.test(l);
  const isReplyHeader = (l: string) => /^On .{4,200} wrote:\s*$/.test(l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let quoted = isQuote(line);
    // Attach "On … wrote:" to the quote that follows it.
    if (!quoted && isReplyHeader(line)) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== "");
      if (next && isQuote(next)) quoted = true;
    }
    // Blank lines inside a quote stay with the quote.
    if (!quoted && line.trim() === "" && blocks[blocks.length - 1]?.quoted) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== "");
      if (next && isQuote(next)) quoted = true;
    }
    const cur = blocks[blocks.length - 1];
    if (cur && cur.quoted === quoted) cur.lines.push(line);
    else blocks.push({ quoted, lines: [line] });
  }
  return blocks;
}

function QuotedBlock({ lines, term }: { lines: string[]; term?: string }) {
  const [shown, setShown] = useState(false);
  const count = lines.filter((l) => l.trim() !== "").length;
  return shown ? (
    <div className="border-l-2 border-gray-200 dark:border-gray-600 pl-3 text-gray-500 dark:text-gray-400">
      <button
        onClick={() => setShown(false)}
        className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mb-1"
      >
        Hide quoted text
      </button>
      <div>
        <Linkified text={lines.join("\n")} term={term} />
      </div>
    </div>
  ) : (
    <button
      onClick={() => setShown(true)}
      className="my-1 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
      title="Show quoted text"
    >
      ··· {count} quoted line{count === 1 ? "" : "s"}
    </button>
  );
}

/** Email body: clickable links, collapsed quoted replies, search highlights. */
export function EmailBody({ body, term }: { body: string; term?: string }) {
  const blocks = splitQuoted(body.trimEnd());
  return (
    <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
      {blocks.map((b, i) => (
        <Fragment key={i}>
          {b.quoted ? (
            <QuotedBlock lines={b.lines} term={term} />
          ) : (
            <Linkified text={b.lines.join("\n")} term={term} />
          )}
          {i < blocks.length - 1 && !b.quoted ? "\n" : null}
        </Fragment>
      ))}
    </div>
  );
}
