import { describe, expect, it } from "vitest";
import {
  canonicalXPost,
  collectTweetEntities,
  mediaUrl,
  normalizeXPost,
  verifySignature,
} from "../src/connector/core.js";

const postId = "2000000000000000001";
const mediaId = "2000000000000000002";

function post(overrides: Record<string, unknown> = {}) {
  return {
    rest_id: postId,
    legacy: {
      full_text: "A saved post without media",
      created_at: "Sat Sep 12 08:00:00 +0000 2026",
      lang: "en",
      favorite_count: 7,
      entities: { urls: [], hashtags: [], user_mentions: [] },
    },
    core: {
      user_results: {
        result: {
          rest_id: "100001",
          legacy: {
            screen_name: "connector_test",
            name: "Connector Test",
            profile_image_url_https: "https://pbs.twimg.com/profile_images/100001/avatar.jpg",
          },
        },
      },
    },
    ...overrides,
  };
}

describe("Zhe X bookmark source", () => {
  it("fails closed for malformed URLs, CDN paths and media identities", () => {
    expect(canonicalXPost("invalid URL")).toBeNull();
    for (const url of [
      "invalid",
      "http://video.twimg.com/a",
      "https://video.twimg.com:4433/a",
      "https://user:pass@video.twimg.com/a",
      `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/720x480/test.mp4#hash`,
      `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/720x480/test.mp4?redirect=evil`,
    ])
      expect(mediaUrl(url, mediaId, "video")).toBeNull();
    expect(
      mediaUrl(
        `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/720x480/test.mp4`,
        "oops",
        "video",
      ),
    ).toBeNull();
    expect(
      mediaUrl("https://pbs.twimg.com/media/test?format=png&name=orig", mediaId, "photo"),
    ).toBeTruthy();
    expect(
      mediaUrl(
        `https://pbs.twimg.com/amplify_video_thumb/${mediaId}/img/test.jpg`,
        mediaId,
        "poster",
      ),
    ).toBeTruthy();
  });
  it("drops unavailable media, rejects malformed posts, and bounds nested quotes", () => {
    const base = post();
    for (const value of [
      { ...base, legacy: { ...base.legacy, full_text: "" } },
      { ...base, legacy: { ...base.legacy, full_text: "x".repeat(100_001) } },
      { ...base, legacy: { ...base.legacy, created_at: "no date" } },
      { ...base, core: {} },
    ])
      expect(normalizeXPost(value, postId)).toBeNull();
    expect(normalizeXPost(post({ rest_id: "bad" }), "bad")).toBeNull();
    const modern = {
      rest_id: "123",
      core: { screen_name: "modern", name: "Modern" },
      privacy: { protected: true },
    };
    expect(normalizeXPost(post({ core: { user_results: { result: modern } } }), postId)).toBeNull();
    const quote = post({ rest_id: "99" });
    const result = normalizeXPost(
      {
        ...base,
        views: { count: "18" },
        quoted_status_result: { result: { tweet: quote } },
        note_tweet: {
          note_tweet_results: {
            result: {
              text: "Note",
              entity_set: {
                hashtags: [{ text: "tag" }, {}],
                user_mentions: [{ screen_name: "someone" }],
                urls: [
                  { expanded_url: "https://example.com" },
                  { expanded_url: "javascript:alert(1)" },
                ],
              },
            },
          },
        },
        legacy: {
          ...base.legacy,
          in_reply_to_status_id_str: "98",
          retweeted_status_id_str: "97",
          favorite_count: -1,
          extended_entities: {
            media: [
              { id_str: mediaId, type: "video", ext_media_availability: { status: "Unavailable" } },
              { id_str: mediaId, type: "unknown" },
              { id_str: mediaId, type: "photo", media_url_https: "https://evil.invalid/a.jpg" },
              { id_str: mediaId, type: "video", video_info: { variants: [] } },
              {
                id_str: mediaId,
                type: "animated_gif",
                original_info: { width: 720, height: 480 },
                video_info: {
                  variants: [
                    {
                      content_type: "video/mp4",
                      url: `https://video.twimg.com/amplify_video/${mediaId}/vid/avc1/720x480/test.mp4?tag=1`,
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      postId,
    );
    expect(result?.tweet).toMatchObject({
      is_reply: true,
      reply_to_id: "98",
      is_retweet: true,
      is_quote: true,
      metrics: { view_count: 18, like_count: 0 },
      entities: { hashtags: ["tag"], mentioned_users: ["someone"], urls: ["https://example.com"] },
      quoted_tweet: { id: "99", media: [] },
    });
    expect(result?.media).toMatchObject([{ type: "GIF", width: 720, height: 480 }]);
  });
  it("handles cyclic browser payloads without recursing forever", () => {
    const value: Record<string, unknown> = { nested: [null, post()] };
    value.loop = value;
    expect([...collectTweetEntities(value).keys()]).toEqual([postId]);
  });
  it("validates actual MIME signatures instead of trusting response headers", () => {
    const mp4 = new Uint8Array(32);
    mp4.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
    const png = new Uint8Array(32);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const webp = new TextEncoder().encode("RIFF....WEBP....");
    for (const [bytes, mime] of [
      [mp4, "video/mp4"],
      [png, "image/png"],
      [webp, "image/webp"],
      [new Uint8Array([255, 216, 255]), "image/jpeg"],
    ] as const)
      expect(() => verifySignature(bytes, mime)).not.toThrow();
    for (const mime of ["video/mp4", "image/png", "image/jpeg", "image/webp", "text/html"])
      expect(() => verifySignature(new Uint8Array(32), mime)).toThrow("invalid_media");
  });
  it("recognizes saved URL variants without requiring an X bookmark", () => {
    for (const url of [
      `https://x.com/example/status/${postId}?s=20`,
      `https://mobile.twitter.com/example/status/${postId}/video/1`,
      `https://x.com/i/web/status/${postId}`,
    ]) {
      expect(canonicalXPost(url)).toEqual({ id: postId, url: `https://x.com/i/status/${postId}` });
    }
    expect(canonicalXPost("https://twitter.com/example/status/12345")?.id).toBe("12345");
  });

  it.each([
    "https://x.com.attacker.invalid/example/status/12345",
    "https://x.com@attacker.invalid/example/status/12345",
    "https://user:password@x.com/example/status/12345",
    "https://x.com:8443/example/status/12345",
    "https://x.com/example/status/12345garbage",
    "https://x.com/example/status/12345/anything",
    "https://x.com/example",
    "javascript:alert(1)",
  ])("rejects non-post or ambiguous URL %s", (url) => {
    expect(canonicalXPost(url)).toBeNull();
  });

  it("collects a text-only focal post among replies", () => {
    const focal = post();
    const decoy = post({ rest_id: "2000000000000000099" });
    const entities = collectTweetEntities({ entries: [{ result: decoy }, { result: focal }] });
    expect(entities.get(postId)).toEqual(focal);
    expect(normalizeXPost(entities.get(postId), postId)?.tweet.text).toBe(
      "A saved post without media",
    );
  });

  it("finishes a text-only post with author, date and metrics", () => {
    const result = normalizeXPost(post(), postId);
    expect(result?.tweet).toMatchObject({
      id: postId,
      text: "A saved post without media",
      author: { username: "connector_test", name: "Connector Test" },
      created_at: "2026-09-12T08:00:00.000Z",
      metrics: { like_count: 7 },
    });
    expect(result?.media).toEqual([]);
  });

  it("uses the complete note text instead of a truncated timeline excerpt", () => {
    const fullText = "A long saved post. ".repeat(400);
    const result = normalizeXPost(
      post({ note_tweet: { note_tweet_results: { result: { text: fullText } } } }),
      postId,
    );
    expect(result?.tweet.text).toBe(fullText);
  });

  it("handles modern author fields and visibility wrappers", () => {
    const result = normalizeXPost(
      {
        tweet: post({
          core: {
            user_results: {
              result: {
                rest_id: "100001",
                core: { screen_name: "modern_test", name: "Modern Test" },
                avatar: { image_url: "https://pbs.twimg.com/profile_images/100001/avatar.jpg" },
                is_blue_verified: true,
              },
            },
          },
        }),
      },
      postId,
    );
    expect(result?.tweet.author).toMatchObject({ username: "modern_test", is_verified: true });
  });

  it("selects only the focal post's exact video and a first-class photo", () => {
    const base = post();
    const result = normalizeXPost(
      {
        ...base,
        legacy: {
          ...base.legacy,
          extended_entities: {
            media: [
              {
                id_str: mediaId,
                type: "video",
                media_url_https: `https://pbs.twimg.com/ext_tw_video_thumb/${mediaId}/pu/img/poster.jpg`,
                video_info: {
                  duration_millis: 7200,
                  variants: [
                    {
                      content_type: "video/mp4",
                      bitrate: 256,
                      url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/320x180/a.mp4`,
                    },
                    {
                      content_type: "video/mp4",
                      bitrate: 1024,
                      url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/1280x720/b.mp4`,
                    },
                    {
                      content_type: "video/mp4",
                      bitrate: 9000,
                      url: "https://attacker.invalid/video.mp4",
                    },
                  ],
                },
              },
              {
                id_str: "2000000000000000003",
                type: "photo",
                media_url_https: "https://pbs.twimg.com/media/synthetic-photo.jpg",
                original_info: { width: 1200, height: 800 },
              },
              {
                id_str: "2000000000000000004",
                type: "photo",
                source_status_id_str: "2000000000000000099",
                media_url_https: "https://pbs.twimg.com/media/unrelated.jpg",
              },
            ],
          },
        },
      },
      postId,
    );
    expect(result?.media).toHaveLength(2);
    expect(result?.media[0]).toMatchObject({
      id: mediaId,
      type: "VIDEO",
      url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/1280x720/b.mp4`,
      duration: 7.2,
    });
    expect(result?.media[1]).toMatchObject({ type: "PHOTO", width: 1200, height: 800 });
  });

  it("never mistakes a protected, unavailable or different post for the target", () => {
    expect(normalizeXPost(post({ rest_id: "2000000000000000099" }), postId)).toBeNull();
    expect(normalizeXPost(post({ __typename: "TweetUnavailable" }), postId)).toBeNull();
    const raw = post();
    raw.core.user_results.result.legacy = {
      ...raw.core.user_results.result.legacy,
      ...{ protected: true },
    };
    expect(normalizeXPost(raw, postId)).toBeNull();
    expect(normalizeXPost(null, postId)).toBeNull();
  });
});
