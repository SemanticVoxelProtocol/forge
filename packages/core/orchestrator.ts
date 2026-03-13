// 收敛循环编排器 — 调度 Skill 执行 compile-plan 任务
// 纯逻辑层：接收解析好的数据 + skill 注册表，输出执行结果
// IO（读写文件、加载数据）由上层 CLI 负责

import { compilePlan } from "./compile-plan.js";
import { DEFAULT_SKILL_CONFIG, REVIEW_SKILL_CONFIG } from "./skill.js";
import type { CheckInput } from "./check.js";
import type { CompileTask } from "./compile-plan.js";
import type {
  SkillConfig,
  SkillInput,
  SkillResult,
  SkillResultWithFiles,
  SkillRegistry,
  ResolvedContext,
} from "./skill.js";

// ── 类型 ──

/** 单次迭代中一个任务的执行记录 */
export interface TaskExecution {
  readonly task: CompileTask;
  readonly result: SkillResult | SkillResultWithFiles;
}

/** 单次迭代结果 */
export interface IterationResult {
  readonly iteration: number;
  readonly tasksDispatched: number;
  readonly executions: readonly TaskExecution[];
  readonly errors: readonly string[];
}

/** 收敛循环的最终结果 */
export interface OrchestratorResult {
  readonly converged: boolean;
  readonly iterations: readonly IterationResult[];
  readonly totalTasksExecuted: number;
}

/** 上下文解析器 — 由 CLI 层注入，负责把 task 的 context refs 解析成实际数据 */
export interface ContextResolver {
  readonly resolve: (task: CompileTask, input: CheckInput) => Promise<ResolvedContext>;
}

/** 编排器配置 */
export interface OrchestratorConfig {
  readonly maxIterations: number; // 防止无限循环
  readonly skillConfigs?: Partial<Record<string, SkillConfig>>; // 按 action 覆盖
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxIterations: 5,
};

// ── 主入口 ──

/**
 * 运行收敛循环：
 *   repeat { compilePlan → dispatch skills → apply artifacts }
 *   until plan.tasks is empty or maxIterations reached
 *
 * @param loadInput  每次迭代重新加载最新数据（因为上一轮可能写了新制品）
 * @param registry   skill 注册表
 * @param resolver   上下文解析器
 * @param applyResult 把 skill 结果写回磁盘
 * @param config     编排器配置
 */
export async function runOrchestrator(
  loadInput: () => Promise<CheckInput>,
  registry: SkillRegistry,
  resolver: ContextResolver,
  applyResult: (execution: TaskExecution) => Promise<void>,
  config: OrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG,
): Promise<OrchestratorResult> {
  const iterations: IterationResult[] = [];
  let totalTasksExecuted = 0;

  for (let i = 0; i < config.maxIterations; i++) {
    const input = await loadInput();
    const plan = compilePlan(input);

    if (plan.tasks.length === 0) {
      return { converged: true, iterations, totalTasksExecuted };
    }

    const iterResult = await runIteration(
      i + 1,
      plan.tasks,
      input,
      registry,
      resolver,
      applyResult,
      config,
    );

    iterations.push(iterResult);
    totalTasksExecuted += iterResult.executions.length;

    // 如果所有任务都 blocked 或报错，提前退出
    const allBlocked = iterResult.executions.every((e) => e.result.status === "blocked");
    if (allBlocked && iterResult.executions.length > 0) {
      return { converged: false, iterations, totalTasksExecuted };
    }
  }

  return { converged: false, iterations, totalTasksExecuted };
}

// ── 单次迭代 ──

async function runIteration(
  iteration: number,
  tasks: readonly CompileTask[],
  input: CheckInput,
  registry: SkillRegistry,
  resolver: ContextResolver,
  applyResult: (execution: TaskExecution) => Promise<void>,
  config: OrchestratorConfig,
): Promise<IterationResult> {
  const executions: TaskExecution[] = [];
  const errors: string[] = [];

  for (const task of tasks) {
    const skill = registry.get(task.action);
    if (skill === undefined) {
      errors.push(`No skill registered for action "${task.action}"`);
      continue;
    }

    try {
      const resolved = await resolver.resolve(task, input);
      const skillConfig = config.skillConfigs?.[task.action];
      const skillInput: SkillInput = {
        task,
        resolved,
        config:
          skillConfig ?? (task.action === "review" ? REVIEW_SKILL_CONFIG : DEFAULT_SKILL_CONFIG),
      };

      const result = await skill.execute(skillInput);
      const execution: TaskExecution = { task, result };
      executions.push(execution);

      // 非 dry-run 且成功时写回
      if (!skillInput.config.dryRun && result.status === "done") {
        await applyResult(execution);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Skill "${task.action}" failed for ${task.targetId}: ${message}`);
    }
  }

  return { iteration, tasksDispatched: tasks.length, executions, errors };
}
