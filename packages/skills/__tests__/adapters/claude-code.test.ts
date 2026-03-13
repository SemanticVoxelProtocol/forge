import { describe, expect, it } from "vitest";
import { claudeCodeAdapter } from "../../adapters/claude-code.js";
import type { CompileTask } from "../../../core/compile-plan.js";
import type { L3Block } from "../../../core/l3.js";
import type { L5Blueprint } from "../../../core/l5.js";
import type { SkillInput, SkillConfig } from "../../../core/skill.js";

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
