import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrationBatches, OPTIONAL_LOCAL_MIGRATIONS } from "@/scripts/lib/migration-batches";

describe("local migration batching", () => {
  it("preserves every real migration in order and isolates tolerated failures", () => {
    const files = readdirSync("drizzle/migrations")
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const batches = migrationBatches(files);
    expect(batches.flat()).toEqual(files);
    expect(batches.length).toBeLessThan(files.length);
    for (const optional of OPTIONAL_LOCAL_MIGRATIONS) {
      expect(batches.find((batch) => batch.includes(optional))).toEqual([optional]);
    }
  });

  it("keeps adjacent optional migrations separate without empty batches", () => {
    const optional = [...OPTIONAL_LOCAL_MIGRATIONS];
    expect(migrationBatches(optional)).toEqual(optional.map((file) => [file]));
    expect(migrationBatches([])).toEqual([]);
    expect(migrationBatches(["first.sql", "second.sql"])).toEqual([["first.sql", "second.sql"]]);
  });
});
