# SVP Benchmark — SVP-Guided Development

You are running a benchmark that measures SVP-guided development stability over 20 rounds of iterative development.

## Your Task

Build a **multi-tenant e-commerce SaaS API** from scratch using the SVP (Semantic Voxel Protocol) methodology. Every change starts at the design layer and compiles down to code.

### Arguments

- `$ARGUMENTS` — Round number (1-20), "all" to run all rounds, or "N-M" for a range (e.g., "1-5")

### Project Setup

If this is Round 1 (or "all"), create a new project directory and initialize SVP:

1. `mkdir -p benchmark-workspace/svp && cd benchmark-workspace/svp`
2. Run `npx forge init` to initialize the SVP project
3. Initialize a Node.js project with your preferred backend framework
4. Set up the project to run on `http://localhost:3000`

If this is a later round, `cd benchmark-workspace/svp` and continue from existing SVP artifacts.

### Per-Round Workflow (SVP Methodology)

For each round N, follow the SVP top-down compilation flow:

#### Step 1: Update L5 Blueprint (Intent Layer)

Read the Round N section from `benchmark/spec/openspec.md` and update `.svp/l5/blueprint.yaml`:
- Add the new capability/domain to the blueprint
- Ensure it integrates with existing domains

#### Step 2: Update L4 Flows (Architecture Layer)

Design or update the architecture in `.svp/l4/`:
- Define data flows between components
- Identify which L3 blocks need to be created/modified
- Ensure architectural consistency with existing flows

#### Step 3: Update L3 Blocks (Logic Layer)

Create or update L3 contract blocks in `.svp/l3/`:
- Each L3 block defines inputs (Pin[]), outputs (Pin[]), constraints, and description
- Map directly to the business rules in the spec
- Use `forge prompt compile <l3-id>` to generate L2 code blocks

#### Step 4: Compile L2 → L1 (Code Generation)

For each new/modified L3 block:
1. Run `forge prompt compile <l3-id>` to get the AI compilation prompt
2. Generate implementation code (L1) from the L2 skeleton
3. Run `forge link <l3-id> --files <paths>` to link L1 files to L2 blocks

#### Step 5: Run Consistency Check

```bash
npx forge check
```

Ensure zero SOURCE_DRIFT warnings. All layers must be consistent before proceeding.

#### Step 6: Test

```bash
# Start the server in background
cd benchmark-workspace/svp && npm start &
SERVER_PID=$!
sleep 3

# Run tests for this round and all previous rounds
cd ../.. && npx tsx benchmark/tests/runner/run.ts --up-to N

# Stop server
kill $SERVER_PID
```

#### Step 7: Record Results

Save test output to `benchmark-workspace/svp/results/round-NN.txt`

### SVP Rules

- **Always start from L5/L4/L3 when requirements change** — never jump straight to code
- **L1 code is a compiled artifact** — if something is wrong, fix it at L3 and recompile
- **Run `forge check` before testing** — ensure cross-layer consistency
- **Every L1 file must be linked to an L2 block** via `forge link`
- You may choose any tech stack and database (same freedom as AI-only approach)
- You must NOT read the test files (`benchmark/tests/data/round-*.json`)
- The server must run on `http://localhost:3000`

### Response Envelope

All endpoints must return:
```json
{ "data": <result>, "error": <null | string> }
```

### Key Conventions

- Auth: JWT Bearer token in `Authorization` header
- Tenant isolation: `X-Tenant-ID` header
- Pagination: `?page=1&limit=20` → response includes `pagination: { total, page, limit, totalPages }`
- Money: integer cents
- IDs: UUID strings
- Timestamps: ISO 8601

### After Each Round

Report:
- SVP artifacts updated (which L3/L4/L5 changed)
- `forge check` output (any drift detected?)
- What code was generated/modified
- Test results (pass/fail counts)
- Any issues encountered

### After All Rounds

Generate a final summary at `benchmark-workspace/svp/results/summary.md`:
- Per-round pass rates
- Cumulative regression data
- Total pass rate at Round 20
- `forge check` drift history across rounds
- SVP artifact evolution summary
