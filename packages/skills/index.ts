// packages/skills — AI Skill 实现 & host adapter 集成
// 提供：rehash、link、prompt 模板、adapter、slash command 模板

export { rehashL5, rehashL4, rehashL3, rehashL2 } from "./rehash.js";
export type { RehashResult } from "./rehash.js";

export { createGovernedLink, createL2Link, relinkL2 } from "./link.js";
export type { CreateGovernedLinkOptions, GovernedLinkResult, LinkOptions } from "./link.js";

export { buildPrompt, renderPrompt } from "./prompt-builder.js";
export type { StructuredPrompt } from "./prompt-builder.js";

export { generateSlashCommands } from "./templates/slash-commands.js";
export type { SlashCommandTemplate } from "./templates/slash-commands.js";

export { generateClaudeMdSection } from "./templates/claude-md.js";

// Scan prompt builders (brownfield reverse generation)
export { buildScanL3Prompt, buildScanL4Prompt, buildScanL5Prompt } from "./prompts/scan.js";
export type { ScanL3Input, ScanL4Input, ScanL5Input } from "./prompts/scan.js";

// Host adapter system
export { getAdapter, getAllAdapterIds } from "./adapters/index.js";
export type { HostId, HostAdapter, SkillFile } from "./adapters/index.js";
