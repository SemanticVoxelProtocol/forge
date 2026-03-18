# Contributing to SVP Forge

[中文版](./i18n/zh/CONTRIBUTING.md)

Thank you for your interest in SVP Forge! This guide helps you contribute effectively.

## Code of Conduct

Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## AI Policy

We embrace AI-assisted contributions. Please read our [AI Policy](./AI_POLICY.md) for guidelines on using AI tools when contributing.

## How to Contribute

### Reporting Bugs

1. Search [existing Issues](https://github.com/SemanticVoxelProtocol/forge/issues) first to avoid duplicates
2. Use the Bug Report template to create an Issue
3. Include: reproduction steps, expected behavior, actual behavior, environment info (Node version, OS)

### Suggesting Features

1. Create a Feature Request Issue describing the need
2. Explain: the problem to solve, proposed solution, possible alternatives
3. Non-trivial API changes should be discussed in an Issue before development

### Submitting Code

We welcome Pull Requests for bug fixes, new features, documentation improvements, and test coverage.

## Development Setup

### Prerequisites

- Node.js >= 22 (see `.node-version`)
- npm

### Install & Build

```bash
# Clone the repo
git clone https://github.com/SemanticVoxelProtocol/forge.git
cd forge

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Full check (TypeScript + ESLint + Prettier)
npm run check
```

## Project Structure

```
packages/
  cli/        CLI commands (forge check, init, prompt, ...)
  core/       Core logic (check, hash, store, view, i18n)
  skills/     AI tool adapters and prompt generation
tests/e2e/    End-to-end tests
```

## Pull Request Workflow

### Branch Strategy

- `main` — Stable branch, all releases are tagged from here
- `dev` — Development branch, day-to-day work merges here
- Feature branches are created from `dev`, named: `feat/description`, `fix/description`, `docs/description`

### PR Steps

1. Fork the repo and create a feature branch from `dev`
2. Keep each PR focused on a single concern (don't mix unrelated changes)
3. Add tests for new features and bug fixes
4. Run the full check suite locally:
   ```bash
   npm run check   # tsc --noEmit + eslint + prettier --check
   npm test         # vitest
   ```
5. Follow Conventional Commits format for the PR title (see below)
6. Reference the related Issue: `Fixes #123` or `Closes #123`
7. Enable "Allow edits from maintainers"

### PR Checklist

- [ ] Code passes `npm run check`
- [ ] Tests pass with `npm test`
- [ ] New features/bug fixes include tests
- [ ] Documentation updated (if user-facing changes)
- [ ] PR title follows Conventional Commits

## Commit Conventions

We follow [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(cli): add view command` |
| `fix` | Bug fix | `fix(core): handle empty hash input` |
| `docs` | Documentation only | `docs: update tutorial` |
| `style` | Formatting, no logic change | `style: fix indentation` |
| `refactor` | Refactor, not feat/fix | `refactor(store): simplify read logic` |
| `perf` | Performance improvement | `perf(hash): cache computed values` |
| `test` | Test-related | `test(check): add edge case coverage` |
| `build` | Build system | `build: update tsconfig target` |
| `ci` | CI configuration | `ci: add Node 24 to matrix` |
| `chore` | Maintenance | `chore: update dependencies` |

### Rules

- Use imperative present tense: `add feature` not `added` or `adds`
- Lowercase first letter, no trailing period
- Subject line max 72 characters
- Breaking changes: add `!` after type: `feat!: remove deprecated API`

## Coding Standards

- **TypeScript** — All source files must be typed
- **ESLint** — `npm run lint` (config in `eslint.config.ts`)
- **Prettier** — `npm run format` (auto-format before committing)
- **Testing** — Vitest; bug fixes and new features must include tests
- Run `npm run check` before submitting to ensure everything passes

## Release Process

> This section is for maintainers only.

Releases are automated via CI:

1. Ensure CI is green on `main`
2. Bump version: `npm version patch|minor|major`
3. Push tag: `git push --follow-tags`
4. CI auto-publishes to npm via Trusted Publishing

## Need Help?

- Browse Issues labeled [`good first issue`](https://github.com/SemanticVoxelProtocol/forge/labels/good%20first%20issue)
- Ask questions in Issues or Discussions

Thank you for contributing!
