<p align="center">
  <img src="https://img.shields.io/npm/v/@svporg/forge?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/github/license/SemanticVoxelProtocol/forge?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square" alt="node" />
</p>

# forge

**forge** 是 [Semantic Voxel Protocol (SVP)](https://github.com/SemanticVoxelProtocol) 的 CLI 工具 — 一个分层编译模型，为 AI 辅助开发带来软件工程规范。

[English](../../README.md)

## TL;DR

- AI 写代码快，搞坏东西更快。SVP 确保每次变更从架构开始，向下编译到代码 — 而不是反过来。
- **L3 契约**定义每个模块做什么（输入、输出、约束）。AI 把它们编译成源代码。
- `forge check` 在跨层漂移变成 bug 之前就捕捉到它。
- 支持任何 AI 工具：Claude Code、Cursor、Windsurf、Codex、GitHub Copilot、Kimi Code 等。

## 安装

```bash
npm install -g @svporg/forge
```

## 快速开始

```bash
# 在项目中初始化 SVP
forge init

# 指定 AI 工具的 adapter
forge init --host claude-code
forge init --host cursor
```

这会创建 `.svp/` 目录并生成对应 AI 工具的 skill 文件。然后在你的 AI 工具中使用 `/svp`（或等价命令）启动引导式工作流。

## 工作原理

SVP 把软件建模为单向编译链：

```
L5 意图  →  L4 架构  →  L3 契约  →  L2 骨架  →  L1 代码
```

你在 L3 层设计（每个模块接受什么、返回什么、遵守什么规则）。AI 把 L3 向下编译成可运行的代码。需求变更时，更新 L3 然后重新编译 — 就像改了 `.cpp` 重新 build，而不是去 patch `.so`。

### 五层模型

| 层 | 捕获什么 | 谁来编辑 |
|---|---|---|
| **L5 Blueprint** | 系统意图、领域划分、约束 | 人类 |
| **L4 Flow** | 流程编排、模块间数据流 | 人类 |
| **L3 Block** | 模块契约：输入、输出、校验规则 | 人类 |
| **L2 Code Block** | L3 ↔ L1 文件映射、对账 hash | 自动生成 |
| **L1 Code** | 实现源代码 | AI 编译 |

### 核心概念

**L3 就是契约。** 不是文档，不是注释 — L3 constraints 是 AI 编译时依据的规范。L3 写得越精确，编译出的代码越准确。

**参考文档 = 头文件。** 把 API 规范、设计稿、算法说明放进 `nodes/<id>/refs/`。它们会自动注入编译 prompt，就像 C 的 `#include`。

**forge check 捕捉漂移。** 基于 hash 的跨层校验，在运行时出 bug 之前发现层间不一致。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `forge init` | 在项目中初始化 SVP |
| `forge check` | 校验跨层一致性 |
| `forge compile-plan` | 显示哪些需要重新编译 |
| `forge prompt <action> <id>` | 生成 AI 编译 prompt |
| `forge link <l3-id> --files <paths>` | 将源文件映射到 L3 block |
| `forge view <layer>` | 查看层内容 |
| `forge rehash` | 重新计算内容 hash |
| `forge changeset start <name>` | 追踪一组相关变更 |
| `forge docs check` | 校验文档覆盖度 |

## 支持的 AI 工具

forge 为每个 AI 工具生成对应格式的 skill 文件：

| 工具 | Skill 位置 | 调用方式 |
|------|-----------|---------|
| Claude Code | `.claude/commands/svp.md` | `/svp` |
| Cursor | `.cursor/rules/svp.mdc` | 自动加载 |
| Windsurf | `.windsurfrules/svp.md` | 自动加载 |
| Codex | `AGENTS.md` 章节 | 自动加载 |
| GitHub Copilot | `.github/copilot-instructions.md` | 自动加载 |
| Kimi Code | `.kimi/rules/svp.md` | 自动加载 |
| Gemini CLI | `GEMINI.md` 章节 | 自动加载 |

```bash
forge init --host cursor       # 生成 Cursor skill 文件
forge init --host claude-code  # 生成 Claude Code slash command
```

## 推荐搭配 OpenSpec

[OpenSpec](https://github.com/Fission-AI/OpenSpec) 确保 AI 写代码**之前**需求清晰。SVP 确保 AI 写完**之后**各层一致。搭配使用形成完整的 需求 → 架构 → 验证 流水线。

## 开发

```bash
git clone https://github.com/SemanticVoxelProtocol/forge.git
cd forge
npm install
npm test          # vitest
npm run check     # tsc + eslint + prettier
```

### 目录结构

```
packages/
├── core/        数据模型类型、hash 函数、校验逻辑
├── skills/      Prompt 生成器 + 各 AI 工具的 skill 文件
└── cli/         CLI 入口（forge 命令）
```

## 社区

- [贡献指南](../../CONTRIBUTING.md)（[中文](../../i18n/zh/CONTRIBUTING.md)）
- [行为准则](../../CODE_OF_CONDUCT.md)（[中文](../../i18n/zh/CODE_OF_CONDUCT.md)）
- [安全政策](../../SECURITY.md)
- [AI 政策](../../AI_POLICY.md)（[中文](../../i18n/zh/AI_POLICY.md)）

## License

[MIT](../../LICENSE)
