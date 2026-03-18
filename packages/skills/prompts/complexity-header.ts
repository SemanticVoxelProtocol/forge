// complexity-header — shared YAML front-matter for complexity tier
// Used by design prompt builders that output raw markdown

import type { Complexity } from "../../core/compile-plan.js";

/** Generate a YAML front-matter block for complexity tier */
export function complexityHeader(c: Complexity): string {
  return `---\ncomplexity: ${c}\n---\n\n`;
}
