import { executeD1Batch } from "@/lib/db/d1-client";
import { ACTIVE_KEY_SQL, activeKeyParams, type ConnectorIdentity } from "./auth";

export async function discoverConnectorLinks(
  auth: ConnectorIdentity,
  source: "x" | "github" | "screenshot",
  sql: string,
  params: unknown[],
  now: number,
): Promise<void> {
  // D1 serializes this batch with link mutations: no change can be acknowledged
  // without its corresponding job insert. Failed batches leave discovery intact.
  await executeD1Batch(
    [
      { sql, params },
      {
        sql: `DELETE FROM connector_discovery WHERE user_id=? AND source=? AND ${ACTIVE_KEY_SQL}`,
        params: [auth.userId, source, ...activeKeyParams(auth, now)],
      },
    ],
    { connectorUserId: auth.userId },
  );
}
