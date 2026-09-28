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
