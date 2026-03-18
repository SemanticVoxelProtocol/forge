# 贡献指南

感谢你对 SVP Forge 的关注！以下指南帮助你高效参与贡献。

## 行为准则

请阅读并遵守我们的[行为准则](./CODE_OF_CONDUCT.md)。

## AI 政策

我们欢迎 AI 辅助贡献。请阅读我们的 [AI 政策](./AI_POLICY.md) 了解使用 AI 工具贡献时的指南。

## 如何贡献

### 报告 Bug

1. 先搜索[已有 Issues](https://github.com/SemanticVoxelProtocol/forge/issues) 确认没有重复
2. 使用 Bug Report 模板创建 Issue
3. 提供：复现步骤、期望行为、实际行为、环境信息（Node 版本、OS）

### 提议新功能

1. 创建 Feature Request Issue 描述需求
2. 说明：要解决的问题、建议的方案、可能的替代方案
3. 非平凡的 API 变更建议先在 Issue 中讨论，达成共识后再开发

### 提交代码

欢迎通过 Pull Request 贡献代码，包括 bug 修复、新功能、文档改进和测试补充。

## 开发环境

### 前置要求

- Node.js >= 22（见 `.node-version`）
- npm

### 安装与构建

```bash
# 克隆仓库
git clone https://github.com/SemanticVoxelProtocol/forge.git
cd forge

# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 完整检查（TypeScript + ESLint + Prettier）
npm run check
```

## 项目结构

```
packages/
  cli/        CLI 命令（forge check, init, prompt, ...）
  core/       核心逻辑（check, hash, store, view, i18n）
  skills/     AI 工具适配器和 prompt 生成
tests/e2e/    端到端测试
```

## Pull Request 流程

### 分支策略

- `main` — 稳定分支，所有发布从此分支打 tag
- `dev` — 开发分支，日常开发合入此分支
- 功能分支从 `dev` 创建，命名：`feat/描述`、`fix/描述`、`docs/描述`

### PR 步骤

1. Fork 仓库，从 `dev` 创建功能分支
2. 每个 PR 只解决一个问题（不要混合多个无关改动）
3. 为新功能和 bug 修复添加测试
4. 本地运行完整检查：
   ```bash
   npm run check   # tsc --noEmit + eslint + prettier --check
   npm test         # vitest
   ```
5. PR 标题遵循 Conventional Commits 格式（见下方）
6. 关联 Issue：`Fixes #123` 或 `Closes #123`
7. 开启 "Allow edits from maintainers"

### PR 检查清单

- [ ] 代码通过 `npm run check`
- [ ] 测试通过 `npm test`
- [ ] 新功能/bug 修复包含测试
- [ ] 文档已更新（如涉及用户可见变更）
- [ ] PR 标题符合 Conventional Commits

## Commit 规范

遵循 [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)。

### 格式

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(cli): add view command` |
| `fix` | Bug 修复 | `fix(core): handle empty hash input` |
| `docs` | 仅文档 | `docs: update tutorial` |
| `style` | 格式调整，无逻辑变化 | `style: fix indentation` |
| `refactor` | 重构，非 feat/fix | `refactor(store): simplify read logic` |
| `perf` | 性能优化 | `perf(hash): cache computed values` |
| `test` | 测试相关 | `test(check): add edge case coverage` |
| `build` | 构建系统 | `build: update tsconfig target` |
| `ci` | CI 配置 | `ci: add Node 24 to matrix` |
| `chore` | 杂项维护 | `chore: update dependencies` |

### 规则

- 使用祈使句现在时：`add feature` 而非 `added` 或 `adds`
- 首字母小写，末尾不加句号
- 标题行不超过 72 字符
- 破坏性变更在类型后加 `!`：`feat!: remove deprecated API`

## 编码规范

- **TypeScript** — 所有源码必须有类型标注
- **ESLint** — `npm run lint`（配置见 `eslint.config.ts`）
- **Prettier** — `npm run format`（提交前自动格式化）
- **测试** — 使用 Vitest，bug 修复和新功能必须附带测试
- 提交前运行 `npm run check` 确保一切正常

## 发布流程

> 此部分仅面向维护者。

发布通过 CI 自动完成：

1. 确保 `main` 分支 CI 全绿
2. 更新版本号：`npm version patch|minor|major`
3. 推送 tag：`git push --follow-tags`
4. CI 自动通过 npm Trusted Publishing 发布到 npm

## 需要帮助？

- 浏览标记为 [`good first issue`](https://github.com/SemanticVoxelProtocol/forge/labels/good%20first%20issue) 的 Issue
- 在 Issue 或 Discussion 中提问

再次感谢你的贡献！
