import { describe, expect, it } from "vitest";
import { likeValue } from "./db";

describe("likeValue (search pattern escaping)", () => {
  it("wraps a plain term in wildcards", () => {
    expect(likeValue("hello")).toBe("%hello%");
  });

  it("trims surrounding whitespace", () => {
    expect(likeValue("  invoice  ")).toBe("%invoice%");
  });

  it("escapes LIKE wildcards so they're matched literally", () => {
    expect(likeValue("50%")).toBe("%50\\%%");
    expect(likeValue("a_b")).toBe("%a\\_b%");
    expect(likeValue("a\\b")).toBe("%a\\\\b%");
  });

  it("escapes a term that is only wildcards", () => {
    expect(likeValue("%_%")).toBe("%\\%\\_\\%%");
  });
});