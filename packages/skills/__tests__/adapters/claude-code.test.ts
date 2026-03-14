import { describe, expect, it } from "vitest";
import { claudeCodeAdapter } from "../../adapters/claude-code.js";
import type { CompileTask } from "../../../core/compile-plan.js";
import type { L3Block } from "../../../core/l3.js";
import type { L4Flow } from "../../../core/l4.js";
import type { L5Blueprint } from "../../../core/l5.js";
import type { SkillInput, SkillConfig, ResolvedContext } from "../../../core/skill.js";

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

function makeL3(): L3Block {
  return {
    id: "test-block",
    name: "Test Block",
    input: [{ name: "request", type: "TestInput" }],
    output: [{ name: "result", type: "TestOutput" }],
    validate: { request: "required" },
    constraints: ["output must be valid"],
    description: "A test block",
    contentHash: "l3-hash",
    revision: baseRevision,
  };
}

function makeL5(): L5Blueprint {
  return {
    id: "test-project",
    name: "Test Project",
    version: "0.1.0",
    intent: "Test intent",
    constraints: [],
    domains: [],
    integrations: [],
    contentHash: "l5-hash",
    revision: baseRevision,
  };
}

function makeInput(action: CompileTask["action"]): SkillInput {
  const task: CompileTask = {
    action,
    targetLayer: "l2",
    targetId: "test-block",
    reason: `${action} test-block`,
    issueCode: "TEST",
    context: [],
  };
  return {
    task,
    resolved: { l5: makeL5(), l3: makeL3() },
    config: defaultConfig,
  };
}

describe("claudeCodeAdapter", () => {
  it("has correct name", () => {
    expect(claudeCodeAdapter.name).toBe("claude-code");
  });

  it("creates registry with 4 skills", () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    expect(registry.size).toBe(4);
    expect(registry.has("compile")).toBe(true);
    expect(registry.has("recompile")).toBe(true);
    expect(registry.has("review")).toBe(true);
    expect(registry.has("update-ref")).toBe(true);
  });

  it.each(["compile", "recompile", "review", "update-ref"] as const)(
    "%s skill returns needs-review with prompt in notes",
    async (action) => {
      const registry = claudeCodeAdapter.createSkillRegistry();
      const skill = registry.get(action);
      expect(skill).toBeDefined();

      const result = await skill!.execute(makeInput(action));

      expect(result.action).toBe(action);
      expect(result.status).toBe("needs-review");
      expect(result.artifacts).toEqual([]);
      expect(result.notes).toContain("# ");
      expect(result.notes).toContain("## Context");
      expect(result.notes).toContain("## Task");
      expect(result.notes).toContain("## Input");
      expect(result.notes).toContain("## Rules");
    },
  );

  it("compile skill prompt includes L3 contract details", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("compile")!;
    const result = await skill.execute(makeInput("compile"));

    expect(result.notes).toContain("test-block");
    expect(result.notes).toContain("TestInput");
    expect(result.notes).toContain("TestOutput");
  });
});

// ── Additional tests ──

function makeInputWithResolved(
  action: CompileTask["action"],
  resolved: ResolvedContext,
): SkillInput {
  const task: CompileTask = {
    action,
    targetLayer: "l2",
    targetId: "test-block",
    reason: `${action} test-block`,
    issueCode: "TEST",
    context: [],
  };
  return { task, resolved, config: defaultConfig };
}

function makeL4Flow(): L4Flow {
  return {
    kind: "flow",
    id: "test-flow",
    name: "Test Flow",
    steps: [{ id: "s1", action: "process", blockRef: "test-block", next: null }],
    dataFlows: [],
    contentHash: "l4-hash",
    revision: {
      rev: 1,
      parentRev: null,
      source: { type: "init" as const },
      timestamp: "2024-01-01T00:00:00.000Z",
    },
  };
}

describe("claudeCodeAdapter — compile vs recompile prompt content", () => {
  it("compile and recompile skill prompts differ in role text", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const compileSkill = registry.get("compile")!;
    const recompileSkill = registry.get("recompile")!;

    const compileResult = await compileSkill.execute(makeInput("compile"));
    const recompileResult = await recompileSkill.execute(makeInput("recompile"));

    expect(compileResult.notes).not.toBe(recompileResult.notes);
    expect(compileResult.notes).toContain("compiler subagent");
    expect(recompileResult.notes).toContain("recompiler subagent");
  });
});

describe("claudeCodeAdapter — review skill", () => {
  it("always returns status needs-review", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("review")!;
    const result = await skill.execute(makeInput("review"));

    expect(result.status).toBe("needs-review");
  });
});

describe("claudeCodeAdapter — update-ref skill", () => {
  it("returns action update-ref in result", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("update-ref")!;
    const result = await skill.execute(makeInput("update-ref"));

    expect(result.action).toBe("update-ref");
  });
});

describe("claudeCodeAdapter — empty resolved context", () => {
  it("compile skill handles empty resolved context without throwing", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("compile")!;
    const input = makeInputWithResolved("compile", {});
    const result = await skill.execute(input);

    expect(result.status).toBe("needs-review");
    expect(result.notes).toContain("No project-level context available.");
  });

  it("recompile skill handles empty resolved context without throwing", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("recompile")!;
    const input = makeInputWithResolved("recompile", {});
    const result = await skill.execute(input);

    expect(result.status).toBe("needs-review");
  });
});

describe("claudeCodeAdapter — compile skill with L4 context", () => {
  it("includes L4 flow name in prompt when L4 is provided", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("compile")!;
    const input = makeInputWithResolved("compile", {
      l5: makeL5(),
      l3: makeL3(),
      l4: makeL4Flow(),
    });
    const result = await skill.execute(input);

    // L3 detail view is called with the L4 flow, so flow id should appear
    expect(result.notes).toContain("test-flow");
  });

  it("prompt without L4 does not contain flow label", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("compile")!;
    const input = makeInputWithResolved("compile", { l5: makeL5(), l3: makeL3() });
    const result = await skill.execute(input);

    // Still succeeds without L4
    expect(result.status).toBe("needs-review");
    expect(result.notes).toContain("test-block");
  });
});

describe("claudeCodeAdapter — all skills return empty artifacts", () => {
  it.each(["compile", "recompile", "review", "update-ref"] as const)(
    "%s skill returns empty artifacts array",
    async (action) => {
      const registry = claudeCodeAdapter.createSkillRegistry();
      const skill = registry.get(action)!;
      const result = await skill.execute(makeInput(action));

      expect(result.artifacts).toEqual([]);
    },
  );
});

describe("claudeCodeAdapter — L5 overview in prompt", () => {
  it("compile prompt includes L5 project name when L5 provided", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("compile")!;
    const result = await skill.execute(makeInput("compile"));

    // makeInput includes l5 with name "Test Project"
    expect(result.notes).toContain("Test Project");
    expect(result.notes).toContain("Test intent");
  });

  it("recompile prompt includes L5 overview when L5 provided", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("recompile")!;
    const result = await skill.execute(makeInput("recompile"));

    expect(result.notes).toContain("Test Project");
  });

  it("prompt omits L5 overview section when no L5 in resolved context", async () => {
    const registry = claudeCodeAdapter.createSkillRegistry();
    const skill = registry.get("compile")!;
    const input = makeInputWithResolved("compile", { l3: makeL3() });
    const result = await skill.execute(input);

    expect(result.notes).not.toContain("Test Project");
    expect(result.notes).toContain("No project-level context available.");
  });
});
