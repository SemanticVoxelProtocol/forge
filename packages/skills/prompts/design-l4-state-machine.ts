// design-l4-state-machine — L4 StateMachine 设计 prompt 模板

import { languageDirective } from "../../core/i18n.js";
import { extractBlockRefs, getL4Kind } from "../../core/l4.js";
import { viewL5Overview } from "../../core/view.js";
import { complexityHeader } from "./complexity-header.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Artifact } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";

export interface DesignL4StateMachineInput {
  readonly l5: L5Blueprint;
  readonly existingFlows: readonly L4Artifact[];
  readonly existingBlocks: readonly L3Block[];
  readonly userIntent: string;
  readonly targetId?: string;
  readonly language?: string;
  readonly docs?: string;
}

const STATE_MACHINE_SCHEMA_EXAMPLE = `{
  "kind": "state-machine",
  "id": "purchase-order-lifecycle",
  "name": "Purchase Order Lifecycle",
  "entity": "PurchaseOrder",
  "initialState": "draft",
  "states": {
    "draft": {},
    "pending_approval": {
      "onEntry": { "blockRef": "notify-approver" }
    },
    "approved": {
      "onEntry": { "blockRef": "create-po-record" }
    },
    "rejected": {
      "onEntry": { "blockRef": "notify-requester-rejected" }
    }
  },
  "transitions": [
    { "from": "draft", "to": "pending_approval", "event": "submit" },
    { "from": "pending_approval", "to": "approved", "event": "approve", "guard": "check-budget-limit" },
    { "from": "pending_approval", "to": "rejected", "event": "reject" }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

// ── Few-shot examples ──

const FEW_SHOT_EXAMPLES = `
### Example 1: Support ticket lifecycle

**Intent**: "Design a state machine for customer support tickets with escalation and SLA tracking"

**Design reasoning**:
- Entity is \`SupportTicket\`
- States: open → in_progress → (escalated | resolved) → closed
- Guards: "escalate" needs SLA check (has the ticket exceeded response time?)
- Side effects: notify assignee on entry to in_progress, notify customer on resolved
- "closed" is a terminal state — no transitions out (but reopen is possible from resolved)

**Output**:
\`\`\`json
{
  "kind": "state-machine",
  "id": "support-ticket-lifecycle",
  "name": "Support Ticket Lifecycle",
  "entity": "SupportTicket",
  "initialState": "open",
  "states": {
    "open": {
      "onEntry": { "blockRef": "assign-to-queue" }
    },
    "in_progress": {
      "onEntry": { "blockRef": "notify-assignee" }
    },
    "escalated": {
      "onEntry": { "blockRef": "notify-escalation-team" }
    },
    "resolved": {
      "onEntry": { "blockRef": "notify-customer-resolved" }
    },
    "closed": {}
  },
  "transitions": [
    { "from": "open", "to": "in_progress", "event": "assign" },
    { "from": "in_progress", "to": "resolved", "event": "resolve" },
    { "from": "in_progress", "to": "escalated", "event": "escalate", "guard": "check-sla-breach" },
    { "from": "escalated", "to": "in_progress", "event": "de-escalate" },
    { "from": "escalated", "to": "resolved", "event": "resolve" },
    { "from": "resolved", "to": "in_progress", "event": "reopen" },
    { "from": "resolved", "to": "closed", "event": "close" }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}
\`\`\`

**Key decisions**:
- \`escalated\` can go back to \`in_progress\` (de-escalation path)
- \`resolved → in_progress\` allows reopening before final close
- Guard on escalation ensures it only triggers when SLA is actually breached
- Every state is reachable from \`open\` (no orphan states)

### Example 2: Content publishing pipeline

**Intent**: "Design a state machine for blog post publishing with draft, review, and scheduled publish"

**Design reasoning**:
- Entity is \`BlogPost\`
- States: draft → under_review → (approved | revision_needed) → scheduled → published
- Guards: "approve" needs quality check, "publish" needs schedule-time check
- Side effects: notify author on revision_needed, warm CDN cache on published
- \`revision_needed\` loops back to \`draft\` — author fixes and resubmits

**Output**:
\`\`\`json
{
  "kind": "state-machine",
  "id": "blog-post-publishing",
  "name": "Blog Post Publishing",
  "entity": "BlogPost",
  "initialState": "draft",
  "states": {
    "draft": {},
    "under_review": {
      "onEntry": { "blockRef": "notify-reviewer" }
    },
    "revision_needed": {
      "onEntry": { "blockRef": "notify-author-revision" }
    },
    "approved": {
      "onEntry": { "blockRef": "prepare-publish-assets" }
    },
    "scheduled": {
      "onEntry": { "blockRef": "register-publish-job" }
    },
    "published": {
      "onEntry": { "blockRef": "warm-cdn-cache" }
    }
  },
  "transitions": [
    { "from": "draft", "to": "under_review", "event": "submit_for_review" },
    { "from": "under_review", "to": "approved", "event": "approve", "guard": "check-content-quality" },
    { "from": "under_review", "to": "revision_needed", "event": "request_changes" },
    { "from": "revision_needed", "to": "draft", "event": "revise" },
    { "from": "approved", "to": "scheduled", "event": "schedule" },
    { "from": "approved", "to": "published", "event": "publish_now" },
    { "from": "scheduled", "to": "published", "event": "publish", "guard": "check-schedule-time" }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}
\`\`\`

**Key decisions**:
- Two paths to \`published\`: immediate (\`publish_now\`) or scheduled (\`schedule → publish\`)
- \`revision_needed → draft\` creates a review loop without losing history
- Guard on \`scheduled → published\` ensures time-based trigger is valid
- \`onEntry\` side effects chosen for actions that MUST happen when entering the state`;

export function buildDesignL4StateMachinePrompt(input: DesignL4StateMachineInput): string {
  const isNew = input.targetId === undefined;
  const action = isNew ? "Create" : "Update";

  const l5View = viewL5Overview(input.l5);

  const existingSection =
    input.existingFlows.length === 0
      ? "No existing L4 artifacts."
      : input.existingFlows
          .map(
            (f) => `- ${f.id} [${getL4Kind(f)}]: ${String(extractBlockRefs(f).length)} block refs`,
          )
          .join("\n");

  const existingBlocksSection =
    input.existingBlocks.length === 0
      ? "No existing L3 blocks."
      : input.existingBlocks
          .map(
            (b) =>
              `- ${b.id}: (${b.input.map((p) => p.type).join(", ")}) → ${b.output.map((p) => p.type).join(", ")}`,
          )
          .join("\n");

  return (
    complexityHeader("heavy") +
    [
      `# ${action} L4 StateMachine`,
      "",
      "You are designing a state machine (L4) for entity lifecycle management.",
      "A state machine defines states, transitions between them, and optional guards and side effects.",
      "",
      "## Project Context (L5)",
      "",
      l5View,
      "",
      "## User Intent",
      "",
      input.userIntent,
      "",
      ...(input.docs === undefined ? [] : ["## Graph Documentation", "", input.docs, ""]),
      "## Existing L4 Artifacts",
      "",
      existingSection,
      "",
      "## Existing L3 Blocks (available for reuse)",
      "",
      existingBlocksSection,
      "",
      "## StateMachine Structure",
      "",
      "- **entity**: The entity type this state machine manages (e.g., `PurchaseOrder`)",
      "- **initialState**: The starting state for new entities",
      "- **states**: Each state can have optional side effects:",
      "  - `onEntry.blockRef` — L3 block triggered when entering this state",
      "  - `onExit.blockRef` — L3 block triggered when leaving this state",
      "- **transitions**: Define allowed state changes:",
      "  - `from` / `to` — must reference declared states",
      "  - `event` — the trigger event name",
      "  - `guard` (optional) — L3 block id that returns boolean (transition only if true)",
      "",
      "## Examples",
      "",
      "Here are two complete examples showing how to go from intent to StateMachine JSON:",
      "",
      FEW_SHOT_EXAMPLES,
      "",
      "## Instructions",
      "",
      "Write to `.svp/l4/<id>.json` using this schema:",
      "",
      "```json",
      STATE_MACHINE_SCHEMA_EXAMPLE,
      "```",
      "",
      "After writing, run `forge rehash l4` to fix contentHash.",
      "Then show `forge view l4` to the user for confirmation.",
      "",
      "## Rules",
      "",
      '- `kind` MUST be `"state-machine"`',
      "- `initialState` must reference a declared state",
      "- All `from` and `to` in transitions must reference declared states",
      "- `guard` references an L3 block that returns a boolean",
      "- `onEntry`/`onExit` reference L3 blocks for side effects",
      "- Every state should be reachable from `initialState` via transitions",
      "- Write 'placeholder' for contentHash — rehash will fix it",
      "- Do NOT create L3 blocks here — only reference them by id",
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}
