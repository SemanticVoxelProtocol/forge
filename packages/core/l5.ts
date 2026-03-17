// L5: Blueprint — 项目意图和边界
// 最顶层，聚合多个 L4 flow

import type { ArtifactVersion } from "./version.js";

export interface L5Blueprint {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  // 黑盒（自然语言）
  readonly intent: string; // 核心问题 + 解决方案 + 成功标准
  readonly constraints: readonly string[]; // 功能 / 非功能 / 业务约束

  // 拓扑骨架（结构化）
  readonly domains: readonly Domain[];
  readonly integrations: readonly Integration[];

  // 版本追踪
  readonly revision: ArtifactVersion;

  // 语言偏好（ISO 639-1，如 "en" / "zh"）
  readonly language?: string;

  // 变更追踪
  readonly contentHash: string;
}

export interface Domain {
  readonly name: string;
  readonly description: string; // 自然语言
  readonly dependencies: readonly string[]; // 依赖的其他 domain 名称
}

export interface Integration {
  readonly name: string;
  readonly type: "database" | "api" | "messageQueue" | "storage";
  readonly description: string; // 自然语言
}

// 计算属性，不存储：
// - 每个 domain 包含哪些 L4 flows: 从 L4 flow 的 source.ref 反算
