<p align="center">
  <img src="https://img.shields.io/npm/v/@svporg/forge?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/github/license/SemanticVoxelProtocol/forge?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square" alt="node" />
</p>

# forge

**forge** 是 [Semantic Voxel Protocol (SVP)](https://github.com/SemanticVoxelProtocol) 的 CLI 工具 — 一个语言无关的语义治理模型，让 AI 辅助开发从架构到受治理源码保持一致。

[English](../../README.md)

## TL;DR

- AI 写代码快，搞坏东西更快。SVP 确保语义变更从拥有承诺的 artifact 开始，而不是随机 patch 代码。
- **L3 契约**定义每个模块做什么（输入、输出、约束）。file/function 治理清单让文件所有权、导出、签名和运行策略与这些契约保持一致。
- `forge check` 在跨层漂移和治理漂移变成 bug 之前就捕捉到它。
- SVP 是语言无关的：manifest 描述语义承诺，特定语言的 scanner/adapter 只提供尽力而为的实现证据。
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

这会创建 `.svp/` 目录并生成对应 AI 工具的 skill 文件。然后在你的 AI 工具中使用 `/forge`（或等价命令）启动引导式工作流。

## 工作原理

SVP 把软件建模为单向语义治理链：

```
L5 意图 → L4 架构 → L3 契约 → L2 映射 → L1 代码
                              │
                              └─ file/fn governance
```

大多数行为在 L3 层设计（每个模块接受什么、返回什么、遵守什么规则）。AI 把 L3 向下编译成可运行的代码，同时 file/function manifest 治理实现边界：文件所有权、导出入口、函数签名、前置条件、后置条件和运行策略。需求变更时，更新语义来源然后重新编译 — 就像改了 `.cpp` 重新 build，而不是去 patch `.so`。

### 五层模型

| 层 | 捕获什么 | 谁来编辑 |
|---|---|---|
| **L5 Blueprint** | 系统意图、领域划分、约束 | 人类 |
| **L4 Flow** | 流程编排、模块间数据流 | 人类 |
| **L3 Block** | 模块契约：输入、输出、校验规则 | 人类 |
| **L2 Code Block** | L3 ↔ L1 文件映射、对账 hash | 自动生成 |
| **L1 Code** | 实现源代码 | AI 编译 |

### 治理清单

| 清单 | 捕获什么 | 谁来编辑 |
|---|---|---|
| **File manifest** | 文件路径、所有权、导出、依赖边界、插件组 | Toolchain + AI |
| **Function manifest** | 导出名、签名、前置条件、后置条件、插件策略 | Toolchain + AI |

### 核心概念

**L3 就是契约。** 不是文档，不是注释 — L3 constraints 是 AI 编译时依据的规范。L3 写得越精确，编译出的代码越准确。

**参考文档 = 头文件。** 把 API 规范、设计稿、算法说明放进 `nodes/<id>/refs/`。它们会自动注入编译 prompt，就像 C 的 `#include`。

**forge check 捕捉漂移。** 基于 hash 的跨层校验，在运行时出 bug 之前发现层间、文件所有权或受治理函数元数据的不一致。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `forge init` | 在项目中初始化 SVP |
| `forge check` | 校验跨层一致性 |
| `forge compile-plan` | 显示哪些需要重新编译 |
| `forge prompt <action> <id>` | 生成 AI 编译 prompt |
| `forge link <l3-id> --files <paths> [--exports file=fn]` | 将源文件映射到 L3 block，并维护 file/function manifest |
| `forge view <layer>` | 查看层内容 |
| `forge rehash` | 重新计算内容 hash |
| `forge changeset start <name>` | 追踪一组相关变更 |
| `forge docs check` | 校验文档覆盖度 |

## 支持的 AI 工具

forge 为每个 AI 工具生成对应格式的 skill 文件：

| 工具 | 生成文件 | 调用方式 |
|------|----------|---------|
| Claude Code | `.claude/commands/forge.md`、`CLAUDE.md` 章节 | `/forge` |
| Cursor | `.cursor/commands/forge.md`、`.cursor/rules/svp.mdc` | `/forge` + rules 自动加载 |
| Windsurf | `.windsurf/commands/forge.md`、`.windsurf/rules/svp.md` | `/forge` + rules 自动加载 |
| Codex | `.codex/skills/svp/SKILL.md`、`AGENTS.md` 章节 | 自动加载 |
| GitHub Copilot | `.github/prompts/svp.prompt.md`、`.github/copilot-instructions.md` | Prompt + instructions 自动加载 |
| Kimi Code | `.agents/skills/svp/SKILL.md`、`AGENTS.md` 章节 | `/skill:svp` |
| Gemini CLI | `.gemini/skills/svp/SKILL.md`、`GEMINI.md` 章节 | 自动加载 |

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
