// Migration registry — export all migrations here

import { v1ToV2 } from "./v1-to-v2.js";
import type { Migration } from "../migrate.js";

export const migrations: readonly Migration[] = [{ from: "1", to: "2", migrate: v1ToV2 }];
