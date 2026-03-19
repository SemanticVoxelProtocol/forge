// Migration runner — sequential schema migrations for .svp/ data model

import { migrations } from "./migrations/index.js";

export interface Migration {
  readonly from: string; // major version, e.g. "1"
  readonly to: string; // major version, e.g. "2"
  readonly migrate: (root: string) => Promise<void>;
}

/**
 * Run all migrations needed to go from `fromMajor` to `toMajor`.
 * Finds the chain of migrations and executes them sequentially.
 */
export async function runMigrations(
  root: string,
  fromMajor: number,
  toMajor: number,
): Promise<void> {
  for (let v = fromMajor; v < toMajor; v++) {
    const from = String(v);
    const to = String(v + 1);
    const migration = migrations.find((m) => m.from === from && m.to === to);
    if (migration === undefined) {
      throw new Error(
        `No migration found from schema v${from} to v${to}. ` +
          `Cannot upgrade .svp/ data. Please upgrade forge to a version that supports this migration.`,
      );
    }
    await migration.migrate(root);
  }
}
