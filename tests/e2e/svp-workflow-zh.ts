#!/usr/bin/env tsx
// svp-workflow-zh.ts — E2E 测试: 全中文 SVP 设计→实现工作流（通过 Claude Code CLI）
//
// 与 svp-workflow.ts 相同的完整流程，但使用中文 intent 并设置 language=zh：
//   阶段 1: 初始化    → forge init --language zh
//   阶段 2: 设计 L5   → forge prompt design-l5 → claude -p → 验证 l5.json
//   阶段 3: 设计 L4   → forge prompt design-l4 → claude -p → 验证 l4/*.json
//   阶段 4: 设计 L3   → forge prompt design-l3 (逐步) → claude -p → 验证 l3/*.json
//   阶段 5: 检查      → forge check → 跨层一致性校验
//   阶段 6: 编译      → forge prompt compile (逐个 l3) → claude -p → 验证 l2/*.json + 源码
//   阶段 7: 报告      → markdown 摘要
//
// 用法:
//   npx tsx tests/e2e/svp-workflow-zh.ts                  # 完整运行
//   npx tsx tests/e2e/svp-workflow-zh.ts --dry-run        # 仅 SVP CLI，跳过 Claude 调用
//   npx tsx tests/e2e/svp-workflow-zh.ts --all-sonnet     # 所有步骤使用 sonnet
//   npx tsx tests/e2e/svp-workflow-zh.ts --budget 2.0     # 总预算上限

import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  type ClaudeResult,
  type PhaseResult,
  type StepResult,
  buildReport,
  buildSkippedPhase,
  fmtMs,
  getFlagVal,
  hasFlag,
  listJsonFiles,
  mapModel,
  parseComplexity,
  readJson,
  renderReport,
  runClaude,
  runSvp,
  timer,
} from "./helpers.js";

// ── 类型 ──

interface CLIOptions {
  dryRun: boolean;
  allSonnet: boolean;
  budgetUsd: number;
  stepBudgetUsd: number;
}

// ── 常量（中文） ──

const PROJECT_INTENT = "一个简单的字符串处理工具，负责校验输入、转换文本（反转、大写等），并将输出与元数据一起格式化返回。";
const L4_INTENT = "一条流水线：校验输入 → 转换文本 → 格式化输出";

// ── CLI 参数解析 ──

function parseArgs(): CLIOptions {
  return {
    dryRun: hasFlag("--dry-run"),
    allSonnet: hasFlag("--all-sonnet"),
    budgetUsd: Number.parseFloat(getFlagVal("--budget", "5.0")),
    stepBudgetUsd: Number.parseFloat(getFlagVal("--step-budget", "0.50")),
  };
}

// ── 阶段实现 ──

function phase1_setup(opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  const projectDir = mkdtempSync(path.join(tmpdir(), "svp-e2e-zh-"));
  const stepTimer = timer();

  // 使用 --language zh 初始化（项目名用英文以生成合法 id）
  const initResult = runSvp(
    `init -n string-transformer -r "${projectDir}" -i "${PROJECT_INTENT}" --language zh`,
    projectDir,
  );

  const details: string[] = [`临时目录: ${projectDir}`];
  const errors: string[] = [];

  if (!initResult.ok) {
    errors.push(`forge init 失败: ${initResult.stderr}`);
  } else {
    details.push("forge init 完成");
  }

  // 验证目录结构
  const svpDir = path.join(projectDir, ".svp");
  const expected = ["l5.json", "l4", "l3", "l2"];
  for (const entry of expected) {
    const p = path.join(svpDir, entry);
    if (existsSync(p)) {
      details.push(`  .svp/${entry} 存在`);
    } else {
      errors.push(`  .svp/${entry} 缺失`);
    }
  }

  // 验证 l5.json 中 language 字段为 "zh"
  const l5Path = path.join(svpDir, "l5.json");
  if (existsSync(l5Path)) {
    try {
      const l5 = readJson(l5Path);
      if (l5.language === "zh") {
        details.push("  l5.language = zh ✓");
      } else {
        errors.push(`  l5.language 应为 \"zh\"，实际为 \"${l5.language}\"`);
      }
    } catch (e: any) {
      errors.push(`  l5.json 解析失败: ${e.message}`);
    }
  }

  steps.push({
    name: "forge init（中文） + 验证结构",
    ok: initResult.ok && errors.length === 0,
    durationMs: stepTimer(),
    details,
    errors,
  });

  const ok = steps.every((s) => s.ok);
  return {
    phase: 1,
    name: "初始化",
    ok,
    durationMs: elapsed(),
    steps,
    ...({ _projectDir: projectDir } as any),
  };
}

function phase2_designL5(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  const stepTimer = timer();
  const promptResult = runSvp(
    `prompt design-l5 --intent "${PROJECT_INTENT}" -r "${projectDir}"`,
    projectDir,
  );

  if (!promptResult.ok) {
    steps.push({
      name: "forge prompt design-l5",
      ok: false,
      durationMs: stepTimer(),
      details: [],
      errors: [`失败: ${promptResult.stderr}`],
    });
    return { phase: 2, name: "设计 L5", ok: false, durationMs: elapsed(), steps };
  }

  const prompt = promptResult.stdout;
  const complexity = parseComplexity(prompt);
  const model = mapModel(complexity, opts.allSonnet);

  // 验证提示词包含中文语言指令
  const hasLangDirective = prompt.includes("Chinese") || prompt.includes("中文");

  steps.push({
    name: "forge prompt design-l5",
    ok: true,
    durationMs: stepTimer(),
    details: [
      `复杂度: ${complexity} → 模型: ${model}`,
      `提示词长度: ${String(prompt.length)} 字符`,
      `语言指令: ${hasLangDirective ? "包含中文指令 ✓" : "未检测到中文指令 ⚠"}`,
    ],
    errors: [],
  });

  // 调用 Claude 执行设计
  const claudeTimer = timer();
  const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

  const claudeDetails: string[] = [];
  const claudeErrors: string[] = [];

  if (!claudeResult.ok) {
    claudeErrors.push(`Claude 调用失败: ${claudeResult.error ?? "未知错误"}`);
  } else {
    claudeDetails.push(`Token: ${String(claudeResult.inputTokens)} 输入 / ${String(claudeResult.outputTokens)} 输出`);
    claudeDetails.push(`费用: $${claudeResult.costUsd.toFixed(4)}`);
  }

  steps.push({
    name: "claude design-l5",
    ok: claudeResult.ok,
    durationMs: claudeTimer(),
    claudeResult,
    details: claudeDetails,
    errors: claudeErrors,
  });

  // 验证 l5.json
  const verifyTimer = timer();
  const l5Path = path.join(projectDir, ".svp", "l5.json");
  const verifyDetails: string[] = [];
  const verifyErrors: string[] = [];
  let verifyOk = true;

  if (!existsSync(l5Path)) {
    verifyErrors.push("设计后未找到 l5.json");
    verifyOk = false;
  } else {
    try {
      const l5 = readJson(l5Path);
      const requiredFields = ["id", "name", "intent"];
      for (const field of requiredFields) {
        if (l5[field] !== undefined && l5[field] !== "") {
          verifyDetails.push(`  l5.${field}: 存在`);
        } else {
          verifyErrors.push(`  l5.${field}: 缺失或为空`);
          verifyOk = false;
        }
      }
      if (l5.language === "zh") {
        verifyDetails.push("  l5.language: zh ✓");
      }
      if (Array.isArray(l5.domains) && l5.domains.length > 0) {
        verifyDetails.push(`  l5.domains: ${String(l5.domains.length)} 个领域`);
      }
      if (Array.isArray(l5.constraints) && l5.constraints.length > 0) {
        verifyDetails.push(`  l5.constraints: ${String(l5.constraints.length)} 条约束`);
      }
    } catch (e: any) {
      verifyErrors.push(`l5.json 解析错误: ${e.message}`);
      verifyOk = false;
    }
  }

  steps.push({
    name: "验证 l5.json",
    ok: verifyOk,
    durationMs: verifyTimer(),
    details: verifyDetails,
    errors: verifyErrors,
  });

  const ok = steps.every((s) => s.ok);
  return { phase: 2, name: "设计 L5", ok, durationMs: elapsed(), steps };
}

function phase3_designL4(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  const stepTimer = timer();
  const promptResult = runSvp(
    `prompt design-l4 --intent "${L4_INTENT}" -r "${projectDir}"`,
    projectDir,
  );

  if (!promptResult.ok) {
    steps.push({
      name: "forge prompt design-l4",
      ok: false,
      durationMs: stepTimer(),
      details: [],
      errors: [`失败: ${promptResult.stderr}`],
    });
    return { phase: 3, name: "设计 L4", ok: false, durationMs: elapsed(), steps };
  }

  const prompt = promptResult.stdout;
  const complexity = parseComplexity(prompt);
  const model = mapModel(complexity, opts.allSonnet);

  steps.push({
    name: "forge prompt design-l4",
    ok: true,
    durationMs: stepTimer(),
    details: [
      `复杂度: ${complexity} → 模型: ${model}`,
      `提示词长度: ${String(prompt.length)} 字符`,
    ],
    errors: [],
  });

  // 调用 Claude
  const claudeTimer = timer();
  const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

  const claudeDetails: string[] = [];
  const claudeErrors: string[] = [];
  if (!claudeResult.ok) {
    claudeErrors.push(`Claude 调用失败: ${claudeResult.error ?? "未知错误"}`);
  } else {
    claudeDetails.push(`Token: ${String(claudeResult.inputTokens)} 输入 / ${String(claudeResult.outputTokens)} 输出`);
    claudeDetails.push(`费用: $${claudeResult.costUsd.toFixed(4)}`);
  }

  steps.push({
    name: "claude design-l4",
    ok: claudeResult.ok,
    durationMs: claudeTimer(),
    claudeResult,
    details: claudeDetails,
    errors: claudeErrors,
  });

  // 验证 L4 文件
  const verifyTimer = timer();
  const l4Dir = path.join(projectDir, ".svp", "l4");
  const l4Files = listJsonFiles(l4Dir);
  const verifyDetails: string[] = [];
  const verifyErrors: string[] = [];
  let verifyOk = true;

  if (l4Files.length === 0) {
    if (opts.dryRun) {
      verifyDetails.push("无 L4 文件（dry-run 模式下预期如此）");
    } else {
      verifyErrors.push("设计后未找到 L4 文件");
      verifyOk = false;
    }
  } else {
    verifyDetails.push(`找到 ${String(l4Files.length)} 个 L4 文件: ${l4Files.join(", ")}`);

    for (const file of l4Files) {
      try {
        const l4 = readJson(path.join(l4Dir, file));
        const requiredFields = ["id", "name", "steps"];
        for (const field of requiredFields) {
          if (l4[field] === undefined) {
            verifyErrors.push(`  ${file}: 缺少字段 "${field}"`);
            verifyOk = false;
          }
        }
        if (Array.isArray(l4.steps)) {
          verifyDetails.push(`  ${file}: ${String(l4.steps.length)} 个步骤`);
          const refs = l4.steps.map((s: any) => s.blockRef).filter((r: any) => r !== undefined);
          if (refs.length > 0) {
            verifyDetails.push(`  ${file}: blockRefs → [${refs.join(", ")}]`);
          }
        }
      } catch (e: any) {
        verifyErrors.push(`  ${file}: 解析错误: ${e.message}`);
        verifyOk = false;
      }
    }
  }

  steps.push({
    name: "验证 l4/*.json",
    ok: verifyOk,
    durationMs: verifyTimer(),
    details: verifyDetails,
    errors: verifyErrors,
  });

  const ok = steps.every((s) => s.ok);
  return { phase: 3, name: "设计 L4", ok, durationMs: elapsed(), steps };
}

function phase4_designL3(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  const l4Dir = path.join(projectDir, ".svp", "l4");
  const l4Files = listJsonFiles(l4Dir);

  if (l4Files.length === 0) {
    const isExpected = opts.dryRun;
    steps.push({
      name: "发现 L4 步骤",
      ok: isExpected,
      durationMs: 0,
      details: isExpected ? ["无 L4 流程（dry-run 模式下预期如此）"] : [],
      errors: isExpected ? [] : ["未找到 L4 流程 — 无法设计 L3 block"],
    });
    return { phase: 4, name: "设计 L3", ok: isExpected, durationMs: elapsed(), steps };
  }

  // 收集所有需要 L3 block 的目标
  const targets: { flowId: string; blockId: string; stepIndex?: number }[] = [];
  const seen = new Set<string>();
  for (const file of l4Files) {
    const l4 = readJson(path.join(l4Dir, file));
    const kind = l4.kind ?? "flow";

    if (kind === "flow" && Array.isArray(l4.steps)) {
      for (let i = 0; i < l4.steps.length; i++) {
        const step = l4.steps[i];
        if (step.blockRef && !seen.has(step.blockRef)) {
          seen.add(step.blockRef);
          targets.push({ flowId: l4.id, blockId: step.blockRef, stepIndex: i });
        }
      }
    } else if (kind === "event-graph" && Array.isArray(l4.handlers)) {
      for (const handler of l4.handlers) {
        if (!Array.isArray(handler.steps)) continue;
        for (const step of handler.steps) {
          if (step.blockRef && !seen.has(step.blockRef)) {
            seen.add(step.blockRef);
            targets.push({ flowId: l4.id, blockId: step.blockRef });
          }
        }
      }
    } else if (kind === "state-machine" && l4.states) {
      for (const config of Object.values(l4.states) as any[]) {
        if (config.onEntry?.blockRef && !seen.has(config.onEntry.blockRef)) {
          seen.add(config.onEntry.blockRef);
          targets.push({ flowId: l4.id, blockId: config.onEntry.blockRef });
        }
        if (config.onExit?.blockRef && !seen.has(config.onExit.blockRef)) {
          seen.add(config.onExit.blockRef);
          targets.push({ flowId: l4.id, blockId: config.onExit.blockRef });
        }
      }
      if (Array.isArray(l4.transitions)) {
        for (const t of l4.transitions) {
          if (t.guard && !seen.has(t.guard)) {
            seen.add(t.guard);
            targets.push({ flowId: l4.id, blockId: t.guard });
          }
        }
      }
    }
  }

  steps.push({
    name: "发现 L4 步骤",
    ok: targets.length > 0,
    durationMs: 0,
    details: [`找到 ${String(targets.length)} 个需要 L3 block 的步骤`],
    errors: targets.length === 0 ? ["L4 流程中未找到带 blockRef 的步骤"] : [],
  });

  // 逐个设计 L3 block
  for (const target of targets) {
    const { flowId, blockId, stepIndex } = target;

    const l3Path = path.join(projectDir, ".svp", "l3", `${blockId}.json`);
    if (existsSync(l3Path)) {
      steps.push({
        name: `design-l3 ${blockId}`,
        ok: true,
        durationMs: 0,
        details: [`L3 block "${blockId}" 已存在 — 跳过`],
        errors: [],
      });
      continue;
    }

    const stepTimer = timer();
    const intentText = `实现字符串处理流水线中的 "${blockId}" 步骤`;
    const stepArg = stepIndex !== undefined ? ` --step ${String(stepIndex)}` : "";
    const promptResult = runSvp(
      `prompt design-l3 ${blockId} --intent "${intentText}" --flow ${flowId}${stepArg} -r "${projectDir}"`,
      projectDir,
    );

    if (!promptResult.ok) {
      steps.push({
        name: `forge prompt design-l3 ${blockId}`,
        ok: false,
        durationMs: stepTimer(),
        details: [],
        errors: [`失败: ${promptResult.stderr}`],
      });
      continue;
    }

    const prompt = promptResult.stdout;
    const complexity = parseComplexity(prompt);
    const model = mapModel(complexity, opts.allSonnet);

    const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

    const details: string[] = [`复杂度: ${complexity} → 模型: ${model}`];
    const errors: string[] = [];

    if (claudeResult.ok) {
      details.push(`Token: ${String(claudeResult.inputTokens)} 输入 / ${String(claudeResult.outputTokens)} 输出`);
    } else {
      errors.push(`Claude 调用失败: ${claudeResult.error ?? "未知错误"}`);
    }

    if (existsSync(l3Path)) {
      try {
        const l3 = readJson(l3Path);
        const requiredFields = ["id", "name", "input", "output"];
        for (const field of requiredFields) {
          if (l3[field] === undefined) {
            errors.push(`l3/${blockId}.json: 缺少字段 "${field}"`);
          }
        }
        details.push(`l3/${blockId}.json 已创建，包含 ${String(Object.keys(l3).length)} 个字段`);
      } catch (e: any) {
        errors.push(`l3/${blockId}.json 解析错误: ${e.message}`);
      }
    } else if (claudeResult.ok && !opts.dryRun) {
      errors.push(`Claude 调用后未找到 l3/${blockId}.json`);
    } else if (opts.dryRun) {
      details.push(`l3/${blockId}.json 未创建（dry-run 模式下预期如此）`);
    }

    steps.push({
      name: `design-l3 ${blockId}`,
      ok: claudeResult.ok && errors.length === 0,
      durationMs: stepTimer(),
      claudeResult,
      details,
      errors,
    });
  }

  const ok = steps.every((s) => s.ok);
  return { phase: 4, name: "设计 L3", ok, durationMs: elapsed(), steps };
}

function phase5_check(projectDir: string): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  // 先运行 rehash 修复 Claude 留下的占位哈希
  const rehashTimer = timer();
  const rehashResult = runSvp(`rehash -r "${projectDir}"`, projectDir);
  steps.push({
    name: "forge rehash",
    ok: rehashResult.ok,
    durationMs: rehashTimer(),
    details: rehashResult.ok
      ? [`Rehash 完成: ${rehashResult.stdout.trim().split("\n").length} 行输出`]
      : [],
    errors: rehashResult.ok ? [] : [`forge rehash 失败: ${rehashResult.stderr}`],
  });

  const stepTimer = timer();
  const result = runSvp(`check --json -r "${projectDir}"`, projectDir);

  const details: string[] = [];
  const errors: string[] = [];
  let checkOk = result.ok;

  if (!result.ok && result.stderr) {
    errors.push(`forge check 失败: ${result.stderr}`);
  }

  try {
    const report = JSON.parse(result.stdout);
    const issueCount = report.issues?.length ?? 0;
    const errorCount = report.summary?.errors ?? 0;
    const warnCount = report.summary?.warnings ?? 0;

    details.push(`问题: ${String(issueCount)} 个 (${String(errorCount)} 个错误, ${String(warnCount)} 个警告)`);

    if (errorCount > 0) {
      checkOk = false;
      for (const issue of report.issues) {
        if (issue.severity === "error") {
          errors.push(`  [${issue.code}] ${issue.layer}/${issue.entityId}: ${issue.message}`);
        }
      }
    }

    if (warnCount > 0) {
      for (const issue of report.issues) {
        if (issue.severity === "warning") {
          details.push(`  警告 [${issue.code}] ${issue.layer}/${issue.entityId}: ${issue.message}`);
        }
      }
    }
  } catch {
    details.push(`原始输出: ${result.stdout.slice(0, 500)}`);
  }

  steps.push({
    name: "forge check --json",
    ok: checkOk,
    durationMs: stepTimer(),
    details,
    errors,
  });

  return { phase: 5, name: "检查", ok: checkOk, durationMs: elapsed(), steps };
}

function phase6_compile(projectDir: string, opts: CLIOptions): PhaseResult {
  const elapsed = timer();
  const steps: StepResult[] = [];

  const l3Dir = path.join(projectDir, ".svp", "l3");
  const l3Files = listJsonFiles(l3Dir);

  if (l3Files.length === 0) {
    const isExpected = opts.dryRun;
    steps.push({
      name: "发现 L3 block",
      ok: isExpected,
      durationMs: 0,
      details: isExpected ? ["无 L3 block（dry-run 模式下预期如此）"] : [],
      errors: isExpected ? [] : ["未找到 L3 block — 无法编译"],
    });
    return { phase: 6, name: "编译", ok: isExpected, durationMs: elapsed(), steps };
  }

  steps.push({
    name: "发现 L3 block",
    ok: true,
    durationMs: 0,
    details: [`找到 ${String(l3Files.length)} 个 L3 block 待编译: ${l3Files.map((f) => f.replace(".json", "")).join(", ")}`],
    errors: [],
  });

  for (const file of l3Files) {
    const blockId = file.replace(".json", "");
    const stepTimer = timer();

    const promptResult = runSvp(
      `prompt compile ${blockId} -r "${projectDir}"`,
      projectDir,
    );

    if (!promptResult.ok) {
      steps.push({
        name: `编译 ${blockId}`,
        ok: false,
        durationMs: stepTimer(),
        details: [],
        errors: [`forge prompt compile 失败: ${promptResult.stderr}`],
      });
      continue;
    }

    const prompt = promptResult.stdout;
    const complexity = parseComplexity(prompt);
    const model = mapModel(complexity, opts.allSonnet);

    const claudeResult = runClaude(prompt, model, projectDir, opts.stepBudgetUsd, opts);

    const details: string[] = [`复杂度: ${complexity} → 模型: ${model}`];
    const errors: string[] = [];

    if (claudeResult.ok) {
      details.push(`Token: ${String(claudeResult.inputTokens)} 输入 / ${String(claudeResult.outputTokens)} 输出`);
    } else {
      errors.push(`Claude 调用失败: ${claudeResult.error ?? "未知错误"}`);
    }

    const l2Dir = path.join(projectDir, ".svp", "l2");
    const l2Files = listJsonFiles(l2Dir);
    const l2ForBlock = l2Files.filter((f) => {
      try {
        const l2 = readJson(path.join(l2Dir, f));
        return l2.blockRef === blockId;
      } catch {
        return false;
      }
    });

    if (l2ForBlock.length > 0) {
      details.push(`L2 代码块: ${l2ForBlock.join(", ")}`);
    } else if (!opts.dryRun && claudeResult.ok) {
      details.push("未找到 L2 代码块（Claude 可能直接创建了源文件）");
    }

    steps.push({
      name: `编译 ${blockId}`,
      ok: claudeResult.ok,
      durationMs: stepTimer(),
      claudeResult,
      details,
      errors,
    });
  }

  const ok = steps.every((s) => s.ok);
  return { phase: 6, name: "编译", ok, durationMs: elapsed(), steps };
}

// ── 主程序 ──

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log("=== SVP E2E 工作流测试（中文版） ===");
  console.log(`模式: ${opts.dryRun ? "空运行" : "完整运行"}`);
  if (opts.allSonnet) console.log("模型覆盖: 全部使用 sonnet");
  console.log(`预算: 总计 $${opts.budgetUsd.toFixed(2)}，每步 $${opts.stepBudgetUsd.toFixed(2)}`);
  console.log();

  const phases: PhaseResult[] = [];
  let projectDir = "";
  let totalCost = 0;

  // 阶段 1: 初始化
  console.log("阶段 1: 初始化...");
  const p1 = phase1_setup(opts);
  projectDir = (p1 as any)._projectDir;
  phases.push(p1);
  console.log(`  ${p1.ok ? "通过" : "失败"} (${fmtMs(p1.durationMs)})`);

  if (!p1.ok) {
    console.error("阶段 1 失败 — 无法继续。");
    process.exitCode = 1;
    return;
  }

  console.log(`  项目目录: ${projectDir}`);

  // 阶段 2: 设计 L5
  console.log("阶段 2: 设计 L5...");
  const p2 = phase2_designL5(projectDir, opts);
  phases.push(p2);
  totalCost += p2.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p2.ok ? "通过" : "失败"} (${fmtMs(p2.durationMs)})`);

  if (!p2.ok && !opts.dryRun) {
    console.error("阶段 2 失败 — 后续阶段需要 L5 设计。");
    phases.push(buildSkippedPhase(3, "设计 L4"), buildSkippedPhase(4, "设计 L3"), buildSkippedPhase(5, "检查"), buildSkippedPhase(6, "编译"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // 阶段 3: 设计 L4
  console.log("阶段 3: 设计 L4...");
  const p3 = phase3_designL4(projectDir, opts);
  phases.push(p3);
  totalCost += p3.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p3.ok ? "通过" : "失败"} (${fmtMs(p3.durationMs)})`);

  if (!p3.ok && !opts.dryRun) {
    console.error("阶段 3 失败 — 设计 L3 需要 L4 流程。");
    phases.push(buildSkippedPhase(4, "设计 L3"), buildSkippedPhase(5, "检查"), buildSkippedPhase(6, "编译"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // 预算检查
  if (totalCost >= opts.budgetUsd) {
    console.error(`预算已耗尽 ($${totalCost.toFixed(2)} >= $${opts.budgetUsd.toFixed(2)})。停止。`);
    phases.push(buildSkippedPhase(4, "设计 L3"), buildSkippedPhase(5, "检查"), buildSkippedPhase(6, "编译"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // 阶段 4: 设计 L3
  console.log("阶段 4: 设计 L3...");
  const p4 = phase4_designL3(projectDir, opts);
  phases.push(p4);
  totalCost += p4.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p4.ok ? "通过" : "失败"} (${fmtMs(p4.durationMs)})`);

  // 阶段 5: 检查
  console.log("阶段 5: 检查...");
  const p5 = phase5_check(projectDir);
  phases.push(p5);
  console.log(`  ${p5.ok ? "通过" : "失败"} (${fmtMs(p5.durationMs)})`);

  // 编译前预算检查
  if (totalCost >= opts.budgetUsd) {
    console.error(`预算已耗尽 ($${totalCost.toFixed(2)})。跳过编译阶段。`);
    phases.push(buildSkippedPhase(6, "编译"));
    writeReport(phases, projectDir, opts);
    process.exitCode = 1;
    return;
  }

  // 阶段 6: 编译
  console.log("阶段 6: 编译...");
  const p6 = phase6_compile(projectDir, opts);
  phases.push(p6);
  totalCost += p6.steps.reduce((s, st) => s + (st.claudeResult?.costUsd ?? 0), 0);
  console.log(`  ${p6.ok ? "通过" : "失败"} (${fmtMs(p6.durationMs)})`);

  // 阶段 7: 报告
  writeReport(phases, projectDir, opts);

  // 最终状态
  const allPassed = phases.every((p) => p.ok);
  console.log();
  console.log(`=== ${allPassed ? "全部通过" : "存在失败"} ===`);
  console.log(`总费用: $${totalCost.toFixed(4)}`);

  if (!allPassed) process.exitCode = 1;
}

function writeReport(phases: PhaseResult[], projectDir: string, opts: CLIOptions): void {
  const report = buildReport(phases, projectDir, opts.dryRun);
  const markdown = renderReport(report);

  const reportDir = path.resolve(import.meta.dirname);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `report-zh-${ts}.md`);
  writeFileSync(reportPath, markdown, "utf8");
  console.log(`\n报告: ${reportPath}`);

  const jsonPath = path.join(reportDir, `report-zh-${ts}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
}

main().catch((err) => {
  console.error("致命错误:", err);
  process.exitCode = 1;
});
