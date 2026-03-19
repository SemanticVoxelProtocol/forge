// Migration registry — export all migrations here
// Future migrations go in separate files, e.g. v1-to-v2.ts

import type { Migration } from "../migrate.js";

export const migrations: readonly Migration[] = [
  // Example for future use:
  // { from: "1", to: "2", migrate: v1ToV2 },
];
