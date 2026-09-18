import { randomUUID } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiPost } from "./helpers/http";
import { cleanupTestData, executeD1, queryD1, seedTestUser } from "./helpers/seed";

const owner = `search-http-${randomUUID()}`;
const other = `search-other-${randomUUID()}`;
let cookie: string;
let linkId: number;
beforeAll(async () => {
  await seedTestUser(owner);
  await seedTestUser(other);
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Local test AUTH_SECRET required");
  cookie = `authjs.session-token=${await encode({ token: { sub: owner }, secret, salt: "authjs.session-token" })}`;
  const rows = await queryD1<{ id: number }>(
    "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?) RETURNING id",
    [owner, randomUUID(), "https://github.com/example/search", "Search repository", Date.now()],
  );
  linkId = rows[0]?.id ?? 0;
  await executeD1(
    "INSERT INTO github_bookmarks(link_id,user_id,source_url,result_json,updated_at) VALUES(?,?,?,?,?)",
    [
      linkId,
      owner,
      "https://github.com/example/search",
      JSON.stringify({
        fullName: "example/search",
        readme: `${"padding ".repeat(10000)}CAFÉ 中文 %_ C++`,
        topics: ["rare-topic"],
      }),
      Date.now(),
    ],
  );
  await executeD1(
    "INSERT INTO links(user_id,slug,original_url,meta_title,created_at) VALUES(?,?,?,?,?)",
    [other, randomUUID(), "https://example.com/private", "foreign-secret", Date.now()],
  );
});
afterAll(async () => {
  await cleanupTestData(owner);
  await cleanupTestData(other);
});
describe("real authenticated search HTTP", () => {
  it("rejects anonymous and invalid inputs", async () => {
    expect((await apiPost("/api/search", { query: "x" })).status).toBe(401);
    expect(
      (await apiPost("/api/search", { query: "x", limit: 999 }, { Cookie: cookie })).status,
    ).toBe(400);
  });
  it("searches full enrichment through the Worker/D1 projection and returns bounded context", async () => {
    const response = await apiPost(
      "/api/search",
      { query: "  cafe\u0301\n中文 %_ c++ " },
      { Cookie: cookie },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data = await response.json();
    expect(data.total).toBe(1);
    expect(data.items[0].id).toBe(linkId);
    expect(data.items[0].match.label).toBe("README");
    expect(JSON.stringify(data).length).toBeLessThan(2000);
    expect(
      (
        await (
          await apiPost(
            "/api/search",
            { query: "foreign-secret", userId: other },
            { Cookie: cookie },
          )
        ).json()
      ).total,
    ).toBe(0);
  });
  it("rebuilds after enrichment updates and retains source filtering", async () => {
    await executeD1("UPDATE github_bookmarks SET result_json=? WHERE link_id=?", [
      JSON.stringify({ readme: "new-readme-tail", analysis: { techStack: ["new-stack"] } }),
      linkId,
    ]);
    for (const query of ["new-readme-tail", "new-stack"])
      expect(
        (await (await apiPost("/api/search", { query }, { Cookie: cookie })).json()).total,
      ).toBe(1);
    expect(
      (await (await apiPost("/api/search", { query: "rare-topic" }, { Cookie: cookie })).json())
        .total,
    ).toBe(0);
    expect(
      (
        await (
          await apiPost("/api/search", { query: "new-stack", source: "x" }, { Cookie: cookie })
        ).json()
      ).total,
    ).toBe(0);
  });
  it("indexes edited title and note while retaining raw title search", async () => {
    await executeD1("UPDATE links SET title=?,note=? WHERE id=?", [
      "我的整理标题",
      "手工补充线索",
      linkId,
    ]);
    for (const query of [
      "我的整理标题",
      "手工补充线索",
      "Search repository",
      "repository 手工补充线索 new-stack",
    ]) {
      const response = await apiPost("/api/search", { query }, { Cookie: cookie });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.total).toBe(1);
      expect(data.items[0].title).toBe("我的整理标题");
    }
  });
});
