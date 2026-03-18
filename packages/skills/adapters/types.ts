// adapters/types — Host adapter interface for multi-host support

export type HostId =
  | "claude-code"
  | "kimi-code"
  | "codex"
  | "cursor"
  | "windsurf"
  | "github-copilot"
  | "kode";

export interface HostAdapter {
  readonly id: HostId;
  readonly displayName: string;

  /** Directory where skill/command files are written (relative to project root) */
  skillDir: () => string;

  /** Generate skill/command files */
  generateSkillFiles: (language: string) => readonly SkillFile[];

  /** Path to context file (e.g. "CLAUDE.md" or "AGENTS.md") */
  contextFilePath: () => string;

  /** Marker string to detect if SVP section already exists */
  contextMarker: () => string;

  /** Generate the context section to append */
  generateContextSection: (projectName: string, language: string) => string;
}

export interface SkillFile {
  /** Relative path within skillDir (e.g. "svp.md" or "svp/SKILL.md") */
  readonly relativePath: string;
  readonly content: string;
}
