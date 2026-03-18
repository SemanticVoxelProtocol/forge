# SVP 设计理由

为什么 SVP 的五层架构长这个样子，以及我们做了哪些关键决策。

---

## 核心问题：AI 写代码时人类怎么不失控

AI 会出错。这不是意外，是前提。

SVP 不试图消灭 AI 的错误。SVP 要做的是：**缩短从出错到发现的距离**。当 AI 犯了错，人类能立即看到、定位到、修复掉，而不是让错误在黑盒里默默传播。

这是整个架构的出发点。

---

## 五层结构：观测窗口，不是防线

```
L5  Blueprint   —  系统的意图和边界
L4  Logic Chain —  流程如何编排
L3  Logic Block —  每个单元做什么
L2  Code Block  —  代码骨架
L1  Code        —  最终实现
```

每一层都是一个观测窗口。出问题的时候，你不用面对一坨代码去猜，而是逐层问：

- 意图对吗？（L5）
- 流程对吗？（L4）
- 契约写够了吗？（L3）
- 代码结构对吗？（L2）
- 实现忠实吗？（L1）

五层不是为了"更严谨"，是为了**更透明**。

---

## 每层都有两面

### 发现

设计过程中我们发现：每一层天然存在两个表示——人看的和机器看的。

- L5 的人看面是自然语言意图文档，机器面是结构化的 spec 对象
- L4 的人看面是可视化节点图，机器面是 flow/steps 数据结构
- L3 的人看面是契约盒（validate/constraints/description），机器面是结构化的数据对象
- L2 的人看面是带注释的代码骨架，机器面也是代码骨架
- L1 的人看面是可读的源码，机器面是可执行代码

注意 L2 和 L1 的两面区分度很低——代码天然既是人看的也是机器看的。上层（L3/L4/L5）的两面之间有质的区别（自然语言 ↔ 结构化数据），下层（L2/L1）的两面几乎是同一个东西。这不是问题，而是代码层本来的特征。

### 关键决策：机器面是核心数据模型，人看面是渲染

一开始我们以为"人看面是 source of truth，机器面是派生的"。后来意识到反过来：

**机器面才是我们要设计的核心。** 它定义了每层的数据结构、层间的引用关系、diff 的追踪方式。人看面只是用不同的方式（文本、图表、编辑器）来呈现同一份数据。

这意味着：
- svp-blueprint（节点图编辑器）不是一个"层"，是 L4/L3 的一种编辑视图
- 未来可以有多种人看面——命令行、Web 编辑器、IDE 插件——但底下是同一个数据模型
- 设计精力应该花在数据模型上，不是 UI 上

---

## 层间关系：聚合 + 配对

### 发现

不是每层都简单地"聚合"下一层。实际的关系是：

```
L5 ─聚合─→ L4 ─聚合─→ L3 ←1:1配对→ L2 ─聚合─→ L1
```

- **L5 聚合 L4**：一个蓝图包含多个 flow
- **L4 聚合 L3**：一个 flow 编排多个 logic block
- **L3 配对 L2**：一个 logic block 和它的代码实现是 1:1 的
- **L2 聚合 L1**：一个 code block 可以包含多个源文件

### 为什么 L3 和 L2 不是聚合

最初我们试图统一成"每层聚合下一层"，但 L3 和 L2 之间不是这个关系。L3 不包含"多个 L2"——一个 L3 block 只对应一个 L2 实现。它们是同一个单元的两面：L3 说"做什么"，L2 说"怎么做"。

我们考虑过合并 L3+L2 为一个"Block"。最终决定保持分离，因为：

1. 它们的编辑者不同：L3 由人编辑，L2 由 AI 生成
2. 它们的变更频率不同：L3 改得少（意图稳定），L2 改得多（实现迭代）
3. 分离后可以独立 diff 追踪
4. 保持五层的一致性，每层都是一个独立的观测窗口

---

## Diff 与互锁

### 发现

每层的变更会波及所有其他层，但方向和方式不同：

- **自上而下**：上层改了 → 下层重新编译（确定性传播）
- **自下而上**：下层被手改 → 上层需要对账同步（需要人介入或 AI 辅助）

### 关键决策：每层以 diff 方式记录变更

每层的数据模型包含：

1. **当前状态** — 这一层的内容
2. **层间引用** — 它关联了哪些上/下层单元
3. **变更记录** — 相对上次，什么发生了变化

这样当某层发生变化时，系统能精确知道哪些关联层需要更新，而不是全量重编译。

---

## AI 即编译器：设计哲学的核心推论

### 传统编译器 vs AI 编译器

传统编译器是确定性的——同样的输入永远产生同样的输出。所以它需要精确的输入格式：严格的语法、形式化的类型系统、无歧义的规范。

AI 编译器是理解性的——它读懂意图，然后实现。所以它需要的是**清晰**，不是**严格**。

### 关键决策：数据载体是 TS 对象，不是 YAML / JSON Schema / Protocol Buffers

传统做法会选择 JSON Schema（形式化校验）、Protocol Buffers（跨语言序列化）或自定义 DSL（领域专用语法）来定义数据模型。我们都不用，因为：

- **JSON Schema** 是给传统校验器设计的，AI 不需要形式化的校验规则来理解一个类型
- **Protocol Buffers** 是给序列化/反序列化设计的，AI 不需要 IDL 来做跨语言转换
- **自定义 DSL** 需要自己造 parser 和工具链，而 AI 本身就是最强的 parser

SVP 的数据载体是 TypeScript 对象。核心数据模型用 TS 类型定义，运行时就是 TS 对象，持久化用 JSON 序列化。人编辑时可以用任意格式（YAML 编辑器、Web GUI、CLI），但底下读写的都是同一份 TS 对象。

这个决策影响了所有格式设计：

**validate 用人类直觉的字符串规则，不用结构化对象。**

```typescript
// 我们选择的（AI 直接理解）：
validate: {
  "request.items": "array, min 1, max 50"
}

// 我们放弃的（为传统 parser 设计）：
validate: [
  { field: "request.items", rule: "range", params: { type: "array", min: 1, max: 50 } }
]
```

两种写法包含完全相同的信息。但第一种人和 AI 都能直觉理解，第二种只是在给不存在的 parser 喂食。

**constraints 保持自然语言断言，不试图完全结构化。**

```typescript
// 我们选择的：
constraints: [
  "output.result.errors contains all failed checks, not just first"
]

// 而不是试图把它拆成：
constraints: [
  { assertion: "completeness", target: "output.result.errors", description: "contains all failed checks" }
]
```

"contains all failed checks, not just first" 这句话，AI 完全理解。结构化反而丢失了"not just first"这个微妙但重要的语义暗示。

**类型定义用 TypeScript interface，不发明新的类型 DSL。**

不是因为 SVP 绑定 TypeScript，而是因为 AI 对 TypeScript interface 的理解极其深刻——它在训练数据中见过数十亿个。AI 看到 `interface OrderRequest { user_id: string; items: LineItem[] }` 就自然知道怎么转成 Python dataclass、Go struct、Rust struct。

TypeScript interface 在这里的角色不是"实现语言"，而是**对 AI 最高效的类型描述载体**。

### 结构化的边界：拓扑骨架 vs 黑盒内部

"AI 不需要结构化"不意味着什么都不结构化。SVP 的工具链（`forge check`、渲染器）需要程序化处理一部分数据。

区分标准很简单：**层间的连接关系必须结构化，block 内部可以是黑盒。**

需要结构化（`forge check` 要校验）：
- **pins 的类型** — 连线两端类型是否兼容
- **wire 的引用** — from/to 指向的 pin 是否存在
- **层间引用** — L4 step 引用的 L3 block 是否存在、签名是否匹配

不需要结构化（展示给人看就行）：
- **validate 的规则** — `"request.items: array, min 1, max 50"` 人和 AI 都直接理解
- **constraints 的断言** — `"output.result.total >= 0"` 是自然语言
- **description** — 纯自然语言

工具对黑盒部分只做一件事：**展示**。不解析、不校验、不转换。人看得懂自然语言，AI 看得懂自然语言，那就用自然语言。

### 推论：SVP 是语言无关的协议

SVP 的五层数据模型是协议，不是某种语言的库。TypeScript 只是第一个实现工具链的语言。同一份 SVP 数据模型，可以用 Rust、Python、Go 实现另一套工具链。

关键分离：

```
SVP 协议（语言无关）
  ├── 五层数据模型的定义
  ├── 层间转换的规则
  └── 变更传播的机制

SVP 工具链（某种语言实现）
  ├── 校验器（forge check）
  ├── 编辑器（svp-blueprint 等）
  ├── Skills（给 AI 编码工具的结构化 context）
  └── Store（.svp/ 数据读写）
```

---

## 声明式 vs 伪声明式

### 发现

设计节点规范时，我们最初定义了 5 个字段：pins、validate、constraints、derived、branch。后来砍掉了 derived 和 branch。

### 为什么砍掉

对比前端框架帮助理解了这个问题：

| svp-blueprint | 前端框架对应 | 是否真正声明式 |
|---|---|---|
| pins（类型） | TypeScript interface | 是 — 纯数据形状，无行为 |
| validate（校验） | zod schema | 是 — 规则有唯一解释 |
| constraints（断言） | expect 断言 | 是 — 条件可自动验证 |
| derived（派生值） | Vue computed | **否** — 本质是计算逻辑 |
| branch（分支） | v-if / v-else | **否** — 本质是控制流 |

derived 和 branch 看起来是"声明式"的，但实际是**用不同语法写的代码**。它们不比自然语言更严谨——`derived: total = sum(items.price * items.quantity)` 和 description 里写"小计 = 各项 price * quantity 的总和"包含完全相同的信息，前者还更难表达复杂逻辑。

### 关键决策：只保留真正声明式的字段

最终的节点模型（契约盒）：

```typescript
{
  name: string

  // 形式化层（精确，机器可验证）
  pins:        // 数据形状
  validate:    // 输入约束
  constraints: // 输出约束 + 不变量

  // 自由层（自然语言，AI 编译）
  description: // 中间逻辑
}
```

**validate 约束输入，constraints 约束输出，description 负责中间。** AI 可能实现得不完美，但 validate 和 constraints 构成的契约可以自动验证——这才是形式化的真正价值。不是"帮 AI 理解"，而是"AI 理解错了的时候能被发现"。

---

## 总结：SVP 的设计原则

1. **透明优先于正确** — 不追求 AI 不犯错，追求错误可见可定位
2. **每层都是观测窗口** — 五层结构的价值是分层观测，不是分层防御
3. **机器面是核心** — 数据模型先行，人看面是视图层的事
4. **AI 即编译器** — 格式设计优化 AI 理解，不是 parser 解析
5. **只做真正的声明式** — 伪声明式不如自然语言，砍掉
6. **协议与实现分离** — SVP 是语言无关的规范，工具链是独立的
7. **意图不能丢** — 上层是 source of truth，因为上层是人能理解的语言
