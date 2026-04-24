// compile — L3 → L2+L1 初始编译 prompt 模板
// 由 forge prompt compile 使用

import { languageDirective } from "../../core/i18n.js";

export function compileInstructions(language = "en"): string {
  return (
    [
      "You are compiling an L3 contract into L1 source code.",
      "",
      "## Steps",
      "",
      "1. Read the L3 contract provided in the Input section",
      "2. Create L1 source file(s) that implement the contract:",
      "   - Function signature matches L3 input/output pins",
      "   - Implementation satisfies all validate rules",
      "   - Output meets all constraints",
      "   - Internal logic follows the description",
      "3. Run `forge link <l3-id> --files <file-paths>` to create the L2 mapping",
      "",
      "## Code Guidelines",
      "",
      "- File naming: follow the target project's language and directory conventions",
      "- Expose a single main entry point named after the block id using the target language's public/export mechanism",
      "- Input parameter types must match L3 input pins",
      "- Return type must match L3 output pins",
      "- Add a corresponding test file using the target project's test conventions",
      "- Use the target language's strictest practical type/lint/runtime checks",
      "- No external dependencies unless specified in L5 integrations",
    ].join("\n") + languageDirective(language)
  );
}

// Backward compat
export const COMPILE_INSTRUCTIONS = compileInstructions();
