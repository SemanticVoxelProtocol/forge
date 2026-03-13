// packages/skills — AI Skill 实现 & Claude Code 集成
// 提供：rehash、link、prompt 模板、adapter、slash command 模板

export { rehashL5, rehashL4, rehashL3, rehashL2 } from "./rehash.js";
export type { RehashResult } from "./rehash.js";

export { createL2Link, relinkL2 } from "./link.js";
export type { LinkOptions } from "./link.js";

export { buildPrompt, renderPrompt } from "./prompt-builder.js";
export type { StructuredPrompt } from "./prompt-builder.js";

export { claudeCodeAdapter } from "./adapters/claude-code.js";

export { generateSlashCommands } from "./templates/slash-commands.js";
export type { SlashCommandTemplate } from "./templates/slash-commands.js";

export { generateClaudeMdSection } from "./templates/claude-md.js";
