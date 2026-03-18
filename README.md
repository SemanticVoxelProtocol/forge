# SVP — Semantic Voxel Protocol

五层数据模型，让人类在 AI 写代码时不失控。

## 核心理念

AI 会出错。SVP 不试图消灭错误，而是让错误**可见、可定位、可修复**。

五层结构是五个观测窗口：

```
L5  Blueprint    系统的意图和边界
L4  Logic Chain  流程如何编排
L3  Logic Block  每个单元做什么（契约盒）
L2  Code Block   L3 ↔ L1 的映射
L1  Code         最终实现
```

出问题时逐层问：意图对吗？流程对吗？契约写够了吗？代码结构对吗？实现忠实吗？

## 定位

SVP 不自己调 AI API，不造编译器。SVP 是 AI 编码工具（Claude Code、Cursor、Windsurf、Kimi Code、Codex、GitHub Copilot）的**增强层**：

- **工具链**：`forge check`（校验）、store（读写）、hash（变更追踪）
- **Skills**：基于五层数据模型生成结构化 context，喂给用户已有的 AI 工具

类似 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 的定位——不造 AI，给 AI 喂更好的上下文。SVP 的能力随 base model 进化自动提升。

## 设计原则

1. **透明优先于正确** — 追求错误可见，不追求 AI 不犯错
2. **AI 即编译器** — 格式优化 AI 理解，不是 parser 解析
3. **只做真正的声明式** — 伪声明式不如自然语言
4. **存得少算得多** — 单一数据源 + 计算，避免不一致
5. **协议与实现分离** — SVP 是语言无关的规范，工具链是独立的

## 数据模型

核心是四层有独立数据模型的结构（L1 是文件系统）：

| 层 | 数据模型 | 结构化部分 | 自然语言部分 |
|---|---|---|---|
| L5 | `L5Blueprint` | 领域拓扑、集成点 | 意图、约束 |
| L4 | `L4Flow` | 步骤、数据流 | — |
| L3 | `L3Block` | 输入输出 pins | validate、constraints、description |
| L2 | `L2CodeBlock` | 文件映射、对账哈希 | — |

类型定义在 `packages/core/`。

## svp check

层间一致性校验，检查四类问题：

1. **Hash 一致性** — contentHash 和实际内容是否匹配
2. **引用完整性** — 层间引用的实体是否存在，pin 是否匹配
3. **漂移检测** — L2 sourceHash 和 L3 contentHash 是否一致
4. **图结构** — L4 step 链是否有环、是否有孤立节点

详见 [check 错误码参考](docs/check-reference.md)。

## 开发

```bash
npm install
npm test         # vitest
npm run check    # tsc + eslint + prettier
```

## 文档

- [架构](docs/architecture.md) — 五层数据模型、变更传播、工具链、目录结构
- [设计理由](docs/design-rationale.md) — 为什么这么设计，每个决策的推理过程
- [代码风格](docs/code-style.md) — 开发规范（命名、测试、git、依赖、版本）
- [交互架构](docs/interaction.md) — 逐层渗透模型、虚拟文件树、聚焦视图、编译计划
- [check 错误码](docs/check-reference.md) — forge check 的所有错误/警告及修复建议

## 目录

```
packages/
├── core/        五层数据模型的 TypeScript 类型定义 + 核心函数
├── skills/      Prompt 生成器（design-l3、compile、recompile 等）
└── cli/         CLI 入口（forge 命令）

docs/            设计文档 + 开发规范
examples/        示例项目（hello-world、order-service）
```
