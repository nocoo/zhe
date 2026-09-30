import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { test as base, expect } from "@playwright/test";
import { executeD1 } from "../helpers/d1";

export { expect };

export const test = base.extend<{ owner: string }>({
  owner: async ({ context, baseURL }, use) => {
    assert(baseURL === "http://localhost:27006");
    const secret = process.env.AUTH_SECRET;
    assert(secret);
    const owner = `reflow-${randomUUID()}`;
    await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
      owner,
      "Card motion test",
      `${owner}@test.local`,
    ]);
    const session = await encode({
      token: { sub: owner, name: "Card motion test", email: `${owner}@test.local` },
      secret,
      salt: "authjs.session-token",
    });
    // WebKit keeps host-only and domain cookies separately; replace the setup session.
    await context.clearCookies();
    await context.addCookies([{ name: "authjs.session-token", value: session, url: baseURL }]);
    try {
      await use(owner);
    } finally {
      await executeD1("DELETE FROM users WHERE id = ?", [owner]);
    }
  },
});
