# forge check 错误码参考

`forge check` 校验 `.svp/` 目录下所有层的数据一致性。以下是所有可能的错误和警告。

## 错误（Error）

错误表示数据不一致，必须修复。

### HASH_MISMATCH

**含义**：某层实体的 `contentHash` 和实际内容重新计算的哈希不一致。

**可能原因**：
- 手动编辑了 JSON 文件但没更新 contentHash
- 工具写入时出 bug，哈希计算和内容不匹配

**修复**：重新计算并写入正确的 contentHash。用 `hashL3` / `hashL4` / `hashL5` / `hashL2` 函数。

**涉及层**：L2、L3、L4、L5

---

### MISSING_BLOCK_REF

**含义**：引用了一个不存在的 L3 block。

**可能原因**：
- L4 step 的 `blockRef` 指向了已删除或重命名的 L3 block
- L2 的 `blockRef` 指向了不存在的 L3 block

**修复**：更新 `blockRef` 为正确的 L3 block ID，或创建缺失的 L3 block。

**涉及层**：L4（step.blockRef → L3）、L2（blockRef → L3）

---

### MISSING_FLOW_REF

**含义**：L4 step 的 `flowRef` 指向了不存在的 L4 flow。

**可能原因**：
- 复合节点引用的子 flow 被删除或重命名

**修复**：更新 `flowRef` 为正确的 L4 flow ID，或创建缺失的 L4 flow。

**涉及层**：L4

---

### MISSING_STEP_REF

**含义**：L4 flow 内部的步骤引用了不存在的 step ID。

**触发场景**：
- `step.next` 指向不存在的 step
- `step.branches`（parallel）包含不存在的 step ID
- `step.waitFor`（wait）包含不存在的 step ID
- `dataFlow.from` 或 `dataFlow.to` 的 stepId 部分不存在

**修复**：更新引用为正确的 step ID，或添加缺失的 step。

**涉及层**：L4

---

### INVALID_DATAFLOW_FORMAT

**含义**：`dataFlow.from` 或 `dataFlow.to` 不符合 `"stepId.pinName"` 格式。

**正确格式**：`"s1.result"`（步骤 ID + 点 + pin 名称）

**修复**：改为 `"stepId.pinName"` 格式。

**涉及层**：L4

---

### MISSING_PIN

**含义**：dataFlow 引用的 pin 名称在对应的 L3 block 上不存在。

**示例**：dataFlow `from: "s1.nonExistent"` 但 s1 引用的 L3 block 的 output 里没有名为 `nonExistent` 的 pin。

**修复**：
- 检查 pin 名称是否拼写错误
- 检查 L3 block 的 input/output 定义

**涉及层**：L4

---

### NEXT_CYCLE

**含义**：L4 flow 的 `step.next` 链形成了循环（A → B → A）。

**可能原因**：
- 错误地将下游 step 的 next 指回了上游

**修复**：打破循环，确保 next 链是 DAG（有向无环图）。终止节点的 next 应为 `null`。

**涉及层**：L4

---

## 警告（Warning）

警告表示潜在问题，不阻塞但应关注。

### SOURCE_DRIFT

**含义**：L2 的 `sourceHash` 和对应 L3 block 的 `contentHash` 不一致。

**含义解读**：L3 block 在 L2 生成之后发生了变更，L2 的代码可能已经过时。

**修复**：重新编译 L3 → L2（重新生成 L2 和对应的 L1 源文件），或确认 L3 的变更不影响 L2。

**涉及层**：L2

---

### ORPHAN_STEP

**含义**：L4 flow 中存在从第一个 step 出发不可达的步骤。

**可能原因**：
- 添加了新 step 但忘了用 `next`、`branches` 或 `waitFor` 连接
- 重构 flow 时断开了某个 step 的引用

**修复**：将孤立 step 连入执行流，或删除不需要的 step。

**涉及层**：L4

---

### CONTENT_DRIFT

**含义**：L2 的 `contentHash` 和其管辖的 L1 源文件实际内容的哈希不一致。

**含义解读**：L1 源文件在 L2 生成之后被手动修改，L2 的记录已经过时。

**修复**：
- 接受 L1 的改动 → 重新计算 L2 的 contentHash
- 回退 L1 → 从 L3 重新编译覆盖
- 同时更新 L3 契约以反映 L1 的变更

**涉及层**：L2

---

### SELF_REFERENCING_FLOW

**含义**：L4 flow 的某个 step 通过 `flowRef` 引用了自身，形成无限递归。

**修复**：改为引用另一个 L4 flow，或重新设计流程结构。

**涉及层**：L4

---

## 使用方式

```typescript
import { check } from "@svp/core";
import type { CheckInput } from "@svp/core";

const input: CheckInput = {
  l5: blueprint,          // 可选
  l4Flows: [...],
  l3Blocks: [...],
  l2Blocks: [...],
};

const report = check(input);

// report.summary.errors — 错误数
// report.summary.warnings — 警告数
// report.issues — 所有问题列表，每个包含 severity, layer, entityId, code, message
```
