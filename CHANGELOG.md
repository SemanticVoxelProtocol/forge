# Changelog

## 1.0.0-rc.1 - 2026-04-27

### Release candidate

This release candidate stabilizes forge as an agent-first SVP toolbelt: skills and slash commands own the code-agent workflow, while the CLI provides deterministic primitives for validation, prompt generation, linking, rehashing, and migration.

### Breaking schema change

- Bumps the `.svp/manifest.json` schema to `2.0.0`.
- Adds an automatic `1.x -> 2.0.0` migration path.
- Migrated file/function manifests are conservatively marked with empty evidence, low confidence, a migration assumption, and `needsHumanReview: true`.
- Function manifests preserve legacy `signature` and copy it to `contractSignature` during migration.

### Added

- Agent-authored governance evidence metadata for file/function manifests: `evidence`, `confidence`, `assumptions`, and `needsHumanReview`.
- Function signature split via optional `observedSignature` and `contractSignature`.
- Language-agnostic evidence freshness validation in `forge check`.
- Review task routing for stale/missing/low-confidence governance evidence in `forge compile-plan`.
- Agent-friendly `forge link --json` output containing L2, governed file/function manifests, and deleted stale manifests.
- Migration note: `docs/migrations/2.0.0.md`.

### Changed

- Generated slash command guidance is now why-first: it gives LLMs freedom to choose the shortest verifiable path while preserving semantic ownership and evidence constraints.
- Skill prompts now tell agents to refresh file/function evidence instead of relying on language-specific parser assumptions.

### Validation

- Full test suite: 808 tests passing.
- Typecheck, lint, and Prettier checks passing.
- Clean build and npm pack dry-run verified.
