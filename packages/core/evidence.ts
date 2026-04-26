import { createHash } from "node:crypto";

export type EvidenceKind =
  | "source-excerpt"
  | "file-path"
  | "agent-observation"
  | "human-confirmation";

export type GovernanceConfidence = "low" | "medium" | "high";

export interface SourceEvidence {
  readonly path: string;
  readonly kind: EvidenceKind;
  readonly excerpt?: string;
  readonly excerptHash?: string;
  readonly fileHash?: string;
  readonly note?: string;
}

export interface EvidenceFileSnapshot {
  readonly path: string;
  readonly exists: boolean;
  readonly fileHash?: string;
  readonly content?: string;
}

export type EvidenceFileSnapshots = Readonly<Partial<Record<string, EvidenceFileSnapshot>>>;

export function computeEvidenceHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
