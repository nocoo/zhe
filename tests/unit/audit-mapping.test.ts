// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock d1-client to return actual rows for audit queries
const mockExecuteD1Query = vi.fn();
vi.mock("@/lib/db/d1-client", () => ({
  executeD1Query: (...args: unknown[]) => mockExecuteD1Query(...args),
}));

import { getAuditLogs, getAuditLogsByUser } from "@/lib/api/audit";

describe("Audit log row mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAuditLogs maps raw D1 rows to typed objects", async () => {
    mockExecuteD1Query.mockResolvedValue([
      {
        id: "log-1",
        key_id: "key-123",
        key_prefix: "zhe_abc",
        user_id: "user-456",
        endpoint: "/api/v1/links",
        method: "GET",
        status_code: 200,
        timestamp: 1700000000,
      },
    ]);

    const logs = await getAuditLogs("key-123");

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      id: "log-1",
      keyId: "key-123",
      keyPrefix: "zhe_abc",
      userId: "user-456",
      endpoint: "/api/v1/links",
      method: "GET",
      statusCode: 200,
      timestamp: new Date(1700000000 * 1000),
    });
  });

  it("getAuditLogsByUser maps raw D1 rows to typed objects", async () => {
    mockExecuteD1Query.mockResolvedValue([
      {
        id: "log-2",
        key_id: "key-789",
        key_prefix: "zhe_xyz",
        user_id: "user-456",
        endpoint: "/api/v1/uploads",
        method: "POST",
        status_code: 201,
        timestamp: 1700001000,
      },
    ]);

    const logs = await getAuditLogsByUser("user-456");

    expect(logs).toHaveLength(1);
    expect(logs[0]).toEqual({
      id: "log-2",
      keyId: "key-789",
      keyPrefix: "zhe_xyz",
      userId: "user-456",
      endpoint: "/api/v1/uploads",
      method: "POST",
      statusCode: 201,
      timestamp: new Date(1700001000 * 1000),
    });
  });
});