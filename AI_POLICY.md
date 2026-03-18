# AI Policy

[中文版](./i18n/zh/AI_POLICY.md)

## Our Stance

SVP Forge is an observability framework for AI-assisted development. We build tools that make AI-written code visible, traceable, and fixable. It would be contradictory to reject the very technology we serve.

**We embrace AI as a development tool.** This project is built with significant AI assistance, and we welcome AI-assisted contributions. Our policy exists not because we distrust AI, but because we value quality — it's the accountability, not the tooling, that matters.

> AI accelerates the writing; the understanding and accountability remain human.

## Project AI Usage Declaration

SVP Forge is developed with the help of AI coding assistants including Claude, GPT, and others. AI is used across the development lifecycle:

- **Code implementation** — Feature development, refactoring, bug fixes
- **Testing** — Test case generation and coverage expansion
- **Documentation** — Drafting and translation
- **Code review** — Supplementary analysis alongside human review

All AI-generated or AI-assisted output is reviewed, tested, and validated by human maintainers before being merged. The maintainers take full responsibility for every line of code in this repository, regardless of how it was produced.

## Contributing with AI

### Welcomed

- Using AI to write, refactor, or debug code
- Using AI to draft documentation or translate content
- Using AI to understand existing code before contributing
- Using AI to generate test cases
- Non-native speakers using AI for language assistance

### Required

- **You must understand your contribution.** If asked, you should be able to explain what the code does, why it's needed, and how it fits the project — without re-prompting an AI.
- **You must review AI output.** Do not submit raw, unreviewed AI-generated code. AI hallucinates APIs, invents patterns, and produces plausible but incorrect logic.
- **You must run the checks.** `npm run check && npm test` must pass before submitting. AI-generated code that doesn't compile or pass tests wastes maintainer time.

### Discouraged

- **Extractive contributions** — Large AI-generated PRs that cost more maintainer time to review than they contribute in value. A 500-line AI-generated refactor that changes style but not substance will be closed.
- **AI-generated issue reports** — If you didn't encounter the bug yourself, don't file it. AI-hallucinated bug reports waste everyone's time.
- **Autonomous agents without oversight** — Do not point an autonomous AI agent at our issue tracker or submit bot-generated PRs without human review.

## A Note for Human Developers

While we embrace AI, we especially value and encourage contributions from human developers — particularly those who are learning. Issues labeled [`good first issue`](https://github.com/SemanticVoxelProtocol/forge/labels/good%20first%20issue) are reserved for human contributors looking to get started. We will not accept AI-generated PRs for these issues, as they exist to provide learning opportunities.

If you're new to open source or to SVP, don't hesitate to ask questions in Issues or Discussions. Maintainers are happy to help you through your first contribution. Understanding matters more than velocity.

## Disclosure

We encourage (but do not require) disclosure of AI assistance. If you choose to disclose, use one of the following formats in your commit message footer:

```
Assisted-by: Claude (claude-opus-4-20250514)
```

```
Generated-by: GitHub Copilot
```

For PR descriptions, a simple note is sufficient:

> This PR was developed with assistance from [tool name].

Disclosure helps the community understand how AI tools are being used in practice and contributes to the broader conversation about AI in open source.

## Accountability

- **Human responsibility.** Every contribution must have a human who takes responsibility for it. AI tools are not contributors — people are.
- **License compliance.** Contributors must ensure that AI-generated code does not introduce license-incompatible material. If your AI tool's terms restrict output usage in ways incompatible with the MIT license, do not use it for contributions to this project.
- **Quality over origin.** We evaluate contributions by their quality, not by whether they were written by a human or assisted by AI. Good code is good code.

## Our Philosophy

SVP exists because AI makes mistakes. The five-layer model doesn't try to prevent errors — it makes them **visible, locatable, and fixable**. We apply the same principle to our own development process:

- We don't ban AI — we make its contributions transparent
- We don't trust blindly — we verify through tests and review
- We don't value origin — we value understanding and accountability

The future of software development is human-AI collaboration. SVP Forge aims to make that collaboration more structured, more observable, and more reliable — starting with our own project.

---

*This policy draws inspiration from the [Ghostty AI Policy](https://github.com/ghostty-org/ghostty/blob/main/AI_POLICY.md), [LLVM AI Tool Policy](https://llvm.org/docs/AIToolPolicy.html), [Apache Software Foundation Generative Tooling Guidance](https://www.apache.org/legal/generative-tooling.html), and the [Zcash Foundation's approach to AI-assisted contributions](https://zfnd.org/embracing-ai-protecting-privacy-how-zebra-approaches-ai-assisted-contributions/). It is a living document and will evolve as the ecosystem matures.*
