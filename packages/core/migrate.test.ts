import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  it("is a no-op when from === to", async () => {
    // Should not throw — nothing to do
    await runMigrations("/unused", 1, 1);
  });

  it("throws when migration is missing", async () => {
    // No migration from v1 to v2 exists in the empty registry
    await expect(runMigrations("/unused", 1, 2)).rejects.toThrow("No migration found");
  });
});
