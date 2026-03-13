// Code CLI Adapter — 桥接 SVP 和宿主 CLI（Claude Code / Cursor / Codex 等）
//
// SVP 是寄生在 Code CLI 上的协议层，不是独立调用 AI 的工具。
// Adapter 负责：
//   1. 把 SkillInput 转换为宿主 CLI 能理解的指令
//   2. 调用宿主 CLI 的原生 AI 能力执行任务
//   3. 把宿主返回的结果转换为 SkillResult

import type { SkillRegistry } from "./skill.js";

/** Code CLI 适配器 — 桥接 SVP 和宿主 CLI */
export interface CodeCLIAdapter {
  /** 宿主 CLI 名称（用于日志/诊断） */
  readonly name: string;
  /** 创建包含所有内置 Skill 的注册表（skill 实现由宿主提供） */
  readonly createSkillRegistry: () => SkillRegistry;
}
