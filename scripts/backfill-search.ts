/** Apply migration 0028 first. Uses the configured D1 proxy, never prints source content. */
import { executeD1Query } from "../lib/db/d1-client";
import { ScopedDB } from "../lib/db/scoped";
import { SearchIndexPendingError } from "../lib/db/scoped/search";

const users = await executeD1Query<{ id: string }>("SELECT id FROM users ORDER BY id");
let complete = 0;
for (const user of users) {
  const db = new ScopedDB(user.id);
  for (let attempt = 0; ; attempt++) {
    try {
      await db.prepareSearchIndex();
      break;
    } catch (error) {
      if (!(error instanceof SearchIndexPendingError) || attempt >= 1000) throw error;
    }
  }
  complete++;
  console.log(`Prepared search for ${complete}/${users.length} users`);
}
console.log("Search projection backfill complete");
