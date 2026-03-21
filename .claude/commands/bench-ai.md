# SVP Benchmark — AI Coding (No SVP)

You are running a benchmark that measures AI coding stability over 20 rounds of iterative development.

## Your Task

Build a **multi-tenant e-commerce SaaS API** from scratch, following the spec round by round. You are working WITHOUT SVP — just pure AI coding.

### Arguments

- `$ARGUMENTS` — Round number (1-20), "all" to run all rounds, or "N-M" for a range (e.g., "1-5")

### Project Setup

If this is Round 1 (or "all"), create a new project directory at `./benchmark-workspace/ai/` and initialize it:

1. `mkdir -p benchmark-workspace/ai && cd benchmark-workspace/ai`
2. Initialize a Node.js project with your preferred backend framework
3. Set up the project to run on `http://localhost:3000`

If this is a later round, `cd benchmark-workspace/ai` and continue from existing code.

### Per-Round Workflow

For each round N:

1. **Read the spec**: Read the relevant Round N section from `benchmark/spec/openspec.md`
2. **Read the API contract**: Reference `benchmark/contracts/api.yaml` for exact endpoint schemas
3. **Implement**: Write/modify code to satisfy the round's requirements
4. **Self-test**: Make sure the server starts and basic sanity checks pass
5. **Run benchmark tests**:
   ```bash
   # Start the server in background
   cd benchmark-workspace/ai && npm start &
   SERVER_PID=$!
   sleep 3

   # Run tests for this round and all previous rounds
   cd ../.. && npx tsx benchmark/tests/runner/run.ts --up-to N

   # Stop server
   kill $SERVER_PID
   ```
6. **Record results**: Save the test output to `benchmark-workspace/ai/results/round-NN.txt`

### Rules

- You are a skilled AI developer. Code however you see fit.
- You may choose any tech stack (Express, Fastify, Hono, NestJS, etc.) and database (SQLite, PostgreSQL, etc.)
- You may refactor freely between rounds
- You must NOT read the test files (`benchmark/tests/data/round-*.json`) — you only see the spec
- You must expose all API endpoints exactly as defined in the contract
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
- What you implemented
- Any design decisions you made
- Test results (pass/fail counts)
- Any issues encountered

### After All Rounds

Generate a final summary at `benchmark-workspace/ai/results/summary.md`:
- Per-round pass rates
- Cumulative regression data
- Total pass rate at Round 20
