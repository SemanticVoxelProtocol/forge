# svp-blueprint 编译映射

节点编辑格式（人看面）到 SVP 数据模型（`packages/core/` 类型）的转换规则。

## 总览

```
nodes/*.yaml  ──┐                              .svp/l3/*.json  (L3Block)
                 ├──→ svp-blueprint compiler ──→
graphs/*.yaml ──┘                              .svp/l4/*.json  (L4Flow)
types/*.ts    ─────────────────────────────────→ 被 L3Block 的 Pin.type 引用
```

svp-blueprint 把节点图转为 L4/L3 数据对象（JSON）。后续由用户的 AI 编码工具（Claude Code 等）配合 SVP skills 完成：

```
L3Block ──→ AI 编码工具 + SVP skills ──→ L2CodeBlock + L1 源文件
```

SVP 不自己调 AI API。契约盒（validate + constraints + description）作为结构化 context 喂给 AI 工具，AI 工具负责生成代码。

> **注意区分两种"编译"**：本文档描述的是**格式转换编译**（YAML 节点图 → L3/L4 JSON），是确定性的、不需要 AI 的。变更驱动的**重编译计划**（某层改了 → 计算哪些下层需要重新生成）见 [交互架构](interaction.md) 的 `forge compile-plan` 章节。

## 映射规则

### 原子节点 → L3Block

| node.yaml 字段 | L3Block 字段 | 转换规则 |
|---|---|---|
| name | id | 直接映射 |
| name（首字母大写） | name | 转为可读名称 |
| pins.input | input: Pin[] | name→name, type→type |
| pins.output | output: Pin[] | 直接映射 |
| validate | validate | 直接映射（Record<string, string>） |
| constraints | constraints | 直接映射（string[]） |
| description | description | 直接映射 |

signature 不存储，从 input/output 计算生成。

**签名计算示例：**

```yaml
# 输入（node.yaml）
pins:
  input:
    - name: request
      type: OrderRequest
    - name: options
      type: ValidateOptions
      optional: true
  output:
    - name: result
      type: ValidationResult
```

```
# 计算结果（不存储）
signature = "validateOrder(request: OrderRequest, options?: ValidateOptions): ValidationResult"
```

### Graph + 连线 → L4Flow

| graph.yaml 字段 | L4Flow 字段 | 转换规则 |
|---|---|---|
| name | id | 直接映射 |
| trigger | trigger | 直接映射 |
| nodes | steps: Step[] | 每个 node → 一个 Step |
| wires | steps[].next + dataFlows | 见下文 |

**连线 → steps.next 的转换：**

1. 从 wires 构建 DAG
2. 拓扑排序确定 step 执行顺序
3. 每个 step 的 next 指向其下游节点

```yaml
# 输入（graph.yaml 的 wires）
wires:
  - from: a.out → to: b.in
  - from: b.out → to: c.in
```

```typescript
// 输出（L4Flow.steps）
[
  { id: "a", action: "process", blockRef: "node-a", next: "b" },
  { id: "b", action: "process", blockRef: "node-b", next: "c" },
  { id: "c", action: "process", blockRef: "node-c", next: null }
]
```

**扇出 → 并行步骤：**

```yaml
# 输入：a 的输出连到 b 和 c
wires:
  - from: a.out → to: b.in
  - from: a.out → to: c.in
```

```typescript
// 输出：a 之后 b 和 c 并行
[
  { id: "a", action: "process", blockRef: "node-a", next: "__parallel_b_c" },
  { id: "__parallel_b_c", action: "parallel", branches: ["b", "c"] },
  { id: "b", action: "process", blockRef: "node-b", next: null },
  { id: "c", action: "process", blockRef: "node-c", next: null }
]
```

**汇聚 → 等待步骤：**

```yaml
# 输入：b 和 c 的输出都连到 d
wires:
  - from: b.out → to: d.in
  - from: c.out → to: d.in
```

```typescript
// 输出：d 等待 b 和 c 都完成
[
  { id: "__join_b_c", action: "wait", waitFor: ["b", "c"], next: "d" },
  { id: "d", action: "process", blockRef: "node-d", next: null }
]
```

**连线 → dataFlows：**

每条 wire 生成一个 DataFlow 条目：

```yaml
# 输入
wires:
  - from: a.result → to: b.request
```

```typescript
// 输出（L4Flow.dataFlows）
[
  { from: "a.result", to: "b.request" }
]
// dataType 不存储，从引用的 pin 类型计算
```

### 复合节点 → 子 Flow + Call 步骤

复合节点编译为：
1. 一个独立的 L4Flow（内部子图）
2. 引用处生成 `action: "call"` 步骤

```yaml
# 复合节点 validate-all 在 graph 中被引用
nodes:
  - id: val
    type: validate-all
```

```typescript
// 编译为两部分：

// 1. 独立 L4Flow（from 复合节点内部连线）
{
  id: "validate-all",
  name: "Validate All",
  steps: [
    { id: "c1", action: "process", blockRef: "check-coverage", next: null },
    { id: "c2", action: "process", blockRef: "check-dependency", next: null },
    // ...
  ],
  dataFlows: [/* ... */],
  source: { type: "blueprint", hash: "..." },
  contentHash: "..."
}

// 2. 引用处的 call 步骤
{ id: "val", action: "call", flowRef: "validate-all", next: null }
```

### Types → Pin.type 引用

类型定义放在 `types/` 目录，是标准 TypeScript interface。L3Block 的 Pin.type 直接引用这些类型名称。

```typescript
// types/order.ts
interface OrderRequest {
  user_id: string
  items: LineItem[]
  shipping_address: Address
}
```

```typescript
// L3Block 的 Pin 引用
{ name: "request", type: "OrderRequest" }
```

类型本身不被编译成独立的数据结构——它们就是 TypeScript，被 `forge check` 用来做连线类型匹配。

## 编译缓存

每个节点和 graph 计算内容哈希（contentHash）。只有哈希变化时才重新编译对应部分。

```
.svp-blueprint-cache/
├── nodes/
│   ├── validate-order.hash     # description + pins 的哈希
│   └── ...
└── graphs/
    ├── create-order.hash       # nodes + wires 的哈希
    └── ...
```
