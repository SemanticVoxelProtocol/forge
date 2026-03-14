import { describe, expect, it } from "vitest";
import { err, ok, unwrap } from "./result.js";
import type { Result } from "./result.js";

// ── ok() ──

describe("ok()", () => {
  it("returns Ok with ok: true", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
  });

  it("carries the correct value", () => {
    const r = ok(42);
    expect(r.value).toBe(42);
  });

  it("works with string", () => {
    const r = ok("hello");
    expect(r.value).toBe("hello");
  });

  it("works with object", () => {
    const obj = { a: 1, b: "two" };
    const r = ok(obj);
    expect(r.value).toEqual(obj);
  });

  it("works with null", () => {
    const r = ok(null);
    expect(r.value).toBeNull();
  });

  it("works with void 0", () => {
    const r = ok(void 0);
    expect(r.value).toBeUndefined();
  });

  it("works with array", () => {
    const arr = [1, 2, 3];
    const r = ok(arr);
    expect(r.value).toEqual([1, 2, 3]);
  });
});

// ── err() ──

describe("err()", () => {
  it("returns Err with ok: false", () => {
    const r = err("oops");
    expect(r.ok).toBe(false);
  });

  it("carries the correct string error", () => {
    const r = err("something went wrong");
    expect(r.error).toBe("something went wrong");
  });

  it("works with Error objects", () => {
    const e = new Error("native error");
    const r = err(e);
    expect(r.error).toBe(e);
    expect(r.error.message).toBe("native error");
  });

  it("works with complex objects", () => {
    const detail = { code: 404, message: "not found" };
    const r = err(detail);
    expect(r.error).toEqual(detail);
  });

  it("works with number error", () => {
    const r = err(500);
    expect(r.error).toBe(500);
  });
});

// ── unwrap() ──

describe("unwrap()", () => {
  it("returns the value for Ok results", () => {
    const r: Result<number, string> = ok(99);
    expect(unwrap(r)).toBe(99);
  });

  it("returns a string value for Ok", () => {
    const r: Result<string, string> = ok("success");
    expect(unwrap(r)).toBe("success");
  });

  it("throws for Err results", () => {
    const r: Result<number, string> = err("bad input");
    expect(() => unwrap(r)).toThrow();
  });

  it("throws with message containing the string error", () => {
    const r: Result<number, string> = err("bad input");
    expect(() => unwrap(r)).toThrow("unwrap failed: bad input");
  });

  it("throws with stringified error for Error objects", () => {
    const e = new Error("native");
    const r: Result<number, Error> = err(e);
    expect(() => unwrap(r)).toThrow("unwrap failed: Error: native");
  });

  it("throws with stringified error for number errors", () => {
    const r: Result<number, number> = err(42);
    expect(() => unwrap(r)).toThrow("unwrap failed: 42");
  });

  it("throws with stringified error for object errors", () => {
    const r: Result<string, { code: number }> = err({ code: 500 });
    expect(() => unwrap(r)).toThrow("unwrap failed:");
  });
});

// ── type discrimination ──

describe("type discrimination via result.ok", () => {
  it("Ok result exposes value property", () => {
    const r = ok("data");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("data");
  });

  it("Err result exposes error property", () => {
    const r = err(404);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(404);
  });

  it("discriminates correctly when mapped over an array", () => {
    const results: Array<Result<string, string>> = [ok("hello"), err("oops")];
    const processed = results.map((r) => (r.ok ? `value: ${r.value}` : `error: ${r.error}`));
    expect(processed).toEqual(["value: hello", "error: oops"]);
  });
});
