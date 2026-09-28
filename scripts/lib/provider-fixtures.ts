import type { XrayTweetResponse } from "../../models/xray";

export function xrayFixture(id: string): XrayTweetResponse {
  return {
    success: true,
    data: {
      id,
      text: "Field notes from a quiet morning. Save useful ideas, then make time to revisit them. #fieldnotes",
      author: {
        id: "fixture-author",
        username: "alex_fieldnotes",
        name: "Alex River",
        profile_image_url: "/logo-80.png",
        followers_count: 128,
        is_verified: false,
      },
      created_at: "2026-09-26T09:00:00Z",
      url: `https://x.com/alex_fieldnotes/status/${id}`,
      metrics: {
        retweet_count: 3,
        like_count: 24,
        reply_count: 2,
        quote_count: 1,
        view_count: 360,
        bookmark_count: 8,
      },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      lang: "en",
      entities: { hashtags: ["fieldnotes"], mentioned_users: [], urls: [] },
      media:
        process.env.ZHE_DATASET === "demo" || process.env.ZHE_LAUNCH_INTENT === "interactive"
          ? [
              {
                id: "field-cover",
                type: "PHOTO",
                url: `${process.env.R2_PUBLIC_DOMAIN}/demo/field-notes.svg`,
              },
            ]
          : [],
    },
  };
}

export function installProviderFixtures(): void {
  if (
    !process.env.ZHE_LOCAL_AUTH_TOKEN ||
    !["demo", "e2e"].includes(process.env.ZHE_ENVIRONMENT ?? "")
  )
    return;
  const original = globalThis.fetch;
  const localOrigin = process.env.ZHE_LOCAL_ORIGIN;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      (localOrigin && url.origin === localOrigin)
    )
      return original(input, init);
    if (
      ["api.openai.com", "aihubmix.com"].includes(url.hostname) &&
      url.pathname === "/v1/responses"
    ) {
      const body = (await request.json()) as { model?: string };
      if (body.model === "fixture-error")
        return Response.json(
          { error: { message: "Fixture provider unavailable", type: "server_error" } },
          { status: 503 },
        );
      const [, folderId = "demo-research", tagId = "demo-field", newTag = "field-notes"] = (
        body.model ?? ""
      ).split(":");
      const result = {
        title: "整理后的短标题",
        note: "便于检索和阅读的开发资料。",
        folders: [{ folderId, name: "开发资料", reason: "开发相关" }],
        tags: [{ tagId, name: "Reference", reason: "检索" }],
        newTags: [{ name: newTag, reason: "可复用主题" }],
      };
      return Response.json({
        id: "resp_fixture",
        object: "response",
        created_at: 1790553600,
        status: "completed",
        model: body.model,
        output: [
          {
            id: "msg_fixture",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: JSON.stringify(result), annotations: [] }],
          },
        ],
        usage: {
          input_tokens: 120,
          output_tokens: 80,
          total_tokens: 200,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      });
    }
    if (url.hostname === "xray.example.invalid") {
      if (request.headers.get("X-Webhook-Key") === "fixture-error")
        return Response.json({ error: "Fixture provider unavailable" }, { status: 503 });
      const id = url.pathname.match(/^\/api\/twitter\/tweets\/(\d+)$/)?.[1];
      if (id) return Response.json(xrayFixture(id));
      if (url.pathname === "/api/twitter/me/bookmarks")
        return Response.json({ success: true, data: [xrayFixture("1234567890").data] });
    }
    if (url.hostname === "example.com" && request.method === "GET")
      return new Response(
        '<!doctype html><html><head><title>Field notes</title><meta property="og:title" content="Field notes"><meta name="description" content="Synthetic field research material"></head><body>A useful reference for the local library.</body></html>',
        { headers: { "Content-Type": "text/html" } },
      );
    if (url.hostname === "backy.example.invalid" && !url.pathname.includes("fail"))
      return Response.json({ success: true });
    return Response.json({ error: "Local fixture provider unavailable" }, { status: 503 });
  };
}
