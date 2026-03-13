import { describe, expect, it } from "vitest";
import { computeHash, hashL3 } from "./hash.js";

describe("computeHash", () => {
  it("produces consistent hash for same content", () => {
    const obj = { a: 1, b: "hello" };
    const h1 = computeHash(obj);
    const h2 = computeHash(obj);
    expect(h1).toBe(h2);
  });

  it("produces different hash for different content", () => {
    const h1 = computeHash({ a: 1 });
    const h2 = computeHash({ a: 2 });
    expect(h1).not.toBe(h2);
  });

  it("ignores contentHash field", () => {
    const h1 = computeHash({ a: 1, contentHash: "old" });
    const h2 = computeHash({ a: 1, contentHash: "new" });
    expect(h1).toBe(h2);
  });

  it("ignores source.hash field", () => {
    const h1 = computeHash({ a: 1, source: { type: "l4", ref: "x", hash: "old" } });
    const h2 = computeHash({ a: 1, source: { type: "l4", ref: "x", hash: "new" } });
    expect(h1).toBe(h2);
  });

  it("returns 16 char hex string", () => {
    const h = computeHash({ x: 42 });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("hashL3", () => {
  it("hashes L3Block fields", () => {
    const block = {
      id: "validate-order",
      name: "验证订单",
      input: [{ name: "request", type: "OrderRequest" }],
      output: [{ name: "result", type: "ValidationResult" }],
      validate: { "request.items": "array, min 1" },
      constraints: ["output.result.total >= 0"],
      description: "校验全部字段",
    };
    const h = hashL3(block);
    expect(h).toMatch(/^[0-9a-f]{16}$/);

    // same content → same hash
    expect(hashL3({ ...block })).toBe(h);

    // different content → different hash
    expect(hashL3({ ...block, description: "不同描述" })).not.toBe(h);
  });
});
