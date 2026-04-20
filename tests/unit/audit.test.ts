// @vitest-environment node
import { describe, it, expect } from "vitest";
import { logApiRequest, recordAuditLog, getAuditLogs, getAuditLogsByUser, type AuditLogEntry } from "@/lib/api/audit";

describe("API Audit Logging", () => {
  const mockEntry: AuditLogEntry = {
    keyId: "key-123",
    keyPrefix: "zhe_abc",
    userId: "user-456",
    endpoint: "/api/v1/links",
    method: "GET",
    statusCode: 200,
  };

  describe("logApiRequest", () => {
    it("does not throw errors (fire-and-forget)", () => {
      // Should not throw even if the underlying operation fails
      expect(() => logApiRequest(mockEntry)).not.toThrow();
    });

    it("accepts valid audit entry", () => {
      // Just verify it accepts the entry without throwing
      logApiRequest({
        keyId: "key-test",
        keyPrefix: "zhe_test",
        userId: "user-test",
        endpoint: "/api/test",
        method: "POST",
        statusCode: 201,
      });
    });
  });

  describe("recordAuditLog", () => {
    it("inserts audit log entry", async () => {
      // Should complete without error in test environment
      await expect(recordAuditLog(mockEntry)).resolves.not.toThrow();
    });

    it("handles various HTTP methods", async () => {
      const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
      for (const method of methods) {
        await expect(
          recordAuditLog({ ...mockEntry, method }),
        ).resolves.not.toThrow();
      }
    });

    it("handles various status codes", async () => {
      const statusCodes = [200, 201, 400, 401, 403, 404, 429, 500];
      for (const statusCode of statusCodes) {
        await expect(
          recordAuditLog({ ...mockEntry, statusCode }),
        ).resolves.not.toThrow();
      }
    });
  });

  describe("getAuditLogs", () => {
    it("returns empty array for key with no logs", async () => {
      const logs = await getAuditLogs("nonexistent-key");
      expect(logs).toEqual([]);
    });

    it("accepts custom limit parameter", async () => {
      const logs = await getAuditLogs("key-123", 50);
      expect(logs).toEqual([]);
    });
  });

  describe("getAuditLogsByUser", () => {
    it("returns empty array for user with no logs", async () => {
      const logs = await getAuditLogsByUser("nonexistent-user");
      expect(logs).toEqual([]);
    });

    it("accepts custom limit parameter", async () => {
      const logs = await getAuditLogsByUser("user-123", 25);
      expect(logs).toEqual([]);
    });
  });
});