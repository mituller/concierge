import { describe, expect, it } from "vitest";
import { Category, Email } from "../types";
import {
  classifySystemPrompt,
  classifyUserPrompt,
  matchPersonToCategory,
  parseJson,
  peopleSystemPrompt,
  peopleUserPrompt,
  shouldExtractPeople,
} from "./classify";

const cat = (id: string, name: string, personEmail?: string): Category => ({
  id,
  name,
  color: "#ccc",
  kind: personEmail !== undefined ? "person" : "topic",
  personEmail,
  sortOrder: 0,
  builtin: false,
});

const email: Email = {
  id: "1",
  accountId: "acct",
  subject: "Doctor appointment",
  fromName: "Front Desk",
  fromEmail: "clinic@example.com",
  bodyText: "Your appointment with Dr. Ezra is on Friday.",
  date: "2026-06-01T00:00:00.000Z",
  snippet: "appointment",
  unread: true,
  categoryIds: [],
  confidences: {},
  createdAt: "2026-06-01T00:00:00.000Z",
  fetchedAt: "2026-06-01T00:00:00.000Z",
};

describe("parseJson", () => {
  it("parses a bare JSON object", () => {
    expect(parseJson('{"categories":[{"name":"Billing"}]}')).toEqual({
      categories: [{ name: "Billing" }],
    });
  });

  it("strips markdown code fences", () => {
    const s = "```json\n{\"a\":1}\n```";
    expect(parseJson(s)).toEqual({ a: 1 });
  });

  it("extracts the object out of surrounding prose", () => {
    const s = 'Here you go: {"x": 2} and that is it.';
    expect(parseJson(s)).toEqual({ x: 2 });
  });

  it("returns {} on garbage", () => {
    expect(parseJson("not json at all")).toEqual({});
    expect(parseJson("")).toEqual({});
  });
});

describe("matchPersonToCategory", () => {
  const people = [cat("p1", "Ezra Miller", "ezra@example.com"), cat("p2", "Sarah St Louis", "sarah@example.com")];

  it("matches by email first", () => {
    const m = matchPersonToCategory({ name: "Ezra", email: "ezra@example.com" }, people);
    expect(m?.id).toBe("p1");
  });

  it("matches by exact name (case-insensitive) when no email", () => {
    const m = matchPersonToCategory({ name: "sarah st louis", email: undefined }, people);
    expect(m?.id).toBe("p2");
  });

  it("does not match a different person with the same-ish name", () => {
    const m = matchPersonToCategory({ name: "Ezra", email: "ezra@other.com" }, people);
    expect(m).toBeUndefined();
  });

  it("returns undefined when nobody matches", () => {
    const m = matchPersonToCategory({ name: "Nobody Here" }, people);
    expect(m).toBeUndefined();
  });

  it("matches by name for a person category without email", () => {
    const noEmail = [cat("p9", "Dr. Ezra")];
    const m = matchPersonToCategory({ name: "Dr. Ezra", email: "other@x.y" }, noEmail);
    expect(m?.id).toBe("p9");
  });
});

describe("shouldExtractPeople", () => {
  const manyPeople = (n: number) =>
    Array.from({ length: n }, (_, i) => cat(`p${i}`, `Namex${i}`, `namex${i}@example.com`));

  it("always extracts while still discovering the top people", () => {
    expect(shouldExtractPeople(email, "nothing relevant", [cat("p", "Solo", "s@x.y")])).toBe(true);
  });

  it("skips extraction when the top people are known and none appear", () => {
    expect(shouldExtractPeople(email, "newsletter about sales", manyPeople(10))).toBe(false);
  });

  it("extracts when a known person's name appears", () => {
    expect(shouldExtractPeople(email, "This is about Namex3 today", manyPeople(10))).toBe(true);
  });

  it("extracts when a known person's email appears", () => {
    expect(shouldExtractPeople(email, "cc namex7@example.com please", manyPeople(10))).toBe(true);
  });
});

describe("prompt builders", () => {
  it("classifySystemPrompt lists the topic names and asks for people", () => {
    const p = classifySystemPrompt(["Billing", "Sales"]);
    expect(p).toContain("1. Billing");
    expect(p).toContain("2. Sales");
    expect(p).toContain('"people"');
  });

  it("classifyUserPrompt carries the email, not the category list", () => {
    const p = classifyUserPrompt(email, "the body");
    expect(p).toContain("FROM: Front Desk <clinic@example.com>");
    expect(p).toContain("the body");
    expect(p).not.toContain("1. Billing");
  });

  it("peopleSystemPrompt asks about the body, not just the sender", () => {
    const p = peopleSystemPrompt();
    expect(p).toContain('{"people"');
    expect(p).toContain("Identify the people an email is ABOUT");
    expect(p).toContain("not just the From header");
  });

  it("peopleUserPrompt carries the email body", () => {
    const p = peopleUserPrompt(email, "The email is about Ezra.");
    expect(p).toContain("The email is about Ezra.");
    expect(p).toContain("SUBJECT: Doctor appointment");
  });
});