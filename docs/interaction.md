# SVP 交互架构：逐层渗透模型

> SVP 如何与 AI 编码工具协作——虚拟文件树、聚焦视图、逐层编译。
> 整体架构见 `docs/architecture.md`，变更传播见其中"变更传播"章节。

## 核心思路

SVP 不让 AI 自由浏览五层数据。SVP 给 AI **聚焦的视野**——在某一层看到该层的全貌，需要时切换层级。

AI 编码工具（Claude Code、Cursor 等）天然围绕文件树 + 文件操作设计。SVP 把五层数据模型包装成虚拟文件树，让 AI 工具零学习成本操作 SVP 数据。

---

## 虚拟文件树

`svp view` 命令把 `.svp/` 下的 JSON 数据实时渲染成 AI 友好的视图。不是真实文件，是按需计算的。

```
svp view l5               # L5 overview
svp view l4               # 所有 flow 的 overview
svp view l4/create-order  # 某个 flow 的 detail
svp view l3               # 所有 block 的 overview
svp view l3/validate-order # 某个 block 的 detail
svp view l2               # 所有 code block 的 overview
svp view l1               # 源文件树（映射到真实文件系统）
```

### Overview 视图

每个实体在 overview 里只占一行——名字 + 签名 + 摘要统计。AI 看到全局拓扑，不被细节淹没。

```
# svp view l3

L3 Logic Blocks (7 blocks)
──────────────────────────
validate-order    (OrderRequest) → ValidationResult
  validate: 6 rules | constraints: 2 | desc: 逐项校验所有字段...

check-inventory   (OrderData) → InventoryStatus
  validate: 3 rules | constraints: 1 | desc: 检查库存是否充足...

reserve-inventory (Reservation) → ReserveConfirmation
  validate: 2 rules | constraints: 3 | desc: 预占库存并设置超时...
⋮ (4 more)
```

```
# svp view l4

L4 Logic Chains (2 flows)
─────────────────────────
create-order  POST /api/orders
  validate-order → check-inventory → reserve-inventory → persist-order → initiate-payment

cancel-order  POST /api/orders/:id/cancel
  lookup-order → check-cancelable → reverse-payment → release-inventory
```

### Detail 视图

展示该层的完整信息，但不自动展开其他层。用 `↑` `↓` 标注关联层，AI 知道往哪切换但不自动加载。

```
# svp view l3/validate-order

validate-order
══════════════
(OrderRequest, ValidateOptions?) → ValidationResult

pins:
  in:  request: OrderRequest       [required]
       options: ValidateOptions    [optional]
  out: result: ValidationResult

validate:
  request          → required
  request.user_id  → uuid, required
  request.items    → array, min 1, max 50
  request.items[].product_id → uuid, required
  request.items[].quantity   → number, > 0, <= 999
  request.email    → email, required

constraints:
  • output.result.valid iff output.result.errors is empty
  • output.result.errors contains all failed checks, not just first

description:
  逐项校验所有字段，收集全部错误后返回，不遇到第一个就停。

↑ L4: used in create-order (step 1/5)
↓ L2: validate-order [synced ✓]
```

```
# svp view l4/create-order

create-order
════════════
trigger: HTTP POST /api/orders

  ┌─────────────┐    ┌─────────────────┐    ┌───────────────────┐
  │validate-order│───→│check-inventory  │───→│reserve-inventory  │
  └─────────────┘    └─────────────────┘    └───────────────────┘
                                                      │
                     ┌─────────────────┐    ┌─────────┘
                     │initiate-payment │←───│persist-order      │
                     └─────────────────┘    └───────────────────┘

dataFlows:
  v.result       → inv.order_data
  inv.available  → res.reservation
  res.confirmed  → ord.order
  ord.saved      → pay.order

↑ L5: domain "order"
```

### 视图格式原则

- **像代码不像 JSON** — AI 训练数据中代码和 Markdown 最多，JSON schema 最难读
- **Overview 极度压缩** — 一个实体一行，签名 + 统计
- **Detail 完整但有边界** — 展示本层全部信息，不展开其他层
- **层间导航显式** — `↑` `↓` 标注关联，AI 按需切换

### 性能

虚拟文件树由 CLI 实时计算渲染。大型项目（几百个 block）的热路径（hash 计算、树渲染）可能需要 Rust 辅助（via napi-rs）以保持响应速度。

---

## 逐层渗透：AI 的工作模型

### 三条规则

1. **用户在哪层，AI 从下一层进入**
2. **严格单向向下，不回头**
3. **做不到就报错，说清哪层有什么问题**

### 工作流

```
用户在 L5 → AI 入口 L4 → L3 → L2 → L1    （全量编译）
用户在 L4 → AI 入口 L3 → L2 → L1          （流程级编译）
用户在 L3 → AI 入口 L2 → L1               （单 block 编译）
用户在 L2 → AI 入口 L1                    （纯代码生成）
用户在 L1 → AI 不介入，用户自己改代码       （手动模式，触发向上对账）
```

越高层介入，编译深度越深，上下文消耗越大。越低层介入，越精确，越便宜。

### 示例：在 L4 加一个步骤

```
用户（在 L4）："create-order 流程里，validate 之后加一个限流步骤"

主 Agent（L4 层，上下文极少）：
  1. svp view l4/create-order   ← 看当前流程
  2. svp edit l4/create-order   ← 在 validate-order 后加 rate-limit 步骤
  3. svp compile-plan           ← SVP 计算变更范围

SVP 输出编译计划：
  - [新建] L3/rate-limit       ← 需要定义契约盒
  - [更新] L2/rate-limit       ← 需要生成代码映射
  - [新建] L1/rate-limit.ts    ← 需要生成源代码

主 Agent 派发 subagent（每个 subagent 有独立的小上下文）：
  → Subagent A（L3）：定义 rate-limit 的 pins/validate/constraints/description
  → Subagent B（L2）：生成 L2CodeBlock（文件映射）
  → Subagent C（L1）：根据 L3 契约 + L2 骨架，生成源代码

每个 subagent 只看到自己那层的最小必要信息。
主 Agent 的上下文始终只有 L4 拓扑级别的信息。
```

### 示例：在 L3 改一条校验规则

```
用户（在 L3）："validate-order 的 email 改成可选"

主 Agent（L3 层）：
  1. svp view l3/validate-order  ← 看当前契约
  2. svp edit l3/validate-order  ← 删掉 email 的 required
  3. svp compile-plan            ← SVP 计算变更范围

SVP 输出编译计划：
  - [更新] L2/validate-order    ← sourceHash 不匹配，需要重编译
  - [更新] L1/validate-order.ts ← 代码需要更新

主 Agent 派发 subagent：
  → Subagent A（L2+L1）：根据更新后的 L3 契约重新生成代码

编译深度浅，上下文更少，速度更快。
```

### 示例：用户直接改 L1 代码

```
用户（在 L1）：直接编辑 src/validate-order.ts 的第 42 行

SVP 检测到 L1 变化：
  - L2/validate-order 的 contentHash 和 L1 实际哈希不匹配
  - 标记 drift（对账警告）

用户跑 svp check：
  WARNING [SOURCE_DRIFT] l2/validate-order: contentHash 不匹配，L1 被手动修改

用户决定：
  a. 接受 L1 的改动 → svp accept l2/validate-order → 更新 contentHash
  b. 回退 L1 → 从 L3 重新编译覆盖
  c. 同时更新 L3 契约 → 手动修改后重新编译
```

---

## 上下文效率

### 每层的上下文量

```
L5（意图层）：    ~10 行     ← 用户能一眼看完
L4（流程层）：    ~20 行/flow ← 主 Agent 的工作空间
L3（契约层）：    ~50 行/block ← subagent 轻松处理
L2（映射层）：    ~30 行/block ← 几乎是机械转换
L1（代码层）：    ~200+ 行/block ← 最重，但隔离在 subagent 里
```

**最重的上下文（L1 代码）离用户最远，最轻的上下文（L4/L5 拓扑）在用户手边。**

### 为什么有效

1. **用户永远不会被代码细节淹没** — 用户操作的层级上下文最少
2. **subagent 隔离** — 每个 subagent 只看一层的一个实体，上下文极小
3. **天然并行** — 多个 block 的 L3→L2→L1 编译可以并行
4. **失败隔离** — 某个 L1 subagent 失败只需重跑那一个，契约没变成本很低

### 对比传统方式

```
传统 AI 编码：
  用户说"加个限流" → AI 读整个项目 → 直接改代码
  上下文：整个项目的代码（可能几千行）
  风险：AI 可能改错地方、遗漏关联、无法追踪变更

SVP 逐层渗透：
  用户说"加个限流" → 主 Agent 只看 L4 拓扑（20 行）→ subagent 各自处理
  上下文：每个 agent 最多几十行
  风险：每层都有 svp check 校验，问题逐层可见
```

---

## 编译计划：svp compile-plan

用户或 AI 修改了某层数据后，`svp compile-plan` 计算需要重编译的范围。

输入：当前层的变更（哪些实体的 contentHash 变了）。

输出：结构化的任务清单，每个任务是一个独立的编译单元。

```
# svp compile-plan 的输出示例

Compile Plan (3 tasks)
──────────────────────
[1] CREATE  L3/rate-limit
    reason: L4/create-order 新增了 step "rate-limit"，对应 L3 不存在
    input:  L4 step 定义 + 相邻 block 的 pin 信息（用于推断接口）

[2] CREATE  L2/rate-limit
    reason: L3/rate-limit 新建，需要配对 L2
    input:  L3/rate-limit 的完整契约
    depends: [1]

[3] CREATE  L1/rate-limit.ts
    reason: L2/rate-limit 新建，需要生成源代码
    input:  L3 契约 + L2 文件映射 + types/ 相关类型
    depends: [2]
```

每个任务标注了：
- **操作类型**（CREATE / UPDATE）
- **原因**（为什么需要编译）
- **输入**（subagent 需要的最小上下文）
- **依赖**（任务间的先后关系）

AI 编码工具根据这个计划派发 subagent。无依赖的任务可以并行。

---

## 与 svp check 的关系

`svp check` 是编译后的验收工具。

```
用户改 L4 → AI 逐层编译 → svp check
                              │
                  ┌────────────┼────────────┐
                  ▼            ▼            ▼
             hash 一致？   引用完整？    drift？
                  │            │            │
                  OK          OK        WARNING
                                    L2/rate-limit contentHash 不匹配
```

check 报什么层有问题，用户就去那层看。这是逐层渗透模型的**闭环**：

```
用户改上层 → AI 向下编译 → svp check 校验 → 有问题回到对应层修 → 再次向下编译
```

---

## 设计理由

### 为什么严格单向，不做反向传播

如果 L1 subagent 发现 L3 的契约有问题（比如缺一个 pin），它**不修改 L3**，而是报错返回。

原因：

1. **SVP 的核心理念是透明** — 错误可见、可定位、人来决策。自动反向传播会隐藏问题。
2. **上层是人编辑的意图** — L3 契约是人写的规格，AI 不应该未经许可修改。
3. **简单可靠** — 单向流比双向同步容易理解、容易调试、容易实现。

用户就是反向反馈回路。subagent 报错 → 用户看到 → 用户在对应层修 → 重新向下编译。这比自动修复更安全，也更符合"人类不失控"的目标。

### 为什么用虚拟文件树而不是 API

AI 编码工具天然围绕文件树设计——它们擅长 `ls`、`cat`、`edit`。把 SVP 数据包装成虚拟文件树，让 AI 用最熟悉的方式操作，零学习成本。

替代方案：
- **暴露 JSON 文件**：AI 直接读写 `.svp/*.json`。但 JSON 不是 AI 友好的格式，且缺乏 overview 能力。
- **提供 API / MCP**：需要 AI 工具支持特定协议。CLI 命令是最通用的接口——任何能跑 shell 的 AI 工具都能用。

### 为什么入口是"用户所在层的下一层"

用户在某层操作，说明该层的内容是用户主动决定的。AI 的职责是**实现用户在该层的决定**，所以从下一层开始工作。

这也保证了：用户总是比 AI 更靠近意图源头，AI 不会越权修改用户的决策。
