# svp-blueprint 节点规范

> 本文档描述 svp-blueprint 的节点编辑格式——L3/L4 数据模型的人看面。
> 核心数据模型见 `packages/core/`，设计理由见 `docs/design-rationale.md`。

## 设计原则

一个节点有两层信息：

```
形式化层（精确，机器可验证，不能丢）：
  pins         — 数据形状（类型系统）
  validate     — 输入必须满足什么
  constraints  — 输出必须满足什么 + 不变量

自由层（自然语言，AI 自由理解和实现）：
  description  — 中间逻辑：怎么算、怎么分支、什么副作用
```

形式化层构成一个**契约盒子**：输入被 validate 夹住，输出被 constraints 夹住。盒子里面的实现交给 description + AI 编译器。AI 可能实现得不完美，但 validate 和 constraints 构成的契约可以自动验证——**不是帮 AI 理解，而是 AI 理解错了的时候能被发现。**

不设 derived、branch、effects 字段。这些是伪声明式——对比前端框架可以看出：derived 像 Vue computed、branch 像 v-if，本质都是代码换了语法，不比自然语言更严谨。中间逻辑全部放在 description 里，由 AI 理解。

### 为什么 validate 和 constraints 用自然语言字符串

AI 是编译器，不是 parser。`"request.items: array, min 1, max 50"` 这种字符串，人和 AI 都能直觉理解。结构化成 `{ field, rule, params }` 只是在给不存在的传统 parser 喂食。

### 结构化的边界

层间连接关系（pins 类型、wire 引用）需要结构化，`svp check` 要校验。block 内部（validate、constraints、description）是黑盒，工具只需展示，不需解析。

---

## 原子节点

```yaml
name: string # 节点标识

# ── 形式化层 ──

pins: # 数据形状
  input:
    - name: string
      type: string
      optional: boolean
  output:
    - name: string
      type: string

validate: # 输入约束
  field.path: rule [, rule ...]

constraints: # 输出约束 + 不变量
  - assertion

# ── 自由层 ──

description: string # 中间逻辑（自然语言）

# ── 可选 ──

config: # 运行时可调参数
  key: { type, default }
```

---

### pins — 数据形状

定义输入输出的类型。类型引用 `types/` 中的 TypeScript 定义。

```yaml
pins:
  input:
    - name: request
      type: OrderRequest
    - name: inventory
      type: InventoryStatus
  output:
    - name: result
      type: OrderResult
```

连线时编译器做类型检查：from 引脚类型必须兼容 to 引脚类型。

---

### validate — 输入约束

声明输入字段的合法性。机器可验证——编译器可以生成校验代码，也可以在运行时自动校验。

**语法：`field.path: rule [, rule ...]`**

```yaml
validate:
  request.user_id: uuid, required
  request.items: array, min 1, max 50
  request.items[].product_id: uuid, required
  request.items[].quantity: number, > 0, <= 999
  request.items[].price: number, >= 0
  request.email: email, required
  request.shipping_address: required
  request.shipping_address.zip: string, pattern /^\d{5,6}$/
  request.coupon_code: string, optional
  inventory.available: == true
```

**规则列表：**

| 规则                 | 含义               | 示例                                |
| -------------------- | ------------------ | ----------------------------------- |
| required             | 不能为空/undefined | `user_id: required`                 |
| optional             | 可以为空           | `coupon: optional`                  |
| 类型名               | 类型校验           | `age: number`                       |
| uuid                 | UUID 格式          | `id: uuid`                          |
| email                | 邮箱格式           | `email: email`                      |
| url                  | URL 格式           | `link: url`                         |
| min N                | 最小值/最小长度    | `items: array, min 1`               |
| max N                | 最大值/最大长度    | `name: string, max 100`             |
| > N, >= N, < N, <= N | 数值比较           | `quantity: number, > 0`             |
| == V                 | 精确相等           | `available: == true`                |
| pattern /regex/      | 正则匹配           | `zip: pattern /^\d{6}$/`            |
| one of [a, b, c]     | 枚举               | `status: one of [active, inactive]` |

每条规则有唯一解释，不存在歧义。

**编译映射：** validate → L3Block.validate（直接映射，Record<string, string>）。

---

### constraints — 输出约束 + 不变量

声明输出必须满足的条件。机器可验证——编译器可以生成断言，测试可以自动校验。

```yaml
constraints:
  - output.result.total >= 0
  - output.result.order_id is uuid
  - if output.result.success then output.result.order_id is not empty
  - count of output.result.items == count of input.request.items
  - output.result.errors contains all failed checks, not just first
  - if output.result.valid then output.result.errors is empty
```

**语法（受限的断言语言）：**

| 语法                   | 含义     | 示例                                            |
| ---------------------- | -------- | ----------------------------------------------- |
| X >= Y, X == Y, ...    | 比较     | `total >= 0`                                    |
| X is type              | 类型断言 | `order_id is uuid`                              |
| X is empty / not empty | 空值断言 | `errors is not empty`                           |
| if P then Q            | 蕴含     | `if success then order_id is not empty`         |
| P iff Q                | 当且仅当 | `valid iff errors is empty`                     |
| count of X == N        | 计数     | `count of output.items == count of input.items` |
| X contains Y           | 包含     | `errors contains all failed checks`             |
| all X satisfy P        | 全称     | `all items[].quantity > 0`                      |
| any X satisfies P      | 存在     | `any items[].price > 100`                       |

constraints 可以引用 input 和 output，表达输入输出之间的关系。

**编译映射：** constraints → L3Block.constraints（直接映射，string[]）。

---

### description — 中间逻辑

自然语言描述节点的实现逻辑。这是 AI 编译器的主要输入。

description 负责表达 validate 和 constraints 无法覆盖的所有内容：

- 计算逻辑（折扣怎么算、排序规则）
- 分支策略（什么情况走什么路）
- 副作用（发事件、调外部服务）
- 实现偏好（用事务、批量查询而非逐条）
- 意图和背景

```yaml
description: |
  处理新订单。

  计算价格：小计 = 各项 price * quantity 的总和。
  VIP 用户打 85 折，普通用户满 200 打 95 折，两者不叠加取更优。
  税费 = 折后价 * 13%。

  库存不足时记录缺货商品列表，通知补货服务。

  订单持久化和事件发布在同一个事务中完成。
  成功后发出 OrderCreated 事件并通知支付服务。
```

**description 和形式化层的关系：**

```
validate 说：输入不能违反这些规则
constraints 说：输出不能违反这些条件
description 说：从合法输入到合法输出，中间这么走

AI 编译器的任务：读 description 生成实现，
                 使得 validate 通过的输入经过实现后 constraints 一定成立
```

---

## 复合节点

一组节点打包，对外暴露统一引脚。这是蓝图的核心价值——**L4 层的组合能力**。

```yaml
name: order-pipeline
description: 完整下单流程。
type: composite

pins:
  input:
    - name: request
      type: OrderRequest
  output:
    - name: result
      type: OrderResult

nodes:
  - id: val
    type: validate-order
  - id: inv
    type: check-inventory
  - id: proc
    type: process-order

wires:
  - from: input.request   → to: val.request
  - from: val.result      → to: inv.items
  - from: input.request   → to: proc.request
  - from: inv.status      → to: proc.inventory
  - from: proc.result     → to: output.result
```

复合节点不需要 validate/constraints/description——它的契约由内部节点的契约组合而成。它只管**拓扑**：谁连谁、数据怎么流。

子节点可以是另一个复合节点，无限嵌套。

---

## 连线规则

**类型匹配**：from 引脚类型必须兼容 to 引脚类型。编译时检查。

**扇出**：一个输出连多个输入。数据复制，下游并行执行。

```yaml
wires:
  - from: a.output → to: b.input    # 并行
  - from: a.output → to: c.input    # 并行
```

**汇聚**：多个输出连同一个输入（数组类型）。等待全部完成。

```yaml
wires:
  - from: b.result → to: merge.results
  - from: c.result → to: merge.results
```

**可选引脚**：标记 `optional: true`，可以不连线。

---

## 模块化文档 (docs.md)

每个节点目录和图文件可以附带一个可选的 `docs.md` 文件，提供超出 `description` 字段的丰富上下文。

### 文件位置

```
nodes/my-node/
├── node.yaml          # 契约（pins, validate, constraints, description）
└── docs.md            # 模块化文档（可选）

graphs/
├── main.yaml          # 图定义
└── main.docs.md       # 图级文档（可选）
```

### 与 description 的关系

- **description** 是摘要（1-4 句话），嵌入 L3Block，参与编译流程
- **docs.md** 是详述，独立文件，按需加载，不影响 contentHash

### 推荐结构

```markdown
## Intent

设计意图和业务背景。

## Edge Cases

- 边界情况 1
- 边界情况 2

## Error Strategy

错误处理策略和降级方案。

## Integration Notes

与其他节点/外部服务的集成约定。

## Examples

输入输出示例。
```

### 加载行为

- `svp prompt compile/recompile/review` 时自动加载并注入 prompt
- subagent 只拉自己需要的 docs，不加载全量
- 不影响 `contentHash` 计算——docs 是编译辅助信息，不是契约的一部分

---

## 目录约定

```
nodes/
├── my-node/
│   ├── node.yaml              # 原子节点
│   └── docs.md                # 模块化文档（可选）
├── my-pipeline/
│   ├── node.yaml              # 复合节点（type: composite）
│   └── nodes/                 # 子节点
│       ├── step-a/
│       │   └── node.yaml
│       └── step-b/
│           └── node.yaml

graphs/
├── main.yaml                  # 顶层连线图
└── main.docs.md               # 图级文档（可选）

types/
└── *.ts                       # 引脚类型定义
```

---

## 编译映射总结

| svp-blueprint | L3Block 字段                     | 说明                         |
| ------------- | -------------------------------- | ---------------------------- |
| name          | id                               | 直接映射                     |
| pins.input    | input: Pin[]                     | 直接映射                     |
| pins.output   | output: Pin[]                    | 直接映射                     |
| validate      | validate: Record<string, string> | 直接映射                     |
| constraints   | constraints: string[]            | 直接映射                     |
| description   | description: string              | 直接映射                     |
| （计算）      | signature                        | 从 input/output 生成，不存储 |

| svp-blueprint  | L4Flow 字段              | 说明                     |
| -------------- | ------------------------ | ------------------------ |
| 复合节点 nodes | steps: Step[]            | 子节点 → 步骤            |
| wires          | steps[].next + dataFlows | 连线 → 执行顺序 + 数据流 |
| 扇出           | action: "parallel" 步骤  | 一出多入 → 并行          |
| 汇聚           | action: "wait" 步骤      | 多出一入 → 等待          |
