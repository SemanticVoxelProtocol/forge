// design-l4-event-graph — L4 EventGraph 设计 prompt 模板

import { languageDirective } from "../../core/i18n.js";
import { extractBlockRefs, getL4Kind } from "../../core/l4.js";
import { viewL5Overview } from "../../core/view.js";
import { complexityHeader } from "./complexity-header.js";
import type { L3Block } from "../../core/l3.js";
import type { L4Artifact } from "../../core/l4.js";
import type { L5Blueprint } from "../../core/l5.js";

export interface DesignL4EventGraphInput {
  readonly l5: L5Blueprint;
  readonly existingFlows: readonly L4Artifact[];
  readonly existingBlocks: readonly L3Block[];
  readonly userIntent: string;
  readonly targetId?: string;
  readonly language?: string;
}

const EVENT_GRAPH_SCHEMA_EXAMPLE = `{
  "kind": "event-graph",
  "id": "doc-collab",
  "name": "Document Collaboration",
  "state": {
    "document": { "type": "CRDTDocument", "description": "Shared document state" },
    "cursors": { "type": "CursorMap", "description": "Active user cursor positions" }
  },
  "handlers": [
    {
      "id": "on-local-edit",
      "event": "user.local_edit",
      "steps": [
        { "id": "validate", "action": "process", "blockRef": "validate-edit", "next": "apply" },
        { "id": "apply", "action": "process", "blockRef": "apply-crdt-op", "next": null }
      ],
      "dataFlows": [
        { "from": "$event.operation", "to": "validate.input" },
        { "from": "validate.result", "to": "apply.input" },
        { "from": "apply.result", "to": "$state.document" }
      ]
    }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}`;

// ── Few-shot examples ──

const FEW_SHOT_EXAMPLES = `
### Example 1: Real-time chat room

**Intent**: "Design an event-graph for a real-time chat room with message history and online user tracking"

**Design reasoning**:
- Two pieces of shared state: message list and online users set
- Three events: user joins, user sends message, user leaves
- Each handler reads from \`$event\` and writes to \`$state\`
- "send_message" handler needs validation before appending

**Output**:
\`\`\`json
{
  "kind": "event-graph",
  "id": "chat-room",
  "name": "Real-time Chat Room",
  "state": {
    "messages": { "type": "ChatMessage[]", "description": "Ordered list of chat messages" },
    "onlineUsers": { "type": "UserSet", "description": "Currently connected user ids" }
  },
  "handlers": [
    {
      "id": "on-join",
      "event": "user.join",
      "steps": [
        { "id": "add-user", "action": "process", "blockRef": "add-online-user", "next": null }
      ],
      "dataFlows": [
        { "from": "$event.userId", "to": "add-user.input" },
        { "from": "$state.onlineUsers", "to": "add-user.currentSet" },
        { "from": "add-user.result", "to": "$state.onlineUsers" }
      ]
    },
    {
      "id": "on-message",
      "event": "user.send_message",
      "steps": [
        { "id": "validate-msg", "action": "process", "blockRef": "validate-chat-message", "next": "append-msg" },
        { "id": "append-msg", "action": "process", "blockRef": "append-message", "next": null }
      ],
      "dataFlows": [
        { "from": "$event.content", "to": "validate-msg.input" },
        { "from": "validate-msg.result", "to": "append-msg.message" },
        { "from": "$state.messages", "to": "append-msg.history" },
        { "from": "append-msg.result", "to": "$state.messages" }
      ]
    },
    {
      "id": "on-leave",
      "event": "user.leave",
      "steps": [
        { "id": "remove-user", "action": "process", "blockRef": "remove-online-user", "next": null }
      ],
      "dataFlows": [
        { "from": "$event.userId", "to": "remove-user.input" },
        { "from": "$state.onlineUsers", "to": "remove-user.currentSet" },
        { "from": "remove-user.result", "to": "$state.onlineUsers" }
      ]
    }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}
\`\`\`

### Example 2: IoT sensor aggregation

**Intent**: "Design an event-graph that aggregates IoT sensor readings and triggers alerts when thresholds are exceeded"

**Design reasoning**:
- State tracks latest readings and alert status
- Two events: sensor data arrives, operator acknowledges alert
- "sensor.reading" handler needs a fan-out: update readings AND check threshold in parallel, then merge results
- Use \`parallel\` + \`wait\` actions for concurrent processing

**Output**:
\`\`\`json
{
  "kind": "event-graph",
  "id": "sensor-aggregator",
  "name": "IoT Sensor Aggregation",
  "state": {
    "readings": { "type": "SensorReadingMap", "description": "Latest reading per sensor id" },
    "alertStatus": { "type": "AlertState", "description": "Current alert level and details" }
  },
  "handlers": [
    {
      "id": "on-reading",
      "event": "sensor.reading",
      "steps": [
        { "id": "fan-out", "action": "parallel", "branches": ["update-reading", "check-threshold"] },
        { "id": "update-reading", "action": "process", "blockRef": "upsert-sensor-reading", "next": null },
        { "id": "check-threshold", "action": "process", "blockRef": "evaluate-threshold", "next": "merge" },
        { "id": "merge", "action": "wait", "waitFor": ["update-reading", "check-threshold"], "next": "maybe-alert" },
        { "id": "maybe-alert", "action": "process", "blockRef": "emit-alert-if-needed", "next": null }
      ],
      "dataFlows": [
        { "from": "$event.sensorId", "to": "update-reading.sensorId" },
        { "from": "$event.value", "to": "update-reading.value" },
        { "from": "$state.readings", "to": "update-reading.current" },
        { "from": "update-reading.result", "to": "$state.readings" },
        { "from": "$event.value", "to": "check-threshold.value" },
        { "from": "check-threshold.result", "to": "maybe-alert.evaluation" },
        { "from": "$state.alertStatus", "to": "maybe-alert.currentAlert" },
        { "from": "maybe-alert.result", "to": "$state.alertStatus" }
      ]
    },
    {
      "id": "on-ack",
      "event": "operator.acknowledge_alert",
      "steps": [
        { "id": "clear-alert", "action": "process", "blockRef": "reset-alert-status", "next": null }
      ],
      "dataFlows": [
        { "from": "$event.alertId", "to": "clear-alert.input" },
        { "from": "$state.alertStatus", "to": "clear-alert.current" },
        { "from": "clear-alert.result", "to": "$state.alertStatus" }
      ]
    }
  ],
  "contentHash": "placeholder",
  "revision": { "rev": 1, "parentRev": null, "source": { "type": "init" }, "timestamp": "..." }
}
\`\`\``;

export function buildDesignL4EventGraphPrompt(input: DesignL4EventGraphInput): string {
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
      `# ${action} L4 EventGraph`,
      "",
      "You are designing an event-graph (L4) for event-driven / reactive systems.",
      "An event-graph declares shared state and multiple event handlers, each with its own step chain.",
      "",
      "## Project Context (L5)",
      "",
      l5View,
      "",
      "## User Intent",
      "",
      input.userIntent,
      "",
      "## Existing L4 Artifacts",
      "",
      existingSection,
      "",
      "## Existing L3 Blocks (available for reuse)",
      "",
      existingBlocksSection,
      "",
      "## EventGraph Structure",
      "",
      "- **state**: Declare shared state keys with type and description",
      "  - Each key is accessible via `$state.key` in dataFlows",
      "- **handlers**: Each handler responds to a specific event",
      "  - `event`: Event name (e.g., `user.local_edit`, `sync.remote_update`)",
      "  - `steps`: Same step model as Flow (process/parallel/wait/call)",
      "  - `dataFlows`: Connect steps, plus special prefixes:",
      "    - `$event.field` — read from the incoming event payload",
      "    - `$state.key` — read from or write to shared state",
      "",
      "## Examples",
      "",
      "Here are two complete examples showing how to go from intent to EventGraph JSON:",
      "",
      FEW_SHOT_EXAMPLES,
      "",
      "## Instructions",
      "",
      "Write to `.svp/l4/<id>.json` using this schema:",
      "",
      "```json",
      EVENT_GRAPH_SCHEMA_EXAMPLE,
      "```",
      "",
      "After writing, run `forge rehash l4` to fix contentHash.",
      "Then show `forge view l4` to the user for confirmation.",
      "",
      "## Rules",
      "",
      '- `kind` MUST be `"event-graph"`',
      "- Each handler must have a unique `event` name",
      "- `state` declares all shared state keys — handlers reference them via `$state.key`",
      "- Handler steps follow the same rules as Flow steps (unique ids, valid next chain)",
      "- `$event.field` references event payload — no schema validation (external)",
      "- `$state.key` must reference a declared state key",
      "- Write 'placeholder' for contentHash — rehash will fix it",
      "- Do NOT create L3 blocks here — only reference them by id",
    ].join("\n") +
    languageDirective(input.language ?? "en")
  );
}
