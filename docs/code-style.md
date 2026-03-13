# SVP 代码风格规范

## 依赖管理

始终使用最新稳定版依赖。不锁定旧版本，不容忍已知的 deprecation warning。

## 命名

| 对象 | 风格 | 示例 |
|---|---|---|
| 文件名 | kebab-case | `l3-block.ts`、`hash.ts` |
| 类型/接口 | PascalCase | `L3Block`、`Pin`、`DataFlow` |
| 变量/函数 | camelCase | `computeHash`、`blockRef` |
| 常量 | UPPER_SNAKE_CASE | `SVP_DIR`、`MAX_RETRY` |
| 泛型参数 | 单字母大写或语义 PascalCase | `T`、`TResult`、`TError` |

## 不可变性

所有接口字段加 `readonly`。所有数组字段用 `readonly T[]`。

```typescript
// 正确
export interface L3Block {
  readonly id: string;
  readonly input: readonly Pin[];
}

// 错误
export interface L3Block {
  id: string;
  input: Pin[];
}
```

函数参数默认视为不可变——不修改入参，返回新对象。

## 错误处理

使用 `Result<T, E>` 类型，不用 throw。

```typescript
// 正确
function parseNode(yaml: string): Result<L3Block, ParseError> {
  if (/* 无效 */) return err({ code: "INVALID_YAML", message: "..." });
  return ok(block);
}

// 错误
function parseNode(yaml: string): L3Block {
  if (/* 无效 */) throw new Error("invalid yaml");
  return block;
}
```

例外：只有「不应该发生」的逻辑错误（bug）才用 throw——表示程序员犯了错，不是用户输入问题。

## 函数设计

### 纯函数优先

尽量写纯函数——相同输入永远返回相同输出，没有副作用。副作用（IO、状态修改）集中在最外层。

```typescript
// 纯函数：计算 hash
function computeHash(obj: Record<string, unknown>): string { ... }

// 副作用函数：读写文件，放在边界层
async function writeL3(root: string, block: L3Block): Promise<void> { ... }
```

### 参数规则

- **≤ 2 个参数**：直接写

```typescript
function hashL3(block: Omit<L3Block, "contentHash" | "source">): string
function readL3(root: string, id: string): Promise<L3Block | null>
```

- **≥ 3 个参数**或**有可选参数**：用 options 对象

```typescript
function createFlow(options: {
  readonly id: string;
  readonly name: string;
  readonly trigger?: Trigger;
  readonly steps: readonly Step[];
}): L4Flow
```

### 单一职责

一个函数做一件事。如果函数名需要用「和」连接才能描述，就该拆分。

## 导出

### 包对外

index.ts 统一导出公开 API。外部消费者推荐从包入口导入：

```typescript
import { L3Block, hashL3 } from "@svp/core";
```

### 包内部

直接 import 子模块，不走 index.ts（避免循环依赖）：

```typescript
import type { L3Block } from "./l3";
import { computeHash } from "./hash";
```

### 类型导入

始终用 `import type` 导入纯类型（ESLint 强制）：

```typescript
// 正确
import type { L3Block } from "./l3";

// 错误
import { L3Block } from "./l3";
```

## 文件组织

一个文件一个类型或模块。文件名对应其导出的核心内容。

```
packages/core/
├── l3.ts          # L3Block, Pin
├── l4.ts          # L4Flow, Step, DataFlow, Trigger
├── l5.ts          # L5Blueprint, Domain, Integration
├── l2.ts          # L2CodeBlock
├── common.ts      # Source（跨层共享）
├── hash.ts        # contentHash 计算
├── computed.ts    # 计算属性（signature 等）
├── store.ts       # 读写 .svp/ 的 JSON
└── index.ts       # 公开 API 导出
```

相关的小类型（如 `Pin` 跟 `L3Block`）可以放同一个文件。判断标准：这个类型脱离主类型是否有独立意义？没有就放一起。

## 注释

### 语言

统一中文。

### 什么时候写

- **为什么**，不是**是什么**。代码能说清楚「做了什么」，注释解释「为什么这么做」。
- 公开 API 写 JSDoc（函数签名不能自解释时）。
- 不给一目了然的代码加注释。

```typescript
// 正确：解释为什么
// 排除 contentHash 和 source.hash 字段本身（避免循环依赖）
function stripHashFields(obj: unknown): unknown { ... }

// 错误：重复代码已经说的
// 创建一个哈希
const hash = createHash("sha256");
```

## Lint 与格式化

- **ESLint**：typescript-eslint strict-type-checked + unicorn + import-x
- **Prettier**：统一格式化，不手动调
- **`npm run check`**：tsc + eslint + prettier，CI 必须全过

详细配置见 `eslint.config.ts` 和 `.prettierrc`。

## 测试规范

### 框架与工具

- **Vitest**：与 TypeScript + ESM 无缝集成，内置 coverage、watch mode、snapshot。
- 运行方式：`vitest run`（CI）、`vitest`（开发时 watch mode）。

### 文件放置

测试文件与源码同目录，后缀 `.test.ts`：

```
packages/core/
├── hash.ts
├── hash.test.ts      # 紧挨着源码
├── computed.ts
├── computed.test.ts
└── store.test.ts
```

不建立单独的 `__tests__/` 或 `tests/` 目录。理由：找文件时一眼看到测试在不在，重构移动文件时不会漏掉测试。

### 命名

- 文件名：`<模块名>.test.ts`
- describe：模块或函数名
- it/test：用「动词 + 预期结果」描述行为，中文

```typescript
describe("computeHash", () => {
  it("相同输入产生相同哈希", () => { ... });
  it("字段顺序不影响哈希", () => { ... });
  it("排除 contentHash 字段", () => { ... });
});
```

### 测什么

| 必须测 | 不必测 |
|---|---|
| 纯函数的输入→输出 | 类型定义（TS 编译器保证） |
| 边界条件（空数组、null、缺少可选字段） | 第三方库内部逻辑 |
| 错误路径（Result 的 err 分支） | 简单的直通 re-export |
| hash 稳定性（快照测试） | getter/setter 一行代码 |

### 测试风格

- **Arrange-Act-Assert**：三段式，段间空行分隔。
- **一个 test 只断言一个行为**。多个断言可以，但必须验证同一件事。
- **不 mock 自己的代码**。只 mock 外部 IO（文件系统、网络）。store 测试用真实临时目录。
- **测试也遵守 lint**，仅放宽 `explicit-function-return-type` 和 `no-floating-promises`。

```typescript
it("写入后能读回相同内容", async () => {
  // Arrange
  const root = await mkdtemp(join(tmpdir(), "svp-"));
  const block: L3Block = { /* ... */ };

  // Act
  await writeL3(root, block);
  const loaded = await readL3(root, block.id);

  // Assert
  assert.deepStrictEqual(loaded, block);
});
```

## Git 规范

### 分支策略

- **主干开发**（trunk-based）：`main` 是唯一长期分支。
- 功能分支：`feat/<scope>-<description>`，如 `feat/core-check-command`。
- 修复分支：`fix/<scope>-<description>`。
- 分支生命周期 < 3 天。超过说明拆分不够细。

### Commit Message

格式遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <description>

[optional body]
```

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `refactor` | 重构（不改行为） |
| `test` | 添加/修改测试 |
| `docs` | 文档 |
| `chore` | 构建、CI、依赖更新 |

- scope：`core`、`cli`、`compiler` 等包名。
- description：英文，祈使句，首字母小写，不加句号。如：`feat(core): add L3 contentHash computation`

### 原则

- **原子提交**：一个 commit 做一件事。能独立 revert 且不破坏构建。
- **提交前必须通过 `npm run check`**（tsc + eslint + prettier + test）。
- 不提交生成文件（`.svp/` 目录下的 JSON 由工具管理，不进 git）。

## 依赖策略

### 原则：优先复用

优先使用成熟的第三方包，不重复造轮子。自己手写容易出 bug 的功能（YAML 解析、schema validation、日期处理等），直接用社区方案。

只有在功能极其简单（几行代码搞定）且无边界情况时才手写——如当前的 hash 计算。

### 引入标准

引入新依赖前确认：

1. **维护活跃**：近 6 个月有发版或合 PR。
2. **社区认可**：npm 周下载量合理，GitHub star 不是唯一指标但可参考。
3. **类型完善**：自带 TS 类型或有 `@types/*`。
4. **体积合理**：不为一个小功能引入巨型包。

### 版本策略

- **始终最新**：定期 `npm update`，不容忍已知 deprecation。
- **锁文件提交**：`package-lock.json` 进 git，保证可复现构建。

## 版本规范

### 双轨版本

SVP 有两个独立的版本号：

| 版本 | 含义 | 存放位置 |
|---|---|---|
| **协议版本**（Protocol Version） | L2–L5 数据模型的契约 | `L5Blueprint.version` |
| **工具链版本**（Toolchain Version） | `@svp/core`、`@svp/cli` 等包的实现版本 | `package.json` |

协议版本和工具链版本**独立演进**。工具链升级（如优化 hash 算法）不一定改协议版本；协议新增字段则必须升协议版本。

### 协议版本 — 语义化

```
<major>.<minor>
```

- **major**：不兼容变更（删除字段、改变字段含义、改变 hash 算法）。旧 `.svp/` 数据需要迁移。
- **minor**：向后兼容扩展（新增可选字段、新增层级）。旧工具读新数据只是忽略新字段。

没有 patch——协议层面没有「bug fix」概念，要么兼容要么不兼容。

### 工具链版本 — Semver

标准 [SemVer](https://semver.org/)：`major.minor.patch`

- **major**：公开 API 不兼容变更（函数签名改了、导出删了）。
- **minor**：新增功能（新导出、新命令）。
- **patch**：bug 修复、性能优化、内部重构。

### 兼容性矩阵

工具链发版时声明支持的协议版本范围：

```typescript
// packages/core/version.ts
export const PROTOCOL_VERSION = "1.0";
export const SUPPORTED_PROTOCOLS = ["1.0"] as const;
```

读取 `.svp/` 数据时检查协议版本——不在支持范围内则返回 `Result` 错误，不静默降级。
