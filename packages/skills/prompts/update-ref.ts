// update-ref — L4 断引用修复 prompt 模板
// 由 forge prompt update-ref 使用

import { languageDirective } from "../../core/i18n.js";

export function updateRefInstructions(language = "en"): string {
  return [
    "You are fixing a broken reference in an L4 flow.",
    "An L4 step references an L3 block that doesn't exist.",
    "",
    "## Steps",
    "",
    "1. Examine the L4 flow and identify which step(s) have broken `blockRef` values",
    "2. For each broken reference, decide:",
    "   - **Option A**: Create the missing L3 block with an appropriate contract",
    "   - **Option B**: Fix the L4 step to reference an existing L3 block",
    "3. If creating a new L3 block:",
    "   - Infer input/output pins from the L4 dataFlows (upstream output → this block's input)",
    "   - Write a minimal but useful contract (validate, constraints, description)",
    "   - Write to `.svp/l3/<block-id>.json`",
    "   - Run `forge rehash l3/<id>` to fix contentHash",
    "4. If fixing the L4 reference:",
    "   - Update the step's `blockRef` to point to the correct existing L3 block",
    "   - Update `dataFlows` if pin names differ",
    "   - Run `forge rehash l4` to fix contentHash",
    "",
    "## Important",
    "",
    "- Prefer creating the missing L3 if the intent is clear from context",
    "- Only fix the reference if it's clearly a typo or rename",
    "- Do NOT modify other steps — only fix the broken reference",
    "- After any change, run `forge check` to verify the fix",
  ].join("\n") + languageDirective(language);
}

// Backward compat
export const UPDATE_REF_INSTRUCTIONS = updateRefInstructions();
