<p align="center">
  <img src="https://img.shields.io/npm/v/@svporg/forge?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/github/license/SemanticVoxelProtocol/forge?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square" alt="node" />
</p>

[中文版](./i18n/zh/README.md)

# forge

**forge** is the CLI for [Semantic Voxel Protocol (SVP)](https://github.com/SemanticVoxelProtocol) — a layered compilation model that brings software engineering discipline to AI-assisted development.

## TL;DR

- AI writes code fast, but breaks things faster. SVP ensures every change starts from architecture and compiles down to code — not the other way around.
- **L3 contracts** define what each module does (inputs, outputs, constraints). AI compiles them into source code.
- `forge check` catches cross-layer drift before it becomes a bug.
- Works with any AI tool: Claude Code, Cursor, Windsurf, Codex, GitHub Copilot, Kimi Code, and more.

## Install

```bash
npm install -g @svporg/forge
```

## Getting Started

```bash
# Initialize SVP in your project
forge init

# With a specific AI host adapter
forge init --host claude-code
forge init --host cursor
```

This creates a `.svp/` directory and generates the appropriate skill file for your AI tool. Then use `/svp` (or equivalent) in your AI tool to start the guided workflow.

## Migration

Migration is automatic by default when forge opens an existing `.svp/` project.

Most users do not need to care about schema internals or run manual migration steps.

If migration fails, follow the public migration note in [`docs/migrations/1.0.0.md`](docs/migrations/1.0.0.md).

## How It Works

SVP models software as a one-way compilation chain:

```
L5 Intent  →  L4 Architecture  →  L3 Contracts  →  L2 Skeleton  →  L1 Code
```

You design at L3 (what each module accepts, returns, and enforces). AI compiles L3 down to working code. When requirements change, you update L3 and recompile — like changing a `.cpp` and rebuilding, not patching a `.so`.

### The Five Layers

| Layer | What it captures | Who edits |
|-------|-----------------|-----------|
| **L5 Blueprint** | System intent, domains, constraints | Human |
| **L4 Flow** | Process orchestration, data flow between modules | Human |
| **L3 Block** | Module contracts: inputs, outputs, validation rules | Human |
| **L2 Code Block** | L3 ↔ L1 file mappings, reconciliation hashes | Auto-generated |
| **L1 Code** | Implementation source code | AI-compiled |

### Key Concepts

**L3 is the contract.** Not documentation, not comments — L3 constraints are the specification that AI compiles from. The more precise your L3, the more accurate the compiled code.

**Reference docs = header files.** Put API specs, design mockups, or algorithm docs in `nodes/<id>/refs/`. They're automatically injected into compilation prompts, just like `#include` in C.

**forge check catches drift.** Hash-based cross-layer validation detects when layers fall out of sync — before you hit a runtime bug.

## CLI Commands

| Command | Description |
|---------|-------------|
| `forge init` | Initialize SVP in a project |
| `forge check` | Validate cross-layer consistency |
| `forge compile-plan` | Show what needs recompilation |
| `forge prompt <action> <id>` | Generate AI compilation prompts |
| `forge link <l3-id> --files <paths>` | Map source files to L3 blocks |
| `forge view <layer>` | Inspect layer contents |
| `forge rehash` | Recompute content hashes |
| `forge changeset start <name>` | Track a set of related changes |
| `forge docs check` | Validate documentation coverage |

## Supported AI Hosts

forge generates skill files for each AI tool's native extension format:

| Host | Skill location | Command |
|------|---------------|---------|
| Claude Code | `.claude/commands/svp.md` | `/svp` |
| Cursor | `.cursor/rules/svp.mdc` | Auto-attached |
| Windsurf | `.windsurfrules/svp.md` | Auto-attached |
| Codex | `AGENTS.md` section | Auto-attached |
| GitHub Copilot | `.github/copilot-instructions.md` | Auto-attached |
| Kimi Code | `.kimi/rules/svp.md` | Auto-attached |
| Gemini CLI | `GEMINI.md` section | Auto-attached |

```bash
forge init --host cursor    # generates Cursor-specific skill file
forge init --host claude-code  # generates Claude Code slash command
```

## Works Great With OpenSpec

[OpenSpec](https://github.com/Fission-AI/OpenSpec) ensures requirements are clear **before** AI writes code. SVP ensures what AI wrote is consistent **after**. Use both for a complete spec → architecture → verification pipeline.

## Development

```bash
git clone https://github.com/SemanticVoxelProtocol/forge.git
cd forge
npm install
npm test          # vitest
npm run check     # tsc + eslint + prettier
```

### Project Structure

```
packages/
├── core/        Data model types, hash functions, validation logic
├── skills/      Prompt generators + host adapter skill files
└── cli/         CLI entry point (forge command)
```

## Community

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [AI Policy](AI_POLICY.md)

## License

[MIT](LICENSE)
