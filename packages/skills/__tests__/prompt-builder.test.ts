import { describe, expect, it } from "vitest";
import { buildPrompt, renderPrompt } from "../prompt-builder.js";
import type { CompileTask } from "../../core/compile-plan.js";
import type { L2CodeBlock } from "../../core/l2.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Flow } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";
import type { SkillInput, ResolvedContext, SkillConfig } from "../../core/skill.js";
import type { RefFile } from "../../core/store.js";

const baseRevision = {
  rev: 1,
  parentRev: null as number | null,
  source: { type: "init" as const },
  timestamp: "2024-01-01T00:00:00.000Z",
};

const defaultConfig: SkillConfig = {
  maxFilesToCreate: 10,
  maxFilesToModify: 20,
  dryRun: false,
  requireHumanApproval: false,
};

function makeL5(): L5Blueprint {
  return {
    id: "test-project",
    name: "Test Project",
    version: "0.1.0",
    intent: "A test project for prompt builder",
    constraints: ["Must be fast"],
    domains: [{ name: "core", description: "Core domain", dependencies: [] }],
    integrations: [],
    contentHash: "l5-hash",
    revision: baseRevision,
  };
}

function makeL3(id = "validate-order"): L3Block {
  return {
    id,
    name: "验证订单",
    input: [{ name: "request", type: "OrderRequest" }],
    output: [{ name: "result", type: "ValidationResult" }],
    validate: { request: "required" },
    constraints: ["output.result.valid iff errors is empty"],
    description: "逐项校验所有字段",
    contentHash: "l3-hash",
    revision: baseRevision,
  };
}

function makeL4(): L4Flow {
  return {
    id: "order-flow",
    name: "Order Flow",
    steps: [{ id: "s1", action: "process", blockRef: "validate-order", next: null }],
    dataFlows: [],
    contentHash: "l4-hash",
    revision: baseRevision,
  };
}

function makeL2(): L2CodeBlock {
  return {
    id: "validate-order",
    blockRef: "validate-order",
    language: "typescript",
    files: ["src/validate-order.ts"],
    sourceHash: "l3-hash",
    contentHash: "l2-hash",
    revision: baseRevision,
  };
}

function makeInput(action: CompileTask["action"], resolved: ResolvedContext): SkillInput {
  const task: CompileTask = {
    action,
    targetLayer: "l2",
    targetId: "validate-order",
    reason: `${action} validate-order`,
    issueCode: "TEST",
    context: [],
    complexity: action === "update-ref" ? "light" : "standard",
  };
  return { task, resolved, config: defaultConfig };
}

describe("buildPrompt", () => {
  it("builds compile prompt with L3 and L5 context", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
      l4: makeL4(),
    });

    const prompt = buildPrompt(input);

    expect(prompt.role).toContain("compiler");
    expect(prompt.context).toContain("Test Project");
    expect(prompt.task).toContain("compile");
    expect(prompt.input).toContain("validate-order");
    expect(prompt.input).toContain("OrderRequest");
    expect(prompt.outputSpec).toContain("forge link");
    expect(prompt.rules).toContain("downward only");
  });

  it("builds recompile prompt with L3, L2, and L1 files", () => {
    const input = makeInput("recompile", {
      l3: makeL3(),
      l2: makeL2(),
      l4: makeL4(),
      l1Files: [{ path: "src/validate-order.ts", content: "export function validate() {}" }],
    });

    const prompt = buildPrompt(input);

    expect(prompt.role).toContain("recompiler");
    expect(prompt.input).toContain("L3 Contract");
    expect(prompt.input).toContain("Current L2 Mapping");
    expect(prompt.input).toContain("Current L1 Source Files");
    expect(prompt.input).toContain("export function validate");
  });

  it("builds review prompt with L3, L2, and L1", () => {
    const input = makeInput("review", {
      l3: makeL3(),
      l2: makeL2(),
      l1Files: [{ path: "src/validate-order.ts", content: "// drifted code" }],
    });

    const prompt = buildPrompt(input);

    expect(prompt.role).toContain("review");
    expect(prompt.input).toContain("L3 Contract");
    expect(prompt.input).toContain("L2 Mapping");
    expect(prompt.input).toContain("drifted code");
    expect(prompt.outputSpec).toContain("Do NOT make changes");
  });

  it("builds update-ref prompt with L4 context", () => {
    const input = makeInput("update-ref", {
      l4: makeL4(),
      l5: makeL5(),
    });

    const prompt = buildPrompt(input);

    expect(prompt.role).toContain("reference repair");
    expect(prompt.input).toContain("order-flow");
    expect(prompt.outputSpec).toContain("missing L3");
  });

  it("handles missing context gracefully", () => {
    const input = makeInput("compile", {});
    const prompt = buildPrompt(input);

    expect(prompt.context).toContain("No project-level context");
    expect(prompt.input).toBe("");
  });

  it("includes Documentation section when docs is provided (compile)", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
      l4: makeL4(),
      docs: "## Intent\nValidate all order fields.\n\n## Edge Cases\n- Empty items array",
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("### Documentation");
    expect(prompt.input).toContain("## Intent");
    expect(prompt.input).toContain("Empty items array");
  });

  it("includes Documentation section when docs is provided (recompile)", () => {
    const input = makeInput("recompile", {
      l3: makeL3(),
      l2: makeL2(),
      l4: makeL4(),
      l1Files: [{ path: "src/validate-order.ts", content: "export function validate() {}" }],
      docs: "## Error Strategy\nCollect all errors before returning.",
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("### Documentation");
    expect(prompt.input).toContain("Collect all errors");
  });

  it("includes Documentation section when docs is provided (review)", () => {
    const input = makeInput("review", {
      l3: makeL3(),
      l2: makeL2(),
      l1Files: [{ path: "src/validate-order.ts", content: "// drifted code" }],
      docs: "## Integration Notes\nUpstream sends raw HTTP body.",
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("### Documentation");
    expect(prompt.input).toContain("Upstream sends raw HTTP body");
  });

  it("does not include Documentation section when docs is absent", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
      l4: makeL4(),
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).not.toContain("### Documentation");
  });

  it("compile output spec mentions Documentation", () => {
    const input = makeInput("compile", { l3: makeL3() });
    const prompt = buildPrompt(input);

    expect(prompt.outputSpec).toContain("Documentation");
  });

  it("includes complexity from task", () => {
    const input = makeInput("compile", { l3: makeL3() });
    const prompt = buildPrompt(input);

    expect(prompt.complexity).toBe("standard");
  });

  it("passes light complexity for update-ref", () => {
    const input = makeInput("update-ref", { l4: makeL4(), l5: makeL5() });
    const prompt = buildPrompt(input);

    expect(prompt.complexity).toBe("light");
  });
});

describe("buildPrompt — language directive", () => {
  it("includes language directive in rules when L5 has language 'zh'", () => {
    const l5WithZh: ReturnType<typeof makeL5> = {
      ...makeL5(),
      language: "zh",
    };
    const input = makeInput("compile", {
      l5: l5WithZh,
      l3: makeL3(),
    });

    const prompt = buildPrompt(input);

    expect(prompt.rules).toContain("Chinese");
  });

  it("does not include language directive in rules when L5 has language 'en'", () => {
    const l5WithEn: ReturnType<typeof makeL5> = {
      ...makeL5(),
      language: "en",
    };
    const input = makeInput("compile", {
      l5: l5WithEn,
      l3: makeL3(),
    });

    const prompt = buildPrompt(input);

    expect(prompt.rules).not.toContain("IMPORTANT: All human-readable text");
  });
});

describe("renderPrompt", () => {
  it("renders all sections as markdown", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
    });

    const prompt = buildPrompt(input);
    const md = renderPrompt(prompt);

    expect(md).toContain("# You are an SVP compiler");
    expect(md).toContain("## Context");
    expect(md).toContain("## Task");
    expect(md).toContain("## Input");
    expect(md).toContain("## Output Spec");
    expect(md).toContain("## Rules");
  });

  it("prepends YAML front-matter with complexity", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
    });

    const prompt = buildPrompt(input);
    const md = renderPrompt(prompt);

    expect(md).toMatch(/^---\ncomplexity: standard\n---/);
  });

  it("renders light complexity for update-ref", () => {
    const input = makeInput("update-ref", {
      l4: makeL4(),
      l5: makeL5(),
    });

    const prompt = buildPrompt(input);
    const md = renderPrompt(prompt);

    expect(md).toMatch(/^---\ncomplexity: light\n---/);
  });

  it("produces non-empty sections", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
    });

    const prompt = buildPrompt(input);
    const md = renderPrompt(prompt);

    // Each section should have content after the header
    const sections = md.split(/^## /m);
    for (const section of sections.slice(1)) {
      expect(section.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("buildPrompt — refs", () => {
  const textRef: RefFile = {
    name: "algorithm.md",
    path: "nodes/validate-order/refs/algorithm.md",
    isText: true,
    content: "# Luhn Check\nUse mod 10 algorithm",
  };

  const binaryRef: RefFile = {
    name: "design.png",
    path: "nodes/validate-order/refs/design.png",
    isText: false,
  };

  const tsRef: RefFile = {
    name: "reference.ts",
    path: "nodes/validate-order/refs/reference.ts",
    isText: true,
    content: "export function validate(n: number): boolean { return true; }",
  };

  it("compile prompt includes Reference Materials when refs present", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
      l4: makeL4(),
      refs: [textRef, binaryRef],
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("### Reference Materials");
    expect(prompt.input).toContain("#### algorithm.md");
    expect(prompt.input).toContain("Luhn Check");
  });

  it("compile prompt omits Reference Materials when refs is empty", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
      l4: makeL4(),
      refs: [],
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).not.toContain("Reference Materials");
  });

  it("compile prompt omits Reference Materials when refs is undefined", () => {
    const input = makeInput("compile", {
      l5: makeL5(),
      l3: makeL3(),
      l4: makeL4(),
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).not.toContain("Reference Materials");
  });

  it("text refs are inlined with content", () => {
    const input = makeInput("compile", {
      l3: makeL3(),
      refs: [tsRef],
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("#### reference.ts");
    expect(prompt.input).toContain("export function validate");
    expect(prompt.input).toContain("```ts");
  });

  it("binary refs show path instead of content", () => {
    const input = makeInput("compile", {
      l3: makeL3(),
      refs: [binaryRef],
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("#### design.png (binary)");
    expect(prompt.input).toContain("File path: nodes/validate-order/refs/design.png");
  });

  it("recompile prompt includes refs", () => {
    const input = makeInput("recompile", {
      l3: makeL3(),
      l2: makeL2(),
      l4: makeL4(),
      l1Files: [{ path: "src/validate-order.ts", content: "export function validate() {}" }],
      refs: [textRef],
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("### Reference Materials");
    expect(prompt.input).toContain("Luhn Check");
  });

  it("review prompt includes refs", () => {
    const input = makeInput("review", {
      l3: makeL3(),
      l2: makeL2(),
      l1Files: [{ path: "src/validate-order.ts", content: "// code" }],
      refs: [textRef],
    });

    const prompt = buildPrompt(input);

    expect(prompt.input).toContain("### Reference Materials");
    expect(prompt.input).toContain("Luhn Check");
  });
});
