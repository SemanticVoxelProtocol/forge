// L3: Logic Block — 最小语义单元
// 契约盒模型：结构化的拓扑骨架 + 自然语言的黑盒内部

import type { ArtifactVersion } from "./version.js";

export interface L3Block {
  readonly id: string;
  readonly name: string;

  // 拓扑骨架（结构化，svp check 校验类型匹配和引用有效性）
  readonly input: readonly Pin[];
  readonly output: readonly Pin[];

  // 黑盒内部（自然语言，AI 编译 + 人阅读）
  readonly validate: Readonly<Record<string, string>>; // 字段路径 -> 规则字符串
  readonly constraints: readonly string[]; // 输出断言
  readonly description: string; // 中间逻辑，AI 的核心输入

  // 版本追踪
  readonly revision: ArtifactVersion;

  // 变更追踪
  readonly contentHash: string;
}

export interface Pin {
  readonly name: string;
  readonly type: string; // 引用 TypeScript interface 名称
  readonly optional?: boolean;
}

// 计算属性，不存储：
// - signature: 从 input/output 自动生成 "name(inputs): output"
// - l2Ref: 从 L2 的 blockRef 反查
// - 所属 L4 flow: 从 L4 steps 的 blockRef 反查
