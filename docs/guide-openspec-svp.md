# Using OpenSpec + SVP Together

OpenSpec and SVP solve different halves of the same problem.

**OpenSpec** helps you define what a feature should do before implementation starts.
**SVP** helps you verify that the implementation stays aligned with the system structure afterward.

Used together, they form a practical flow: define behavior → design structure → implement → verify.

## What Each Tool Does

### OpenSpec — requirements and behavior

Use OpenSpec when you need to make product behavior clear before code is written.

It is strongest at:

- describing expected behavior in a reviewable form
- capturing feature intent and acceptance scenarios
- keeping implementation work tied to an approved requirement

When you say "add dark mode," OpenSpec helps turn that request into concrete expected behavior.

### SVP — structure and consistency

Use SVP when you need the implementation to stay consistent with the system design.

It is strongest at:

- modeling the system structure at a high level
- keeping module boundaries and responsibilities visible
- checking that implementation changes have not drifted from the intended design

When AI writes code, SVP helps you catch architectural drift and broken module boundaries before they become harder-to-debug problems.

### How they fit together

| Concern | OpenSpec | SVP |
|---|---|---|
| Define feature behavior | Primary tool | Supporting context |
| Clarify business expectations | Primary tool | Not the main focus |
| Understand system structure | Supporting context | Primary tool |
| Keep implementation aligned | Supporting context | Primary tool |
| Verify behavior and design together | Works with SVP | Works with OpenSpec |

**In short:** OpenSpec focuses on what the software should do. SVP focuses on how the implementation stays structurally sound while doing it.

## Recommended Workflow

### 1. Define the feature in OpenSpec

Start with OpenSpec when the team needs clear, reviewable behavior.

For example, if you want to add coupon support to checkout, use OpenSpec to describe:

- when coupons can be applied
- what counts as a valid or invalid coupon
- what users should see when validation succeeds or fails

This gives the implementation a stable behavioral target.

### 2. Use SVP to shape implementation

Once the feature behavior is clear, use SVP to fit the implementation into the existing system structure.

For the same checkout example, SVP helps you reason about questions like:

- where coupon validation belongs in the flow
- which module should own that responsibility
- what inputs and outputs that module should expose

This keeps the implementation understandable as the system grows.

### 3. Implement and verify

After the behavior is defined and the structure is clear:

- implement the feature
- use OpenSpec to confirm the result still matches the intended behavior
- use SVP to confirm the implementation still matches the intended structure

Together, they reduce the risk of building the wrong thing or building the right thing in a way that becomes brittle later.

## Setup

### Starting a new project with both

```bash
# Initialize OpenSpec
openspec init --tools claude

# Initialize SVP
forge init --name my-project --host claude-code
```

After setup:

- `openspec/` holds your behavior and requirement workflow
- `.svp/` holds your structural verification data

### Adding SVP to a project that already uses OpenSpec

```bash
forge init --name my-project --host claude-code
```

If the project already has code, use SVP to map that code into a maintainable structure before relying on it for consistency checks.

### Adding OpenSpec to a project that already uses SVP

```bash
openspec init --tools claude
```

This adds a requirement layer without changing the role SVP already plays in architectural verification.

## When to Use Which

| You want to... | Use |
|---|---|
| Define what a feature should do | OpenSpec |
| Clarify acceptance behavior before coding | OpenSpec |
| Understand how a feature fits the system | SVP |
| Keep implementation aligned with structure | SVP |
| Validate product behavior | OpenSpec |
| Validate architectural consistency | SVP |
| Use both requirements and structure together | OpenSpec + SVP |

## Summary

```
OpenSpec          SVP
────────          ───
What it should do How it stays structured
Before coding     During and after implementation
Behavior clarity  Structural consistency

        Together
        ────────
        Behavior → Structure → Implementation → Verification
```
