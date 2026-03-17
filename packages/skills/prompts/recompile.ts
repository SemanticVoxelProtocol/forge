// recompile — L3 变更 → 重编译 L2+L1 prompt 模板
// 由 svp prompt recompile 使用

import { languageDirective } from "../../core/i18n.js";

export function recompileInstructions(language = "en"): string {
  return [
    "You are recompiling L1 source code because its L3 contract has changed.",
    "",
    "## Steps",
    "",
    "1. Compare the updated L3 contract with the current L2 mapping",
    "2. Identify what changed (pins added/removed/renamed, constraints modified, etc.)",
    "3. Update only the affected parts of the L1 source code:",
    "   - If pins changed: update function signature and related logic",
    "   - If constraints changed: update validation/assertion logic",
    "   - If description changed: update internal implementation",
    "4. Preserve unchanged logic — minimize diff",
    "5. Update tests to match the new contract",
    "6. Run `svp link <l3-id> --files <file-paths>` to update the L2 mapping",
    "",
    "## Important",
    "",
    "- Do NOT rewrite from scratch — modify incrementally",
    "- Keep existing test cases that are still valid",
    "- If a pin was renamed, update all usages",
    "- If a pin was removed, remove dead code",
  ].join("\n") + languageDirective(language);
}

// Backward compat
export const RECOMPILE_INSTRUCTIONS = recompileInstructions();
