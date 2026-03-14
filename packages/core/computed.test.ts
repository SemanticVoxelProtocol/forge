import { describe, expect, it } from "vitest";
import {
  collectBlockRefs,
  collectFlowRefs,
  computeSignature,
  resolveDataFlowType,
} from "./computed.js";
import type { Pin } from "./l3.js";

describe("computeSignature", () => {
  it("generates simple signature", () => {
    const sig = computeSignature(
      "validate-order",
      [{ name: "request", type: "OrderRequest" }],
      [{ name: "result", type: "ValidationResult" }],
    );
    expect(sig).toBe("validateOrder(request: OrderRequest): ValidationResult");
  });

  it("handles optional params", () => {
    const sig = computeSignature(
      "validate-order",
      [
        { name: "request", type: "OrderRequest" },
        { name: "options", type: "ValidateOptions", optional: true },
      ],
      [{ name: "result", type: "ValidationResult" }],
    );
    expect(sig).toBe(
      "validateOrder(request: OrderRequest, options?: ValidateOptions): ValidationResult",
    );
  });

  it("handles void return", () => {
    const sig = computeSignature("send-email", [{ name: "to", type: "string" }], []);
    expect(sig).toBe("sendEmail(to: string): void");
  });

  it("handles multiple outputs", () => {
    const sig = computeSignature(
      "split-data",
      [{ name: "data", type: "RawData" }],
      [
        { name: "valid", type: "ValidData" },
        { name: "errors", type: "ErrorList" },
      ],
    );
    expect(sig).toBe("splitData(data: RawData): { valid: ValidData; errors: ErrorList }");
  });

  it("handles no input params", () => {
    const sig = computeSignature("foo", [], [{ name: "x", type: "T" }]);
    expect(sig).toBe("foo(): T");
  });

  it("handles multiple input params", () => {
    const sig = computeSignature(
      "create-order",
      [
        { name: "userId", type: "string" },
        { name: "items", type: "Item[]" },
        { name: "coupon", type: "Coupon" },
      ],
      [{ name: "order", type: "Order" }],
    );
    expect(sig).toBe("createOrder(userId: string, items: Item[], coupon: Coupon): Order");
  });

  it("handles all optional params", () => {
    const sig = computeSignature(
      "search",
      [
        { name: "query", type: "string", optional: true },
        { name: "limit", type: "number", optional: true },
      ],
      [{ name: "results", type: "Result[]" }],
    );
    expect(sig).toBe("search(query?: string, limit?: number): Result[]");
  });

  it("handles mixed optional and required params", () => {
    const sig = computeSignature(
      "fetch-page",
      [
        { name: "url", type: "string" },
        { name: "timeout", type: "number", optional: true },
        { name: "headers", type: "Headers", optional: true },
      ],
      [{ name: "page", type: "Page" }],
    );
    expect(sig).toBe("fetchPage(url: string, timeout?: number, headers?: Headers): Page");
  });

  it("handles kebab-case id with 3+ segments", () => {
    const sig = computeSignature(
      "validate-all-orders",
      [{ name: "orders", type: "Order[]" }],
      [{ name: "report", type: "Report" }],
    );
    expect(sig).toBe("validateAllOrders(orders: Order[]): Report");
  });

  it("handles single-word id with no hyphens", () => {
    const sig = computeSignature(
      "validate",
      [{ name: "input", type: "Input" }],
      [{ name: "ok", type: "boolean" }],
    );
    expect(sig).toBe("validate(input: Input): boolean");
  });

  it("handles multiple outputs with 3+ items", () => {
    const sig = computeSignature(
      "parse-csv",
      [{ name: "raw", type: "string" }],
      [
        { name: "headers", type: "string[]" },
        { name: "rows", type: "Row[]" },
        { name: "errors", type: "ParseError[]" },
      ],
    );
    expect(sig).toBe(
      "parseCsv(raw: string): { headers: string[]; rows: Row[]; errors: ParseError[] }",
    );
  });

  it("handles pin with empty type string", () => {
    const sig = computeSignature("noop", [{ name: "x", type: "" }], [{ name: "y", type: "" }]);
    expect(sig).toBe("noop(x: ): ");
  });

  it("handles empty id string", () => {
    const sig = computeSignature("", [{ name: "a", type: "A" }], [{ name: "b", type: "B" }]);
    expect(sig).toBe("(a: A): B");
  });
});

describe("collectBlockRefs", () => {
  it("collects unique blockRefs from steps", () => {
    const refs = collectBlockRefs([
      { id: "a", action: "process", blockRef: "node-a" },
      { id: "b", action: "process", blockRef: "node-b" },
      { id: "p", action: "parallel", branches: ["a", "b"] },
    ]);
    expect(refs).toEqual(["node-a", "node-b"]);
  });

  it("returns empty array for empty steps", () => {
    expect(collectBlockRefs([])).toEqual([]);
  });

  it("returns empty array when no steps have blockRef", () => {
    const refs = collectBlockRefs([
      { id: "p", action: "parallel", branches: ["a", "b"] },
      { id: "w", action: "wait", waitFor: ["a"] },
    ]);
    expect(refs).toEqual([]);
  });

  it("deduplicates blockRefs across steps", () => {
    const refs = collectBlockRefs([
      { id: "a", action: "process", blockRef: "node-x" },
      { id: "b", action: "process", blockRef: "node-x" },
      { id: "c", action: "process", blockRef: "node-y" },
    ]);
    expect(refs).toEqual(["node-x", "node-y"]);
  });

  it("handles single step with blockRef", () => {
    const refs = collectBlockRefs([{ id: "a", action: "process", blockRef: "node-only" }]);
    expect(refs).toEqual(["node-only"]);
  });

  it("collects only steps that have blockRef (mixed steps)", () => {
    const refs = collectBlockRefs([
      { id: "a", action: "process", blockRef: "node-a" },
      { id: "p", action: "parallel", branches: ["a"] },
      { id: "b", action: "process", blockRef: "node-b" },
      { id: "w", action: "wait", waitFor: ["a"] },
    ]);
    expect(refs).toEqual(["node-a", "node-b"]);
  });

  it("preserves insertion order of first occurrence", () => {
    const refs = collectBlockRefs([
      { id: "c", action: "process", blockRef: "node-c" },
      { id: "a", action: "process", blockRef: "node-a" },
      { id: "b", action: "process", blockRef: "node-b" },
      { id: "c2", action: "process", blockRef: "node-c" },
    ]);
    expect(refs).toEqual(["node-c", "node-a", "node-b"]);
  });

  it("does not collect call steps that have only flowRef", () => {
    const refs = collectBlockRefs([{ id: "v", action: "call", flowRef: "some-flow" }]);
    expect(refs).toEqual([]);
  });
});

describe("collectFlowRefs", () => {
  it("collects unique flowRefs from call steps", () => {
    const refs = collectFlowRefs([
      { id: "a", action: "process", blockRef: "node-a" },
      { id: "v", action: "call", flowRef: "validate-all" },
    ]);
    expect(refs).toEqual(["validate-all"]);
  });

  it("returns empty array for empty steps", () => {
    expect(collectFlowRefs([])).toEqual([]);
  });

  it("returns empty array when no steps have flowRef", () => {
    const refs = collectFlowRefs([
      { id: "a", action: "process", blockRef: "node-a" },
      { id: "p", action: "parallel", branches: ["a"] },
    ]);
    expect(refs).toEqual([]);
  });

  it("deduplicates flowRefs across steps", () => {
    const refs = collectFlowRefs([
      { id: "x", action: "call", flowRef: "sub-flow" },
      { id: "y", action: "call", flowRef: "sub-flow" },
      { id: "z", action: "call", flowRef: "other-flow" },
    ]);
    expect(refs).toEqual(["sub-flow", "other-flow"]);
  });

  it("collects multiple call steps with different flowRefs", () => {
    const refs = collectFlowRefs([
      { id: "a", action: "call", flowRef: "flow-a" },
      { id: "b", action: "call", flowRef: "flow-b" },
      { id: "c", action: "call", flowRef: "flow-c" },
    ]);
    expect(refs).toEqual(["flow-a", "flow-b", "flow-c"]);
  });

  it("does not collect process steps that have only blockRef", () => {
    const refs = collectFlowRefs([
      { id: "a", action: "process", blockRef: "node-a" },
      { id: "b", action: "process", blockRef: "node-b" },
    ]);
    expect(refs).toEqual([]);
  });
});

describe("resolveDataFlowType", () => {
  it("returns pin type when findPin resolves the ref", () => {
    const pin = { name: "result", type: "OrderResult" };
    const result = resolveDataFlowType({ from: "step-a.result", to: "step-b.input" }, () => pin);
    expect(result).toBe("OrderResult");
  });

  it("returns undefined when findPin returns undefined", () => {
    const result = resolveDataFlowType(
      { from: "step-a.missing", to: "step-b.input" },
      (): Pin | undefined => {
        return;
      },
    );
    expect(result).toBeUndefined();
  });

  it("passes dataFlow.from to findPin as the ref", () => {
    let capturedRef: string | undefined;
    resolveDataFlowType({ from: "step-x.output", to: "step-y.input" }, (ref): Pin | undefined => {
      capturedRef = ref;
      return;
    });
    expect(capturedRef).toBe("step-x.output");
  });

  it("returns empty string when pin has empty type", () => {
    const result = resolveDataFlowType({ from: "step-a.x", to: "step-b.y" }, () => ({
      name: "x",
      type: "",
    }));
    expect(result).toBe("");
  });

  it("handles multiple calls with different dataFlows independently", () => {
    const pinMap: Record<string, { name: string; type: string }> = {
      "a.out": { name: "out", type: "TypeA" },
      "b.out": { name: "out", type: "TypeB" },
    };
    const findPin = (ref: string) => pinMap[ref];

    expect(resolveDataFlowType({ from: "a.out", to: "c.in" }, findPin)).toBe("TypeA");
    expect(resolveDataFlowType({ from: "b.out", to: "c.in" }, findPin)).toBe("TypeB");
    expect(resolveDataFlowType({ from: "missing.out", to: "c.in" }, findPin)).toBeUndefined();
  });
});
