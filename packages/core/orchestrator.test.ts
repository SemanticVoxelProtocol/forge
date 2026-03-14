// orchestrator.ts 单元测试

import { describe, it, expect, vi } from "vitest";
import { hashL3, hashL2 } from "./hash.js";
import {
  runOrchestrator,
  type ContextResolver,
  type OrchestratorConfig,
  type TaskExecution,
} from "./orchestrator.js";
import { DEFAULT_SKILL_CONFIG, REVIEW_SKILL_CONFIG, createSkillRegistry } from "./skill.js";
import type { CheckInput } from "./check.js";
import type { L2CodeBlock } from "./l2.js";
import type { L3Block } from "./l3.js";
import type { Skill, SkillInput, SkillResult, SkillRegistry } from "./skill.js";
import type { ArtifactVersion } from "./version.js";

// ── fixtures ──

const REV1: ArtifactVersion = {
  rev: 1,
  parentRev: null,
  source: { type: "init" },
  timestamp: "2024-01-01T00:00:00Z",
};

function makeL3(id: string, name = "Block"): L3Block {
  const base = {
    id,
    name,
    input: [{ name: "req", type: "Req" }],
    output: [{ name: "res", type: "Res" }],
    validate: {},
    constraints: [],
    description: `${name} logic`,
  };
  return { ...base, revision: REV1, contentHash: hashL3(base) };
}

function makeL2(l3: L3Block): L2CodeBlock {
  const base = {
    id: l3.id,
    blockRef: l3.id,
    language: "typescript",
    files: [`src/${l3.id}.ts`],
  };
  return { ...base, revision: REV1, sourceHash: l3.contentHash, contentHash: hashL2(base) };
}

/** CheckInput where compilePlan returns empty tasks (everything in sync). */
function cleanInput(l3: L3Block): CheckInput {
  const l2 = makeL2(l3);
  return { l4Flows: [], l3Blocks: [l3], l2Blocks: [l2] };
}

/** CheckInput where compilePlan returns at least one "compile" task (L3 without L2). */
function dirtyInput(l3: L3Block): CheckInput {
  return { l4Flows: [], l3Blocks: [l3], l2Blocks: [] };
}

/** A resolved context stub returned by every resolver.resolve call. */
const RESOLVED_CTX = {};

function makeResolver(): ContextResolver {
  return {
    resolve: vi.fn().mockResolvedValue(RESOLVED_CTX),
  };
}

function makeSkillResult(status: "done" | "needs-review" | "blocked" = "done"): SkillResult {
  return { action: "compile", status, artifacts: [], notes: "" };
}

function makeSkill(
  action: Skill["action"],
  status: "done" | "needs-review" | "blocked" = "done",
): Skill {
  return {
    action,
    execute: vi.fn().mockResolvedValue(makeSkillResult(status)),
  };
}

function makeRegistry(...skills: Skill[]): SkillRegistry {
  return createSkillRegistry(skills);
}

// ── tests ──

describe("runOrchestrator", () => {
  // 1. Immediate convergence
  it("converges immediately when compilePlan produces no tasks", async () => {
    const l3 = makeL3("auth");
    const input = cleanInput(l3);

    const result = await runOrchestrator(
      vi.fn().mockResolvedValue(input),
      makeRegistry(),
      makeResolver(),
      vi.fn(),
    );

    expect(result.converged).toBe(true);
    expect(result.iterations).toEqual([]);
    expect(result.totalTasksExecuted).toBe(0);
  });

  // 2. Convergence after iterations
  it("converges after second iteration when applyResult fixes the issue", async () => {
    const l3 = makeL3("auth");
    const dirty = dirtyInput(l3);
    const clean = cleanInput(l3);

    // First call: has tasks; second call: no tasks
    const loadInput = vi.fn().mockResolvedValueOnce(dirty).mockResolvedValueOnce(clean);
    const compileSkill = makeSkill("compile", "done");

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      vi.fn(),
    );

    expect(result.converged).toBe(true);
    expect(result.iterations).toHaveLength(1);
    expect(result.totalTasksExecuted).toBe(1);
    expect(loadInput).toHaveBeenCalledTimes(2);
  });

  // 3. maxIterations exhaustion
  it("returns converged: false after exhausting maxIterations", async () => {
    const l3 = makeL3("auth");
    const dirty = dirtyInput(l3);
    const loadInput = vi.fn().mockResolvedValue(dirty);
    const compileSkill = makeSkill("compile", "done");
    const config: OrchestratorConfig = { maxIterations: 3 };

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      vi.fn(),
      config,
    );

    expect(result.converged).toBe(false);
    expect(result.iterations).toHaveLength(3);
    // loadInput is called at the start of each iteration (3 dirty) + would be called once more
    // but loop ends; so 3 calls.
    expect(loadInput).toHaveBeenCalledTimes(3);
  });

  // 4. All tasks blocked → early exit
  it("exits early when all executions are blocked", async () => {
    const l3 = makeL3("auth");
    const dirty = dirtyInput(l3);
    const loadInput = vi.fn().mockResolvedValue(dirty);
    const compileSkill = makeSkill("compile", "blocked");
    const config: OrchestratorConfig = { maxIterations: 5 };

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      vi.fn(),
      config,
    );

    expect(result.converged).toBe(false);
    // Stopped after first iteration (all blocked), not 5
    expect(result.iterations).toHaveLength(1);
    expect(result.iterations[0].executions[0].result.status).toBe("blocked");
  });

  // 5. No skill registered for action
  it("pushes error when no skill is registered for the task action", async () => {
    const l3 = makeL3("auth");
    const dirty = dirtyInput(l3);
    // Empty registry — no "compile" skill
    const loadInput = vi.fn().mockResolvedValueOnce(dirty).mockResolvedValue(cleanInput(l3));

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(), // empty
      makeResolver(),
      vi.fn(),
    );

    expect(result.iterations[0].errors).toHaveLength(1);
    expect(result.iterations[0].errors[0]).toContain("compile");
    expect(result.iterations[0].executions).toHaveLength(0);
  });

  // 6. Skill throws exception
  it("catches skill exceptions and adds error message to errors array", async () => {
    const l3 = makeL3("auth");
    const dirty = dirtyInput(l3);
    const loadInput = vi.fn().mockResolvedValueOnce(dirty).mockResolvedValue(cleanInput(l3));

    const throwingSkill: Skill = {
      action: "compile",
      execute: vi.fn().mockRejectedValue(new Error("AI exploded")),
    };

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(throwingSkill),
      makeResolver(),
      vi.fn(),
    );

    expect(result.iterations[0].errors).toHaveLength(1);
    expect(result.iterations[0].errors[0]).toContain("AI exploded");
    // Exception path — no executions
    expect(result.iterations[0].executions).toHaveLength(0);
  });

  // 7. dryRun: true — applyResult NOT called
  it("does not call applyResult when dryRun is true", async () => {
    const l3 = makeL3("auth");
    const loadInput = vi
      .fn()
      .mockResolvedValueOnce(dirtyInput(l3))
      .mockResolvedValue(cleanInput(l3));
    const applyResult = vi.fn();
    const compileSkill = makeSkill("compile", "done");
    const config: OrchestratorConfig = {
      maxIterations: 5,
      skillConfigs: { compile: { ...DEFAULT_SKILL_CONFIG, dryRun: true } },
    };

    await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      applyResult,
      config,
    );

    expect(applyResult).not.toHaveBeenCalled();
  });

  // 8. dryRun: false + status "done" — applyResult IS called
  it("calls applyResult when dryRun is false and status is done", async () => {
    const l3 = makeL3("auth");
    const loadInput = vi
      .fn()
      .mockResolvedValueOnce(dirtyInput(l3))
      .mockResolvedValue(cleanInput(l3));
    const applyResult = vi.fn().mockResolvedValue(void 0);
    const compileSkill = makeSkill("compile", "done");

    await runOrchestrator(loadInput, makeRegistry(compileSkill), makeResolver(), applyResult);

    expect(applyResult).toHaveBeenCalledTimes(1);
    const arg = applyResult.mock.calls[0][0] as TaskExecution;
    expect(arg.result.status).toBe("done");
  });

  // 9. dryRun: false + status "needs-review" — applyResult NOT called
  it("does not call applyResult when status is needs-review", async () => {
    const l3 = makeL3("auth");
    const loadInput = vi
      .fn()
      .mockResolvedValueOnce(dirtyInput(l3))
      .mockResolvedValue(cleanInput(l3));
    const applyResult = vi.fn();
    const needsReviewSkill = makeSkill("compile", "needs-review");

    await runOrchestrator(loadInput, makeRegistry(needsReviewSkill), makeResolver(), applyResult);

    expect(applyResult).not.toHaveBeenCalled();
  });

  // 10. skillConfigs override by action key
  it("uses skillConfigs override config for the matching action", async () => {
    const l3 = makeL3("auth");
    const loadInput = vi
      .fn()
      .mockResolvedValueOnce(dirtyInput(l3))
      .mockResolvedValue(cleanInput(l3));
    const customConfig = {
      maxFilesToCreate: 1,
      maxFilesToModify: 2,
      dryRun: false,
      requireHumanApproval: false,
    };

    let capturedConfig: unknown;
    const compileSkill: Skill = {
      action: "compile",
      execute: vi.fn().mockImplementation((input: SkillInput) => {
        capturedConfig = input.config;
        return Promise.resolve(makeSkillResult("done"));
      }),
    };

    const config: OrchestratorConfig = {
      maxIterations: 5,
      skillConfigs: { compile: customConfig },
    };

    await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      vi.fn().mockResolvedValue(void 0),
      config,
    );

    expect(capturedConfig).toEqual(customConfig);
  });

  // 11. "review" action uses REVIEW_SKILL_CONFIG by default
  it("uses REVIEW_SKILL_CONFIG for review action when no skillConfigs override", async () => {
    // Build an input that triggers a "compile" task but we want "review" —
    // use a stale L2 pointing to a deleted L3 (orphaned L2 → review task)
    const l3 = makeL3("auth");
    const l2 = makeL2(l3);
    // L3 is gone but L2 remains → MISSING_BLOCK_REF on L2 → review task
    const reviewInput: CheckInput = { l4Flows: [], l3Blocks: [], l2Blocks: [l2] };
    const loadInput = vi.fn().mockResolvedValueOnce(reviewInput).mockResolvedValue({
      l4Flows: [],
      l3Blocks: [],
      l2Blocks: [],
    });

    let capturedConfig: unknown;
    const reviewSkill: Skill = {
      action: "review",
      execute: vi.fn().mockImplementation((input: SkillInput) => {
        capturedConfig = input.config;
        return Promise.resolve({
          action: "review" as const,
          status: "done" as const,
          artifacts: [],
          notes: "",
        });
      }),
    };

    await runOrchestrator(
      loadInput,
      makeRegistry(reviewSkill),
      makeResolver(),
      vi.fn().mockResolvedValue(void 0),
    );

    expect(capturedConfig).toEqual(REVIEW_SKILL_CONFIG);
    expect((capturedConfig as typeof REVIEW_SKILL_CONFIG).requireHumanApproval).toBe(true);
  });

  // 12. totalTasksExecuted accumulates across iterations
  it("accumulates totalTasksExecuted across multiple iterations", async () => {
    const l3a = makeL3("auth");
    const l3b = makeL3("billing");
    // Iter 1: two L3 blocks with no L2 → 2 tasks
    const dirtyTwo: CheckInput = { l4Flows: [], l3Blocks: [l3a, l3b], l2Blocks: [] };
    // Iter 2: one L3 block with no L2 → 1 task
    const dirtyOne: CheckInput = { l4Flows: [], l3Blocks: [l3a], l2Blocks: [] };
    // Iter 3: clean
    const clean: CheckInput = { l4Flows: [], l3Blocks: [], l2Blocks: [] };

    const loadInput = vi
      .fn()
      .mockResolvedValueOnce(dirtyTwo)
      .mockResolvedValueOnce(dirtyOne)
      .mockResolvedValue(clean);

    const compileSkill = makeSkill("compile", "done");

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      vi.fn().mockResolvedValue(void 0),
    );

    expect(result.converged).toBe(true);
    expect(result.totalTasksExecuted).toBe(3); // 2 + 1
    expect(result.iterations).toHaveLength(2);
  });

  // 13. loadInput called fresh each iteration
  it("calls loadInput once per iteration", async () => {
    const l3 = makeL3("auth");
    const loadInput = vi
      .fn()
      .mockResolvedValueOnce(dirtyInput(l3))
      .mockResolvedValueOnce(dirtyInput(l3))
      .mockResolvedValue(cleanInput(l3));

    const compileSkill = makeSkill("compile", "done");
    const config: OrchestratorConfig = { maxIterations: 5 };

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      vi.fn().mockResolvedValue(void 0),
      config,
    );

    expect(result.converged).toBe(true);
    // 2 dirty + 1 clean = 3 calls
    expect(loadInput).toHaveBeenCalledTimes(3);
    expect(result.iterations).toHaveLength(2);
  });

  // 14. Mixed blocked/done executions — loop continues
  it("continues iterating when some tasks are done and some are blocked", async () => {
    const l3a = makeL3("auth");
    const l3b = makeL3("billing");
    const dirtyTwo: CheckInput = { l4Flows: [], l3Blocks: [l3a, l3b], l2Blocks: [] };
    const clean: CheckInput = { l4Flows: [], l3Blocks: [], l2Blocks: [] };

    const loadInput = vi.fn().mockResolvedValueOnce(dirtyTwo).mockResolvedValue(clean);

    // First skill call → "done", second → "blocked"
    const compileSkill: Skill = {
      action: "compile",
      execute: vi
        .fn()
        .mockResolvedValueOnce(makeSkillResult("done"))
        .mockResolvedValueOnce(makeSkillResult("blocked")),
    };

    const result = await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      makeResolver(),
      vi.fn().mockResolvedValue(void 0),
    );

    // Not all-blocked (one was done), so loop should continue to convergence
    expect(result.converged).toBe(true);
    expect(result.iterations[0].executions).toHaveLength(2);
    const statuses = result.iterations[0].executions.map((e) => e.result.status);
    expect(statuses).toContain("done");
    expect(statuses).toContain("blocked");
  });

  // 15. resolver.resolve called per task with correct args
  it("calls resolver.resolve for each task with the task and current input", async () => {
    const l3 = makeL3("auth");
    const input = dirtyInput(l3);
    const loadInput = vi.fn().mockResolvedValueOnce(input).mockResolvedValue(cleanInput(l3));
    const resolver = makeResolver();
    const compileSkill = makeSkill("compile", "done");

    await runOrchestrator(
      loadInput,
      makeRegistry(compileSkill),
      resolver,
      vi.fn().mockResolvedValue(void 0),
    );

    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    const [task, calledInput] = (resolver.resolve as ReturnType<typeof vi.fn>).mock.calls[0] as [
      unknown,
      unknown,
    ];
    // task should have action "compile" and targetId matching the l3 id
    expect((task as { action: string }).action).toBe("compile");
    expect((task as { targetId: string }).targetId).toBe("auth");
    // called with the same input object
    expect(calledInput).toBe(input);
  });

  // 16. Empty executions with errors — not treated as "all blocked"
  it("does not trigger early exit when all tasks have no registered skill (executions empty)", async () => {
    const l3 = makeL3("auth");
    const loadInput = vi
      .fn()
      .mockResolvedValueOnce(dirtyInput(l3))
      .mockResolvedValue(cleanInput(l3));

    // Empty registry — errors will be generated but executions stays empty
    const result = await runOrchestrator(
      loadInput,
      makeRegistry(), // no skills
      makeResolver(),
      vi.fn(),
    );

    const iter = result.iterations[0];
    expect(iter.executions).toHaveLength(0);
    expect(iter.errors).toHaveLength(1);
    // allBlocked check: executions.length === 0 → does NOT trigger early exit
    // Loop continues, next loadInput returns clean → converged
    expect(result.converged).toBe(true);
  });
});
