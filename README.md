# SVP — Semantic Voxel Protocol

[中文版](./i18n/zh/README.md)

A five-layer data model that keeps humans in control when AI writes code.

## Core Idea

AI makes mistakes. SVP doesn't try to eliminate errors — it makes them **visible, locatable, and fixable**.

The five layers are five observation windows:

```
L5  Blueprint    System intent and boundaries
L4  Logic Chain  How flows are orchestrated
L3  Logic Block  What each unit does (contract box)
L2  Code Block   L3 ↔ L1 mapping
L1  Code         Final implementation
```

When something goes wrong, ask layer by layer: Is the intent correct? Is the flow correct? Are the contracts sufficient? Is the code structure correct? Is the implementation faithful?

## What SVP Is

SVP doesn't call AI APIs or build compilers. SVP is an **enhancement layer** for AI coding tools (Claude Code, Cursor, Windsurf, Kimi Code, Codex, GitHub Copilot):

- **Toolchain**: `forge check` (validation), store (read/write), hash (change tracking)
- **Skills**: Generate structured context from the five-layer data model, fed into your existing AI tools

Similar to [OpenSpec](https://github.com/Fission-AI/OpenSpec) — we don't build AI, we feed AI better context. SVP's capabilities improve automatically as base models evolve.

## Design Principles

1. **Transparency over correctness** — Make errors visible, don't try to prevent AI mistakes
2. **AI as compiler** — Formats optimized for AI comprehension, not parser consumption
3. **Truly declarative only** — Pseudo-declarative is worse than natural language
4. **Store less, compute more** — Single source of truth + computation, avoid inconsistency
5. **Protocol vs implementation** — SVP is a language-agnostic spec; tooling is separate

## Data Model

Four layers with independent data models (L1 is the file system):

| Layer | Data Model | Structured | Natural Language |
|---|---|---|---|
| L5 | `L5Blueprint` | Domain topology, integration points | Intent, constraints |
| L4 | `L4Flow` | Steps, data flow | — |
| L3 | `L3Block` | Input/output pins | validate, constraints, description |
| L2 | `L2CodeBlock` | File mappings, reconciliation hashes | — |

Type definitions are in `packages/core/`.

## forge check

Cross-layer consistency validation, checking four categories:

1. **Hash consistency** — Does contentHash match actual content?
2. **Referential integrity** — Do cross-layer references exist? Do pins match?
3. **Drift detection** — Are L2 sourceHash and L3 contentHash in sync?
4. **Graph structure** — Are L4 step chains acyclic? Any orphaned nodes?

## Getting Started

```bash
npm install -g @svporg/forge
forge init
```

## Development

```bash
npm install
npm test         # vitest
npm run check    # tsc + eslint + prettier
```

## Community

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [AI Policy](AI_POLICY.md)

## Project Structure

```
packages/
├── core/        Five-layer data model TypeScript types + core functions
├── skills/      Prompt generators (design-l3, compile, recompile, etc.)
└── cli/         CLI entry point (forge command)
```

## License

[MIT](LICENSE)
