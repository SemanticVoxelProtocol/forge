// review — L1 漂移审查 prompt 模板
// 由 forge prompt review 使用

import { languageDirective } from "../../core/i18n.js";

export function reviewInstructions(language = "en"): string {
  return (
    [
      "You are reviewing a drift between L3 contract and L1 implementation.",
      "The L1 code was manually modified and no longer matches the L3 spec.",
      "",
      "## Steps",
      "",
      "1. Compare L3 contract (pins, validate, constraints) with L1 actual exports",
      "2. For each difference, classify as:",
      "   - **L3 needs update**: The code change was intentional, L3 should be updated to match",
      "   - **L1 is wrong**: The code change was a mistake, L1 should be reverted",
      "   - **Cosmetic only**: Formatting/naming difference that doesn't affect interface",
      "3. Report findings — do NOT make any changes",
      "",
      "## Report Format",
      "",
      "For each difference found:",
      "```",
      "- [L3/L1/cosmetic] <description>",
      "  L3 says: <what the contract specifies>",
      "  L1 does: <what the code actually does>",
      "  Recommendation: <specific action>",
      "```",
      "",
      "## Important",
      "",
      "- This is a READ-ONLY review — do not modify any files",
      "- Focus on interface compatibility (pins, types, exported functions)",
      "- Internal implementation changes that don't affect the interface are cosmetic",
      "- If L3 needs update, the user must decide — flag it for human review",
    ].join("\n") + languageDirective(language)
  );
}

// Backward compat
export const REVIEW_INSTRUCTIONS = reviewInstructions();
