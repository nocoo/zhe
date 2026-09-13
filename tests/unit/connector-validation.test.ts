import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import { normalizeXPost, type XCapture } from "@/cli/src/connector/core";
import { validateCapture } from "@/lib/connector/validation";

const postId = "2000000000000000001";
const mediaId = "2000000000000000002";
const value = normalizeXPost(
  {
    rest_id: postId,
    legacy: { full_text: "Synthetic validation post", created_at: "2026-09-12T00:00:00Z" },
    core: {
      user_results: {
        result: { rest_id: "123", legacy: { name: "Example", screen_name: "example" } },
      },
    },
  },
  postId,
);
assert(value);
const base = value;

describe("Connector capture trust boundary", () => {
  const invalid: [string, (capture: XCapture) => void][] = [
    [
      "foreign URL",
      (c) => {
        c.tweet.url = "https://example.com/private";
      },
    ],
    [
      "invalid username",
      (c) => {
        c.tweet.author.username = "bad/user";
      },
    ],
    [
      "invalid date",
      (c) => {
        c.tweet.created_at = "bad";
      },
    ],
    [
      "untrusted avatar",
      (c) => {
        c.tweet.author.profile_image_url = "https://evil.invalid/a.png";
      },
    ],
    [
      "oversize text",
      (c) => {
        c.tweet.text = "x".repeat(100_001);
      },
    ],
    [
      "empty text",
      (c) => {
        c.tweet.text = " ";
      },
    ],
    [
      "negative metric",
      (c) => {
        c.tweet.metrics.like_count = -1;
      },
    ],
    [
      "oversize entity list",
      (c) => {
        c.tweet.entities.hashtags = Array(101).fill("tag");
      },
    ],
    [
      "foreign media",
      (c) => {
        c.tweet.media = [{ id: mediaId, type: "PHOTO", url: "https://evil.invalid/photo.jpg" }];
      },
    ],
    [
      "unsupported media type",
      (c) => {
        c.tweet.media = [
          { id: mediaId, type: "AUDIO" as "VIDEO", url: "https://pbs.twimg.com/media/test.jpg" },
        ];
      },
    ],
    [
      "untrusted poster",
      (c) => {
        c.tweet.media = [
          {
            id: mediaId,
            type: "PHOTO",
            url: "https://pbs.twimg.com/media/test.jpg",
            thumbnail_url: "https://evil.invalid/a.jpg",
          },
        ];
      },
    ],
    [
      "excessive duration",
      (c) => {
        c.tweet.media = [
          {
            id: mediaId,
            type: "PHOTO",
            url: "https://pbs.twimg.com/media/test.jpg",
            duration: Infinity,
          },
        ];
      },
    ],
    [
      "negative dimensions",
      (c) => {
        c.tweet.media = [
          { id: mediaId, type: "PHOTO", url: "https://pbs.twimg.com/media/test.jpg", width: -1 },
        ];
      },
    ],
    [
      "duplicate media",
      (c) => {
        c.tweet.media = Array(2).fill({
          id: mediaId,
          type: "PHOTO",
          url: "https://pbs.twimg.com/media/test.jpg",
        });
      },
    ],
    [
      "excessive attachments",
      (c) => {
        c.tweet.media = Array(17).fill({});
      },
    ],
    [
      "invalid reply ID",
      (c) => {
        c.tweet.reply_to_id = "bad";
      },
    ],
    [
      "nested quote",
      (c) => {
        c.tweet.quoted_tweet = structuredClone(base.tweet);
        c.tweet.quoted_tweet.quoted_tweet = structuredClone(base.tweet);
      },
    ],
    [
      "quote media",
      (c) => {
        c.tweet.quoted_tweet = structuredClone(base.tweet);
        c.tweet.quoted_tweet.media = [
          { id: mediaId, type: "PHOTO", url: "https://pbs.twimg.com/media/test.jpg" },
        ];
      },
    ],
  ];
  it.each(invalid)("rejects %s", (_name, mutate) => {
    const data = structuredClone(base);
    mutate(data);
    expect(() => validateCapture(data, postId)).toThrow("invalid_capture");
  });
  it("preserves validated fields and drops untrusted top-level transport data", () => {
    const data = structuredClone(base);
    data.tweet.quoted_tweet = structuredClone(base.tweet);
    data.tweet.media = [
      {
        id: mediaId,
        type: "VIDEO",
        url: `https://video.twimg.com/ext_tw_video/${mediaId}/pu/vid/1280x720/test.mp4`,
        thumbnail_url: `https://pbs.twimg.com/ext_tw_video_thumb/${mediaId}/pu/img/test.jpg`,
        width: 1280,
        height: 720,
        duration: 7.2,
      },
    ];
    data.tweet.entities.urls = ["https://example.com", "javascript:alert(1)"];
    data.tweet.reply_to_id = "123";
    data.tweet.author.profile_image_url = "https://pbs.twimg.com/profile_images/123/avatar.jpg";
    const result = validateCapture(
      { ...data, secret: "synthetic-only", media: [{ url: "https://evil.invalid" }] },
      postId,
    );
    expect(result.media).toEqual(data.tweet.media);
    expect(result.tweet.quoted_tweet?.text).toBe(base.tweet.text);
    expect(result.tweet.entities.urls).toEqual(["https://example.com"]);
    expect(JSON.stringify(result)).not.toContain("synthetic-only");
  });
  it.each([null, [], {}, { tweet: { id: postId, url: base.tweet.url } }])(
    "rejects malformed captures",
    (raw) => {
      expect(() => validateCapture(raw, postId)).toThrow("invalid_capture");
    },
  );
});
