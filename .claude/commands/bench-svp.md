# SVP Benchmark — SVP-Guided Development

You are running a benchmark that measures SVP-guided development stability over 20 rounds of iterative development.

## Arguments

- `$ARGUMENTS` — Round number (1-20), "all" to run all rounds, or "N-M" for a range (e.g., "1-5")

## Setup (Round 1 only)

```bash
mkdir -p benchmark-workspace/svp && cd benchmark-workspace/svp
npx forge init --host claude-code --language zh --intent "多租户电商 SaaS 平台 REST API" -y
npm init -y
```

Tech stack and database: your choice. Server must run on `http://localhost:3000`.

## Core Instruction

**你必须严格遵循 `/svp` 原生工作流。** 唯一的改变是：所有 `[对齐]` 检查点自动通过，不等待用户确认。其余一切保持原样。

具体地：

1. **加载 `/svp` skill** — 你的所有操作必须严格按照项目中 `.claude/commands/svp.md` 定义的流程执行（如果该文件存在）。如果不存在，按照 forge 标准的 Build/Add/Change/Fix 工作流。

2. **自动确认规则** — 原版 /svp 流程中所有写着"必须等待用户确认后才能继续"的对齐检查点，在 benchmark 模式下自动通过。你仍然要生成对齐描述（用于记录），但不停下来等确认。

3. **其他一切不变**：
   - `forge prompt <action> <id>` → 读 complexity → 派发 subagent（heavy=opus / standard=sonnet / light=haiku）
   - 主 Agent **绝对不写 L1 代码** — 所有代码由 subagent 完成
   - 无依赖的 subagent **并行派发**
   - JSON 中 contentHash/revision 写占位值 → `forge rehash` 修正
   - 每轮结束前 `forge check` 必须 0 errors

## Per-Round Execution

For each round N:

1. **读取需求** — 从 `benchmark/spec/openspec.md` 读取 Round N 内容
2. **判断模式** — Round 1 用 Build；后续轮次判断 Add（新功能）还是 Change（改已有行为）
3. **执行 /svp 流程** — 严格按照对应模式的 Step 1/2/3/.../最终 check 执行
4. **测试**：
   ```bash
   cd benchmark-workspace/svp && npm start &
   SERVER_PID=$!
   sleep 3
   cd ../.. && npx tsx benchmark/tests/runner/run.ts --up-to N
   kill $SERVER_PID
   ```
5. **保存结果** — `benchmark-workspace/svp/results/round-NN.txt`

## Constraints

- **禁止读测试文件** — `benchmark/tests/data/round-*.json` 是盲测
- **禁止跳过 SVP 流程** — 每个新端点必须有对应的 L3 block，通过 `forge prompt compile` 编译
- **禁止主 Agent 直接编辑 src/ 下的代码** — 所有 L1 代码变更必须通过 subagent
- API 契约参考 `benchmark/contracts/api.yaml`
- Response envelope: `{ "data": ..., "error": ... }`
- Auth: JWT Bearer | Tenant: `X-Tenant-ID` | Pagination: `?page=1&limit=20` | Money: integer cents | IDs: UUID | Timestamps: ISO 8601

## After All Rounds

Generate `benchmark-workspace/svp/results/summary.md`:
- Per-round pass rates
- Cumulative regression data
- Total pass rate at Round 20
- `forge check` drift history
- Subagent dispatch statistics (count, model tiers)
- L3 block count evolution per round
