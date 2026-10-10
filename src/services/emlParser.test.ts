import { describe, expect, it } from "vitest";
import { parseEml, emlToNoteContent } from "./emlParser";

const HEADERS = (overrides = "") =>
  `Received: by 10.0.0.1 with SMTP id abc;\r\n` +
  `Date: Mon, 8 Jun 2026 10:15:30 -0700\r\n` +
  `From: John Doe <john@example.com>\r\n` +
  `To: Jane <jane@example.com>\r\n` +
  `Subject: Hello world\r\n` +
  overrides;

describe("parseEml", () => {
  it("parses a plain-text message", () => {
    const eml = HEADERS() + `\r\nLine one.\r\nLine two.\r\n`;
    const parsed = parseEml(eml);
    expect(parsed.subject).toBe("Hello world");
    expect(parsed.from).toBe("John Doe <john@example.com>");
    expect(parsed.to).toBe("Jane <jane@example.com>");
    expect(parsed.body).toBe("Line one.\nLine two.");
  });

  it("unfolds folded (continuation) headers", () => {
    const eml = HEADERS(`Subject: This is a very long\r\n subject that folds\r\n`);
    // Last Subject header wins (later value overrides), single-line after unfold.
    expect(parseEml(eml).subject).toBe("This is a very long subject that folds");
  });

  it("decodes RFC 2047 base64 encoded-word in subject", () => {
    const eml = HEADERS(`Subject: =?UTF-8?B?SGVsbG8gV29ybGQ=?=\r\n`);
    expect(parseEml(eml).subject).toBe("Hello World");
  });

  it("decodes RFC 2047 quoted-printable encoded-word", () => {
    const eml = HEADERS(`Subject: =?UTF-8?Q?H=C3=A9llo?=\r\n`);
    expect(parseEml(eml).subject).toBe("Héllo");
  });

  it("defaults subject/from to fallbacks when missing", () => {
    const eml = `Date: Mon, 8 Jun 2026 10:15:30 -0700\r\n\r\nJust a body.\r\n`;
    const parsed = parseEml(eml);
    expect(parsed.subject).toBe("(No subject)");
    expect(parsed.from).toBe("");
  });

  it("decodes quoted-printable body", () => {
    const eml =
      HEADERS(`Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n`) +
      `\r\nCaf=C3=A9 = 12\r\n`;
    expect(parseEml(eml).body).toBe("Café = 12");
  });

  it("decodes base64 body", () => {
    const b64 = btoa("Base64 body here");
    const eml =
      HEADERS(`Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n`) +
      `\r\n${b64}\r\n`;
    expect(parseEml(eml).body).toBe("Base64 body here");
  });

  it("strips HTML from an html body", () => {
    const eml =
      HEADERS(`Content-Type: text/html; charset=utf-8\r\n`) +
      `\r\n<html><body><p>Hello <b>world</b></p><br>next</body></html>\r\n`;
    const body = parseEml(eml).body;
    expect(body).toContain("Hello");
    expect(body).toContain("next");
    expect(body).not.toContain("<b>");
    expect(body).not.toContain("<html>");
  });

  it("prefers the text/plain part of a multipart/alternative message", () => {
    const eml =
      HEADERS(`Content-Type: multipart/alternative; boundary="b1"\r\n`) +
      `\r\n` +
      `--b1\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nPlain version.\r\n` +
      `--b1\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>HTML version.</p>\r\n` +
      `--b1--\r\n`;
    expect(parseEml(eml).body).toBe("Plain version.");
  });
});

describe("emlToNoteContent", () => {
  it("builds a note with headers + body", () => {
    const content = emlToNoteContent({
      subject: "Hi",
      from: "A <a@b.com>",
      to: "Me <me@x.com>",
      date: "Mon, 1 Jun 2026 09:00:00 +0000",
      body: "Body text",
    });
    expect(content).toContain("**From:** A <a@b.com>");
    expect(content).toContain("**To:** Me <me@x.com>");
    expect(content).toContain("**Date:** Mon, 1 Jun 2026 09:00:00 +0000");
    expect(content).toContain("Body text");
  });

  it("omits cc when absent", () => {
    const content = emlToNoteContent({ subject: "Hi", from: "A", to: "B", body: "x" });
    expect(content).not.toContain("**CC:**");
  });
});