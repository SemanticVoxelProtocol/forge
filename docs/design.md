# svp-blueprint 设计

> svp-blueprint 是 SVP L4/L3 数据模型的可视化编辑器——不是一个"层"，是数据模型的人看面。
> 整体架构见 `docs/architecture.md`，设计理由见 `docs/design-rationale.md`。

## 为什么

SVP 的 L3（logic block）和 L4（logic chain）可以手写 JSON 或用 CLI 编辑。对于简单项目够用，但当系统复杂到几十上百个 block 和 flow 时：

- 手写 JSON 容易出错，缺乏结构化编辑体验
- block 之间的数据流关系隐藏在 `blockRef` 和 `step.next` 里，不直观
- 难以看到全局拓扑——哪些 block 是并行的、哪些有依赖
- 重构流程（改顺序、加步骤、拆分合并）要手动修改多处引用

svp-blueprint 用节点图来解决这些问题。

## 核心设计

### 节点 = L3Block

每个原子节点对应一个 SVP L3Block。节点采用**契约盒模型**：形式化层（pins + validate + constraints）构成契约，自由层（description）由 AI 编译。

```yaml
# svp-blueprint 的 node.yaml（人编辑格式）
name: validate-order

pins:
  input:
    - name: request
      type: OrderRequest
  output:
    - name: result
      type: ValidationResult

validate:
  request: required
  request.user_id: uuid, required
  request.items: array, min 1, max 50
  request.items[].product_id: uuid, required
  request.items[].quantity: number, > 0, <= 999
  request.email: email, required

constraints:
  - output.result.valid iff output.result.errors is empty
  - output.result.errors contains all failed checks, not just first

description: |
  逐项校验所有字段，收集全部错误后返回，不遇到第一个就停。
```

编译后生成 L3Block 对象（持久化为 `.svp/l3/validate-order.json`）：

```typescript
// 编译产物：L3Block
{
  id: "validate-order",
  name: "验证订单请求",
  input: [
    { name: "request", type: "OrderRequest" }
  ],
  output: [
    { name: "result", type: "ValidationResult" }
  ],
  validate: {
    "request": "required",
    "request.user_id": "uuid, required",
    "request.items": "array, min 1, max 50",
    "request.email": "email, required"
  },
  constraints: [
    "output.result.valid iff output.result.errors is empty",
    "output.result.errors contains all failed checks, not just first"
  ],
  description: "逐项校验所有字段，收集全部错误后返回，不遇到第一个就停。",
  source: { type: "blueprint", hash: "..." },
  contentHash: "..."
}
// signature 不存储，从 input/output 计算：
// "validateOrder(request: OrderRequest): ValidationResult"
```

**validate → L3Block.validate，constraints → L3Block.constraints，description → L3Block.description，pins → input/output。signature 是计算属性。**

### 连线 = L4Flow

节点之间的连线定义了数据流和执行顺序，对应 SVP L4Flow：

```yaml
# svp-blueprint 的 graph.yaml（人编辑格式）
name: create-order
trigger:
  type: http
  config:
    method: POST
    path: /api/orders

nodes:
  - id: v
    type: validate-order
  - id: inv
    type: check-inventory
  - id: res
    type: reserve-inventory
  - id: ord
    type: persist-order
  - id: pay
    type: initiate-payment

wires:
  - from: input.request    → to: v.request
  - from: v.result         → to: inv.order_data     # v 通过后传给库存检查
  - from: inv.available    → to: res.reservation     # 有库存就预占
  - from: res.confirmed    → to: ord.order
  - from: ord.saved        → to: pay.order
  - from: pay.transaction  → to: output.result
```

编译后生成 L4Flow 对象（持久化为 `.svp/l4/create-order.json`）：

```typescript
// 编译产物：L4Flow
{
  id: "create-order",
  name: "创建订单流程",
  trigger: {
    type: "http",
    config: { method: "POST", path: "/api/orders" }
  },
  steps: [
    { id: "v",   action: "process", blockRef: "validate-order",   next: "inv" },
    { id: "inv", action: "process", blockRef: "check-inventory",  next: "res" },
    { id: "res", action: "process", blockRef: "reserve-inventory", next: "ord" },
    { id: "ord", action: "process", blockRef: "persist-order",    next: "pay" },
    { id: "pay", action: "process", blockRef: "initiate-payment", next: null }
  ],
  dataFlows: [
    { from: "v.result",        to: "inv.order_data" },
    { from: "inv.available",   to: "res.reservation" },
    { from: "res.confirmed",   to: "ord.order" },
    { from: "ord.saved",       to: "pay.order" }
  ],
  source: { type: "blueprint", hash: "..." },
  contentHash: "..."
}
```

**连线自动生成 steps 的 next 关系和 dataFlows。** 拓扑排序决定执行顺序。扇出变成并行步骤，汇聚变成等待步骤。

### 复合节点 = 子 Flow

复合节点内部是一个子图，对外暴露统一引脚。对应一个独立的 L4Flow，被上层 flow 通过 `action: "call"` 引用：

```yaml
# validate-all（复合节点，人编辑格式）
name: validate-all
type: composite

pins:
  input:
    - name: paths
      type: LearningPath[]
  output:
    - name: validated
      type: ValidatedPaths

nodes:
  - id: c1
    type: check-coverage
  - id: c2
    type: check-dependency
  - id: m
    type: merge-validations

wires:
  - from: input.paths  → to: c1.paths
  - from: input.paths  → to: c2.paths      # 扇出：并行校验
  - from: c1.result    → to: m.results     # 汇聚
  - from: c2.result    → to: m.results
  - from: m.merged     → to: output.validated
```

编译后生成一个独立的 L4Flow + 内部各节点的 L3Block。上层引用这个复合节点时，生成 `action: "call"` 步骤（`flowRef: "validate-all"`）。

### 类型系统

引脚的类型引用项目中定义的 TypeScript 类型。编译时做类型检查：

- 连线两端的类型必须兼容
- 扇出时 from 类型复制给每个 to
- 汇聚时 to 引脚类型必须是数组，收集所有 from 的元素

类型定义放在 `types/` 目录，是标准 TypeScript interface。Pin.type 直接引用这些类型名称。

## 蓝图查看器

`svp blueprint` 命令是 svp-blueprint 的只读可视化入口——读取 `.svp/` 下已编译的 L3/L4 JSON，生成自包含 HTML 节点图在浏览器中查看。

设计要点：

- **UE Blueprint 风格暗色主题**：深色背景 + 点阵网格，节点卡片用深色调，减少视觉疲劳
- **节点即契约盒**：每个节点显示 L3 block 的 name、description（2 行截断）、pins（按类型着色），点击展开查看 validate 和 constraints
- **类型着色系统**：pin 圆点和数据流连线的颜色由类型名 hash 生成（HSL），同类型 pin 自动同色
- **执行流标记**：节点头部左右各有三角形执行引脚（类似 UE Blueprint 的 exec pin），表示执行流方向
- **三种 L4 变体**：Flow（主要，节点图）、EventGraph（事件处理器列表）、StateMachine（状态节点 + 转换边）
- **零依赖自包含**：单个 HTML 文件内联所有 CSS/JS/数据，无需服务器，离线可用

查看器不做编辑——编辑仍然通过 YAML 文件 + `svp compile-blueprint` 完成。查看器是数据的一种只读渲染视图。

## 不做什么

- **不做 AI 编译**：svp-blueprint 只负责生成 L4Flow/L3Block 的 JSON，后续 L3→L2→L1 由用户的 AI 编码工具（Claude Code 等）配合 SVP skills 完成
- **不定义新的数据格式**：输出的 JSON 完全符合 `packages/core/` 的 TypeScript 类型定义
- **不强制使用**：用户仍然可以直接编辑 L4/L3 的 JSON，svp-blueprint 是可选的编辑视图
