import { describe, expect, it } from "vitest";
import { collectBlockRefs, collectFlowRefs, computeSignature } from "./computed.js";

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
});

describe("collectFlowRefs", () => {
  it("collects unique flowRefs from call steps", () => {
    const refs = collectFlowRefs([
      { id: "a", action: "process", blockRef: "node-a" },
      { id: "v", action: "call", flowRef: "validate-all" },
    ]);
    expect(refs).toEqual(["validate-all"]);
  });
});
