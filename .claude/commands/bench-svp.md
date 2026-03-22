# SVP Benchmark — SVP-Guided Development

You are running a benchmark that measures SVP-guided development stability over 20 rounds of iterative development.

## Arguments

- `$ARGUMENTS` — Round number (1-20), "all" to run all rounds, or "N-M" for a range (e.g., "1-5")

## Project Setup (Round 1 only)

```bash
mkdir -p benchmark-workspace/svp && cd benchmark-workspace/svp
npx forge init --host claude-code --lang zh
npm init -y
```

Tech stack and database: your choice (same freedom as AI-only group).
Server must run on `http://localhost:3000`.

## Per-Round Workflow

For each round N, read the Round N section from `benchmark/spec/openspec.md`, then execute the SVP workflow:

### Round 1: Use Build mode

This is a greenfield project. Follow the **Build** workflow from `/svp`:

1. **设计 L5** — `forge prompt design-l5 --intent "<Round 1 需求>"` → 派发 subagent → 写入 .svp/l5.json → `forge rehash l5`
2. **设计 L4** — `forge prompt design-l4 --intent "<Round 1 架构>"` → 派发 subagent → 写入 .svp/l4/<id>.json → `forge rehash l4`
3. **设计 L3** — 对每个 L4 step 的 blockRef: `forge prompt design-l3 <block-id> --flow <flow-id> --step <idx>` → 并行派发 subagent → 写入 .svp/l3/<id>.json → `forge rehash l3/<id>`
4. **获取编译任务** — `forge compile-plan`
5. **编译 L1** — 对每个 compile 任务: `forge prompt compile <l3-id>` → 派发 subagent（读取 complexity 选择模型等级）→ subagent 生成源代码
6. **创建 L2 映射** — `forge link <l3-id> --files <paths>`
7. **验证** — `forge check` → 确认全绿

**Subagent 派发规则（与 /svp 一致）：**
- 运行 `forge prompt <action> <id>` 获取提示词
- 读取 prompt 头部 `complexity` 字段
- 按 complexity 选择模型: heavy=opus | standard=sonnet | light=haiku
- 无依赖的 subagent 并行派发
- 主 Agent 不直接写 L1 代码——全部由 subagent 完成

### Round 2+: Use Add / Change mode

后续轮次是增量添加功能。Follow the **Add** workflow from `/svp`:

1. **创建变更集** — `forge changeset start round-N --reason "<Round N 需求>"`
2. **了解当前结构** — `forge view l5` + `forge view l4` + `forge view l3`
3. **修改流程设计** — 编辑 .svp/l4/<flow-id>.json 添加新 step + blockRef → `forge rehash l4`
4. **设计新模块** — `forge prompt design-l3 <new-block-id> --flow <fid> --step <idx>` → 派发 subagent
5. **编译新代码** — `forge prompt compile <new-block-id>` → 派发 subagent
6. **如有已有模块受影响** — `forge compile-plan` 查看 SOURCE_DRIFT → `forge prompt recompile <l3-id>` → 派发 subagent
7. **创建映射并验证** — `forge link` + `forge check`
8. **完成变更集** — `forge changeset complete`

**如果 Round N 修改了已有功能的行为（如 R6 给 Product 加 stock、R11 加租户隔离），使用 Change 模式：**
1. `forge check` 诊断当前状态
2. 判断变更层级（系统目标 / 流程编排 / 模块规则）
3. 修改对应 .svp/ JSON → `forge rehash`
4. `forge compile-plan` 获取受影响任务
5. `forge prompt recompile <l3-id>` → 派发 subagent
6. `forge link` + `forge check`

### Testing (every round)

```bash
# Start server
cd benchmark-workspace/svp && npm start &
SERVER_PID=$!
sleep 3

# Run cumulative tests
cd ../.. && npx tsx benchmark/tests/runner/run.ts --up-to N

# Stop server
kill $SERVER_PID
```

Save output to `benchmark-workspace/svp/results/round-NN.txt`

## SVP Core Rules

- **单向编译**：需求变更从 L5/L4/L3 开始，向下编译到代码。永远不反向修改上层
- **L1 是编译产物**：出了问题回到 L3 修，然后 recompile
- **主 Agent 不碰 L1**：所有代码生成/修改由 subagent 完成，主 Agent 只做编排
- **`forge check` 必须全绿**：每轮测试前确保跨层一致性
- **并行派发**：无依赖的 subagent 并行执行
- **禁止读测试文件**：`benchmark/tests/data/round-*.json` 是盲测

## Response Envelope

All endpoints: `{ "data": <result>, "error": <null | string> }`

## Key Conventions

- Auth: JWT Bearer token in `Authorization` header
- Tenant: `X-Tenant-ID` header
- Pagination: `?page=1&limit=20` → `{ pagination: { total, page, limit, totalPages } }`
- Money: integer cents | IDs: UUID | Timestamps: ISO 8601

## After Each Round

Report:
- SVP artifacts changed (which L3/L4/L5)
- `forge check` output
- Subagent count and model tiers used
- Test results (pass/fail)

## After All Rounds

Generate `benchmark-workspace/svp/results/summary.md`:
- Per-round pass rates
- Cumulative regression data
- Total pass rate at Round 20
- `forge check` drift history
- Subagent dispatch statistics
