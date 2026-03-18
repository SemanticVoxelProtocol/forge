// forge prompt — 生成上下文感知的 AI 提示词
// 7 个子命令：compile, recompile, review, update-ref, design-l5, design-l4, design-l3
// 读 .svp/ 状态 → 解析上下文 → 调用 prompt builder → stdout 输出 markdown

import { getDefaultComplexity } from "../../core/compile-plan.js";
import { getLanguage } from "../../core/i18n.js";
import { extractBlockRefs, findBlockContext, getL4Kind } from "../../core/l4.js";
import { DEFAULT_SKILL_CONFIG } from "../../core/skill.js";
import { buildPrompt, renderPrompt } from "../../skills/prompt-builder.js";
import { buildDesignL3Prompt } from "../../skills/prompts/design-l3.js";
import { buildDesignL4EventGraphPrompt } from "../../skills/prompts/design-l4-event-graph.js";
import { buildDesignL4StateMachinePrompt } from "../../skills/prompts/design-l4-state-machine.js";
import { buildDesignL4Prompt } from "../../skills/prompts/design-l4.js";
import { buildDesignL5Prompt } from "../../skills/prompts/design-l5.js";
import { loadCheckInput } from "../load.js";
import { createResolver } from "../resolve.js";
import type { CompileTask, ContextRef, TaskAction } from "../../core/compile-plan.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Flow } from "../../core/l4.js";
import type { SkillInput } from "../../core/skill.js";
import type { Command } from "commander";

/** 注册 forge prompt 子命令组 */
export function registerPrompt(program: Command): void {
  const prompt = program
    .command("prompt")
    .description("Generate context-aware AI prompts for SVP operations");

  // ── compile / recompile / review / update-ref ──
  // 共享逻辑：加载 .svp/ → 构造合成 CompileTask → resolve → buildPrompt → renderPrompt

  registerTaskPrompt(prompt, "compile", {
    description: "Generate a compile prompt for an L3 block",
    targetLayer: "l2",
    issueCode: "MANUAL",
    reason: (id) => `Manual compile request for L3 block "${id}"`,
    buildContext: (id) => [{ layer: "l3", id, label: `L3 contract "${id}"` }],
  });

  registerTaskPrompt(prompt, "recompile", {
    description: "Generate a recompile prompt for an L3 block",
    targetLayer: "l2",
    issueCode: "MANUAL",
    reason: (id) => `Manual recompile request for L3 block "${id}" — L3 contract has changed`,
    buildContext: (id) => [{ layer: "l3", id, label: `L3 contract "${id}"` }],
    includeL2: true,
  });

  registerTaskPrompt(prompt, "review", {
    description: "Generate a review prompt for an L3 block",
    targetLayer: "l3",
    issueCode: "MANUAL",
    reason: (id) => `Manual review request for L3 block "${id}" — check L1 drift against L3`,
    buildContext: (id) => [{ layer: "l3", id, label: `L3 contract "${id}"` }],
    includeL2: true,
  });

  registerUpdateRef(prompt);

  // ── design-l5 / design-l4 / design-l3 ──

  registerDesignL5(prompt);
  registerDesignL4(prompt);
  registerDesignL3(prompt);
}

// ── Task-based prompt helpers ──

interface TaskPromptConfig {
  description: string;
  targetLayer: "l2" | "l3" | "l4";
  issueCode: string;
  reason: (id: string) => string;
  buildContext: (id: string) => ContextRef[];
  includeL2?: boolean;
}

function registerTaskPrompt(parent: Command, action: TaskAction, config: TaskPromptConfig): void {
  parent
    .command(`${action} <l3-id>`)
    .description(config.description)
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (l3Id: string, options: { root: string }) => {
      const root = options.root;

      let input;
      try {
        input = await loadCheckInput(root, { computeSignatures: action === "review" });
      } catch {
        console.error(`Error: cannot load .svp/ data from "${root}". Run \`forge init\` first.`);
        process.exitCode = 1;
        return;
      }

      // Validate L3 exists
      const l3 = input.l3Blocks.find((b) => b.id === l3Id);
      if (l3 === undefined) {
        console.error(`Error: L3 block "${l3Id}" not found in .svp/l3/`);
        process.exitCode = 1;
        return;
      }

      // Build context refs
      const contextRefs: ContextRef[] = [...config.buildContext(l3Id)];

      // Add L5 if available
      if (input.l5 !== undefined) {
        contextRefs.push({ layer: "l5", id: input.l5.id, label: "L5 blueprint" });
      }

      // Find referencing L4 artifact
      const refFlow = input.l4Flows.find((f) => extractBlockRefs(f).includes(l3Id));
      if (refFlow !== undefined) {
        contextRefs.push({
          layer: "l4",
          id: refFlow.id,
          label: `L4 flow "${refFlow.name}" (references this block)`,
        });
      }

      // Add L2 if needed
      if (config.includeL2 === true) {
        const l2 = input.l2Blocks.find((cb) => cb.blockRef === l3Id);
        if (l2 !== undefined) {
          contextRefs.push({
            layer: "l2",
            id: l2.id,
            label: `L2 code block (${l2.files.join(", ")})`,
          });
        }
      }

      const task: CompileTask = {
        action,
        targetLayer: config.targetLayer,
        targetId: l3Id,
        reason: config.reason(l3Id),
        issueCode: config.issueCode,
        context: contextRefs,
        complexity: getDefaultComplexity(action),
      };

      const resolver = createResolver(root);
      const resolved = await resolver.resolve(task, input);

      const skillInput: SkillInput = {
        task,
        resolved,
        config: DEFAULT_SKILL_CONFIG,
      };

      const structured = buildPrompt(skillInput);
      console.log(renderPrompt(structured));
    });
}

function registerUpdateRef(parent: Command): void {
  parent
    .command("update-ref <l4-id>")
    .description("Generate an update-ref prompt for an L4 flow with broken references")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (l4Id: string, options: { root: string }) => {
      const root = options.root;

      let input;
      try {
        input = await loadCheckInput(root);
      } catch {
        console.error(`Error: cannot load .svp/ data from "${root}". Run \`forge init\` first.`);
        process.exitCode = 1;
        return;
      }

      const flow = input.l4Flows.find((f) => f.id === l4Id);
      if (flow === undefined) {
        console.error(`Error: L4 flow "${l4Id}" not found in .svp/l4/`);
        process.exitCode = 1;
        return;
      }

      const contextRefs: ContextRef[] = [
        { layer: "l4", id: flow.id, label: `L4 flow "${flow.name}"` },
      ];
      if (input.l5 !== undefined) {
        contextRefs.push({ layer: "l5", id: input.l5.id, label: "L5 blueprint" });
      }

      const task: CompileTask = {
        action: "update-ref",
        targetLayer: "l4",
        targetId: l4Id,
        reason: `Manual update-ref request for L4 flow "${l4Id}" — fix broken L3 references`,
        issueCode: "MANUAL",
        context: contextRefs,
        complexity: "light",
      };

      const resolver = createResolver(root);
      const resolved = await resolver.resolve(task, input);

      const skillInput: SkillInput = {
        task,
        resolved,
        config: DEFAULT_SKILL_CONFIG,
      };

      const structured = buildPrompt(skillInput);
      console.log(renderPrompt(structured));
    });
}

// ── Design prompts ──

function registerDesignL5(parent: Command): void {
  parent
    .command("design-l5")
    .description("Generate a prompt for designing L5 blueprint")
    .requiredOption("--intent <text>", "User intent for the system")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(async (options: { intent: string; root: string }) => {
      const root = options.root;

      let input;
      try {
        input = await loadCheckInput(root);
      } catch {
        // No .svp/ yet — that's fine for design-l5 (creating from scratch)
        input = { l5: undefined, l4Flows: [], l3Blocks: [], l2Blocks: [] };
      }

      const prompt = buildDesignL5Prompt({
        currentL5: input.l5,
        userIntent: options.intent,
        language: getLanguage(input.l5),
      });

      console.log(prompt);
    });
}

function registerDesignL4(parent: Command): void {
  parent
    .command("design-l4 [target-id]")
    .description("Generate a prompt for designing L4 artifact")
    .requiredOption("--intent <text>", "User intent for the artifact")
    .option("--kind <kind>", "L4 variant kind: flow, event-graph, or state-machine", "flow")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(
      async (
        targetId: string | undefined,
        options: { intent: string; kind: string; root: string },
      ) => {
        const root = options.root;
        const kind = options.kind;

        if (kind !== "flow" && kind !== "event-graph" && kind !== "state-machine") {
          console.error(
            `Error: invalid --kind "${kind}". Must be flow, event-graph, or state-machine.`,
          );
          process.exitCode = 1;
          return;
        }

        let input;
        try {
          input = await loadCheckInput(root);
        } catch {
          console.error(`Error: cannot load .svp/ data from "${root}". Run \`forge init\` first.`);
          process.exitCode = 1;
          return;
        }

        if (input.l5 === undefined) {
          console.error(
            "Error: L5 blueprint not found. Design L5 first with `forge prompt design-l5`.",
          );
          process.exitCode = 1;
          return;
        }

        let prompt: string;

        if (kind === "event-graph") {
          prompt = buildDesignL4EventGraphPrompt({
            l5: input.l5,
            existingFlows: input.l4Flows,
            existingBlocks: input.l3Blocks,
            userIntent: options.intent,
            targetId,
            language: getLanguage(input.l5),
          });
        } else if (kind === "state-machine") {
          prompt = buildDesignL4StateMachinePrompt({
            l5: input.l5,
            existingFlows: input.l4Flows,
            existingBlocks: input.l3Blocks,
            userIntent: options.intent,
            targetId,
            language: getLanguage(input.l5),
          });
        } else {
          prompt = buildDesignL4Prompt({
            l5: input.l5,
            existingFlows: input.l4Flows,
            existingBlocks: input.l3Blocks,
            userIntent: options.intent,
            targetFlowId: targetId,
            language: getLanguage(input.l5),
          });
        }

        console.log(prompt);
      },
    );
}

function registerDesignL3(parent: Command): void {
  parent
    .command("design-l3 <block-id>")
    .description("Generate a prompt for designing L3 contract")
    .requiredOption("--intent <text>", "User intent for the block")
    .requiredOption("--flow <flow-id>", "L4 artifact containing this block")
    .option("--step <index>", "Step index in the L4 flow (0-based, auto-detected when omitted)")
    .option("-r, --root <path>", "Project root directory", ".")
    .action(
      async (
        blockId: string,
        options: { intent: string; flow: string; step?: string; root: string },
      ) => {
        const root = options.root;

        let input;
        try {
          input = await loadCheckInput(root);
        } catch {
          console.error(`Error: cannot load .svp/ data from "${root}". Run \`forge init\` first.`);
          process.exitCode = 1;
          return;
        }

        const l4 = input.l4Flows.find((f) => f.id === options.flow);
        if (l4 === undefined) {
          console.error(`Error: L4 artifact "${options.flow}" not found in .svp/l4/`);
          process.exitCode = 1;
          return;
        }

        const kind = getL4Kind(l4);

        // When --step is provided and L4 is a flow, use legacy path for backward compat
        if (options.step !== undefined && kind === "flow") {
          const flow = l4 as L4Flow;
          const stepIndex = Number.parseInt(options.step, 10);
          if (Number.isNaN(stepIndex) || stepIndex < 0 || stepIndex >= flow.steps.length) {
            console.error(
              `Error: step index ${options.step} is out of range (0-${String(flow.steps.length - 1)})`,
            );
            process.exitCode = 1;
            return;
          }

          const findBlock = (idx: number): L3Block | undefined => {
            const step = flow.steps[idx];
            if (step.blockRef === undefined) return;
            return input.l3Blocks.find((b) => b.id === step.blockRef);
          };

          const prevBlock = stepIndex > 0 ? findBlock(stepIndex - 1) : undefined;
          const nextBlock = stepIndex < flow.steps.length - 1 ? findBlock(stepIndex + 1) : undefined;
          const existingBlock = input.l3Blocks.find((b) => b.id === blockId);

          const prompt = buildDesignL3Prompt({
            l4Context: { flow, stepIndex, prevBlock, nextBlock },
            existingBlock,
            userIntent: options.intent,
            language: getLanguage(input.l5),
          });

          console.log(prompt);
          return;
        }

        // Auto-detect block location for any L4 kind
        const blockContext = findBlockContext(l4, blockId);
        if (blockContext === undefined) {
          console.error(
            `Error: block "${blockId}" not found in L4 artifact "${options.flow}" (kind: ${kind})`,
          );
          process.exitCode = 1;
          return;
        }

        // Resolve neighbor L3 blocks from blockContext
        const prevBlock = blockContext.prevBlockRef === undefined
          ? undefined
          : input.l3Blocks.find((b) => b.id === blockContext.prevBlockRef);
        const nextBlock = blockContext.nextBlockRef === undefined
          ? undefined
          : input.l3Blocks.find((b) => b.id === blockContext.nextBlockRef);
        const existingBlock = input.l3Blocks.find((b) => b.id === blockId);

        const prompt = buildDesignL3Prompt({
          l4Context: { l4, blockContext, prevBlock, nextBlock },
          existingBlock,
          userIntent: options.intent,
          language: getLanguage(input.l5),
        });

        console.log(prompt);
      },
    );
}
