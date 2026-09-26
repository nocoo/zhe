export const OPTIONAL_LOCAL_MIGRATIONS = new Set([
  "0014_drop_discord_bot_settings.sql",
  "0016_drop_backy_pull_secret.sql",
]);

export function migrationBatches(files: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  for (const file of files) {
    if (OPTIONAL_LOCAL_MIGRATIONS.has(file)) {
      if (batch.length) batches.push(batch);
      batches.push([file]);
      batch = [];
    } else {
      batch.push(file);
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}
