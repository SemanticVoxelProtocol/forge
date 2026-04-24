<p align="center">
  <img src="https://img.shields.io/npm/v/@svporg/forge?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/github/license/SemanticVoxelProtocol/forge?style=flat-square" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square" alt="node" />
</p>

[中文版](./i18n/zh/README.md)

# forge

**forge** is the CLI for [Semantic Voxel Protocol (SVP)](https://github.com/SemanticVoxelProtocol) — a language-agnostic semantic governance model that keeps AI-assisted development aligned from architecture to governed source code.

## TL;DR

- AI writes code fast, but breaks things faster. SVP ensures semantic changes start from the artifact that owns the commitment — not from random code patches.
- **L3 contracts** define what each module does (inputs, outputs, constraints). Governed file/function manifests keep file ownership, exports, signatures, and runtime policy aligned with those contracts.
- `forge check` catches cross-layer and governance drift before it becomes a bug.
- SVP is language-agnostic: manifests describe semantic commitments, while language-specific scanners and adapters only provide best-effort implementation evidence.
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

This creates a `.svp/` directory and generates the appropriate skill file for your AI tool. Then use `/forge` (or equivalent) in your AI tool to start the guided workflow.

## Migration

Migration is automatic by default when forge opens an existing `.svp/` project.

Most users do not need to care about schema internals or run manual migration steps.

If migration fails, follow the public migration note in [`docs/migrations/1.0.0.md`](docs/migrations/1.0.0.md).

## How It Works

SVP models software as a one-way semantic governance chain:

```
L5 Intent → L4 Architecture → L3 Contracts → L2 Mapping → L1 Code
                                      │
                                      └─ file/fn governance
```

You design most behavior at L3 (what each module accepts, returns, and enforces). AI compiles L3 down to working code, while file/function manifests govern implementation boundaries: file ownership, exported entry points, function signatures, preconditions, postconditions, and runtime policy. When requirements change, update the semantic source and recompile — like changing a `.cpp` and rebuilding, not patching a `.so`.

### The Five Layers

| Layer | What it captures | Who edits |
|-------|-----------------|-----------|
| **L5 Blueprint** | System intent, domains, constraints | Human |
| **L4 Flow** | Process orchestration, data flow between modules | Human |
| **L3 Block** | Module contracts: inputs, outputs, validation rules | Human |
| **L2 Code Block** | L3 ↔ L1 file mappings, reconciliation hashes | Auto-generated |
| **L1 Code** | Implementation source code | AI-compiled |

### Governance Manifests

| Manifest | What it captures | Who edits |
|----------|------------------|-----------|
| **File manifest** | File path, ownership, exports, dependency boundary, plugin groups | Toolchain + AI |
| **Function manifest** | Export name, signature, preconditions, postconditions, plugin policy | Toolchain + AI |

### Key Concepts

**L3 is the contract.** Not documentation, not comments — L3 constraints are the specification that AI compiles from. The more precise your L3, the more accurate the compiled code.

**Reference docs = header files.** Put API specs, design mockups, or algorithm docs in `nodes/<id>/refs/`. They're automatically injected into compilation prompts, just like `#include` in C.

**forge check catches drift.** Hash-based cross-layer validation detects when layers, file ownership, or governed function metadata fall out of sync — before you hit a runtime bug.

## CLI Commands

| Command | Description |
|---------|-------------|
| `forge init` | Initialize SVP in a project |
| `forge check` | Validate cross-layer consistency |
| `forge compile-plan` | Show what needs recompilation |
| `forge prompt <action> <id>` | Generate AI compilation prompts |
| `forge link <l3-id> --files <paths> [--exports file=fn]` | Map source files to L3 blocks and maintain file/function manifests |
| `forge view <layer>` | Inspect layer contents |
| `forge rehash` | Recompute content hashes |
| `forge changeset start <name>` | Track a set of related changes |
| `forge docs check` | Validate documentation coverage |

## Supported AI Hosts

forge generates skill files for each AI tool's native extension format:

| Host | Generated files | Command |
|------|-----------------|---------|
| Claude Code | `.claude/commands/forge.md`, `CLAUDE.md` section | `/forge` |
| Cursor | `.cursor/commands/forge.md`, `.cursor/rules/svp.mdc` | `/forge` + auto-attached rules |
| Windsurf | `.windsurf/commands/forge.md`, `.windsurf/rules/svp.md` | `/forge` + auto-attached rules |
| Codex | `.codex/skills/svp/SKILL.md`, `AGENTS.md` section | Auto-attached |
| GitHub Copilot | `.github/prompts/svp.prompt.md`, `.github/copilot-instructions.md` | Prompt + auto-attached instructions |
| Kimi Code | `.agents/skills/svp/SKILL.md`, `AGENTS.md` section | `/skill:svp` |
| Gemini CLI | `.gemini/skills/svp/SKILL.md`, `GEMINI.md` section | Auto-attached |

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
