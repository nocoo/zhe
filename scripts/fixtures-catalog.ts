import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { generateExcerpt } from "../lib/markdown";
import { uploadBufferToR2 } from "../lib/r2/local-binding";
import { isValidTagColor } from "../models/tags";
import { executeD1, queryD1 } from "../tests/playwright/helpers/d1";

export const CATALOG_VERSION = 6;
export const CATALOG_ANCHOR = "2026-09-27T00:00:00Z";
export const FIXTURE_USER = { id: "e2e-test-user-id", name: "Alex River", email: "e2e@test.local" };
const time = Date.parse(CATALOG_ANCHOR);
const user = FIXTURE_USER.id;
const day = 86_400_000;
const illustrations = [
  { slug: "tide-atlas", name: "Tide atlas", width: 1200, height: 900 },
  { slug: "marker-study", name: "Marker study", width: 800, height: 1200 },
  { slug: "tidal-index", name: "Tidal index", width: 900, height: 900 },
  { slug: "coast-transect", name: "Coast transect", width: 1500, height: 500 },
];

type CatalogLink = [
  slug: string,
  url: string,
  title: string | null,
  description: string | null,
  folder: string | null,
  hidden: number,
  expires: number | null,
  screenshot?: string,
  note?: string,
];

export async function seedCatalog(): Promise<void> {
  const marker = await queryD1<{ value: string }>(
    "SELECT value FROM _test_marker WHERE key = 'env'",
  );
  if (marker[0]?.value !== "test") throw new Error("Owned local database required");
  const mediaOrigin = process.env.R2_PUBLIC_DOMAIN;
  if (!mediaOrigin) throw new Error("Missing local media URL");
  const mediaUrl = (key: string) => `${mediaOrigin}/${key}`;
  await executeD1("INSERT OR IGNORE INTO users(id,name,email) VALUES(?,?,?)", [
    user,
    FIXTURE_USER.name,
    FIXTURE_USER.email,
  ]);
  await executeD1("INSERT INTO users(id,name,email) VALUES(?,?,?)", [
    "fixture-other-owner",
    "Morgan Lake",
    "morgan@example.invalid",
  ]);
  for (const [id, name, color] of [
    ["reading", "Read next", "sky"],
    ["design", "Design systems", "primary"],
    ["field", "Field research", "green"],
    ["visual", "Visual references", "sky"],
    ["follow-up", "Follow up", "amber"],
  ]) {
    if (!isValidTagColor(String(color))) throw new Error("Invalid fixture tag color");
    await executeD1("INSERT INTO tags(id,user_id,name,color,created_at) VALUES(?,?,?,?,?)", [
      `demo-${id}`,
      user,
      name,
      color,
      time,
    ]);
  }
  for (const [id, name] of [
    ["research", "Field research"],
    ["library", "Small web library"],
    ["atlas", "Coastal atlas"],
    ["empty", "Next season"],
  ]) {
    await executeD1("INSERT INTO folders(id,user_id,name,icon,created_at) VALUES(?,?,?,?,?)", [
      `demo-${id}`,
      user,
      name,
      "folder",
      time,
    ]);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720"><rect width="1200" height="720" fill="#e6e2d8"/><circle cx="920" cy="150" r="80" fill="#e7b86b"/><path d="M0 500L250 200 460 510 710 290 1200 630V720H0" fill="#74918a"/><path d="M0 610L300 480 550 660 970 390 1200 540V720H0" fill="#3d625f"/><text x="64" y="112" font-family="sans-serif" font-size="44" fill="#233b3a">FIELD NOTES / 2026</text></svg>`;
  const media = [
    {
      key: "demo/field-notes.svg",
      name: "Field notes — cover.svg",
      type: "image/svg+xml",
      body: svg,
    },
    {
      key: "demo/research-notes.md",
      name: "Research notes.md",
      type: "text/markdown",
      body: "# Field research\n\nSynthetic demonstration material, authored for Zhe.\n\n- Observe the shoreline\n- Capture accessible navigation patterns\n- Publish a concise reading list\n",
    },
    ...(await Promise.all(
      illustrations.map(async ({ slug, name }) => ({
        key: `demo/${slug}.svg`,
        name: `${name}.svg`,
        type: "image/svg+xml",
        body: await readFile(`scripts/fixtures/demo/${slug}.svg`, "utf8"),
      })),
    )),
  ];
  const mediaUploads = new Map<string, { bytes: Buffer; uploadId: number }>();
  for (const [index, file] of media.entries()) {
    const bytes = Buffer.from(file.body);
    const uploadId = 1001 + index;
    await uploadBufferToR2(file.key, bytes, file.type);
    await executeD1(
      "INSERT INTO uploads(id,user_id,key,file_name,file_type,file_size,public_url,created_at) VALUES(?,?,?,?,?,?,?,?)",
      [uploadId, user, file.key, file.name, file.type, bytes.length, mediaUrl(file.key), time],
    );
    mediaUploads.set(file.key, { bytes, uploadId });
  }
  const cover = mediaUrl("demo/field-notes.svg");
  const links: CatalogLink[] = [
    [
      "field-notes",
      "https://example.com/field-notes",
      "A quieter web",
      "Notes on making useful, calm software.",
      "demo-research",
      0,
      null,
      "demo/field-notes.svg",
    ],
    [
      "reading-room",
      "https://example.com/reading-room",
      "The reading room",
      "A small collection of essays, with space to think.",
      "demo-library",
      0,
      null,
      "demo/tide-atlas.svg",
    ],
    [
      "private-draft",
      "https://example.com/draft",
      "Unpublished field report",
      "Hidden from public collections.",
      "demo-research",
      1,
      null,
    ],
    [
      "spring-archive",
      "https://example.com/spring",
      "Spring archive",
      "An expired short link for the not-found journey.",
      null,
      0,
      time - day,
    ],
    [
      "field-post",
      "https://x.com/fieldnotes_demo/status/2100000000000000002",
      "A morning at the shoreline",
      "Synthetic archived post with an owned illustration.",
      "demo-research",
      0,
      null,
    ],
    [
      "field-code",
      "https://github.com/fieldnotes-demo/notebook",
      "Notebook — a small research toolkit",
      "Synthetic repository capture and README.",
      "demo-library",
      0,
      null,
    ],
    [
      "capture-pending",
      "https://x.com/fieldnotes_demo/status/2100000000000000003",
      "Waiting for capture",
      "Pending connector work.",
      null,
      0,
      null,
    ],
    [
      "capture-failed",
      "https://x.com/fieldnotes_demo/status/2100000000000000004",
      "Capture needs attention",
      "Provider unavailable; retry is available.",
      null,
      0,
      null,
    ],
    [
      "marker-study",
      "https://example.com/atlas/markers",
      "灯塔与海岸标记：一组纵向版式参考",
      "Portrait field guide for reading coastal markers across different weather and light.",
      "demo-atlas",
      0,
      null,
      "demo/marker-study.svg",
      "横竖图混排时，缩略图用同一取景规则；原图保留完整比例。",
    ],
    [
      "tidal-index",
      "https://example.com/atlas/index",
      "Tidal index",
      "A one-line reference.",
      "demo-atlas",
      0,
      null,
      "demo/tidal-index.svg",
    ],
    [
      "coast-transect",
      "https://example.com/atlas/transect",
      "Coast transect: a panoramic field map and a very long title for a narrow card",
      "A panoramic survey from the north breakwater to the tidal flats, comparing six observation points and documenting how the shoreline changes between survey windows. Use these notes as a guide to prepare the next trip, not as navigational advice.",
      "demo-atlas",
      0,
      null,
      "demo/coast-transect.svg",
    ],
    ["plain-address", "https://example.com/plain-address", null, null, null, 0, null],
    [
      "reference-window",
      "https://example.com/library/reference-window",
      "Temporary reference window",
      "A time-limited reference without a saved screenshot.",
      "demo-library",
      0,
      time + 365 * day,
    ],
    [
      "atlas-gallery",
      "https://x.com/fieldnotes_demo/status/2100000000000000005",
      "Four walks, four frames",
      "A gallery with landscape, portrait, square and panoramic artwork.",
      "demo-atlas",
      0,
      null,
    ],
    [
      "field-reminder",
      "https://x.com/fieldnotes_demo/status/2100000000000000006",
      "A reminder before the walk",
      "Text-only post.",
      null,
      0,
      null,
    ],
    [
      "atlas-essay",
      "https://x.com/fieldnotes_demo/status/2100000000000000007",
      "What a map leaves out",
      "A saved article with an expanded source link.",
      "demo-atlas",
      0,
      null,
    ],
    [
      "atlas-toolkit",
      "https://github.com/fieldnotes-demo/atlas-toolkit",
      "Atlas Toolkit",
      "Reference tools for cartography.",
      "demo-atlas",
      0,
      null,
    ],
    [
      "archive-palette",
      "https://github.com/fieldnotes-demo/archive-palette",
      "Archive Palette",
      null,
      "demo-library",
      0,
      null,
    ],
    [
      "field-handbook",
      "https://github.com/fieldnotes-demo/field-handbook",
      "Field Handbook",
      "Waiting for repository metadata.",
      null,
      0,
      null,
    ],
  ];
  const linkIndex = new Map<string, { id: number; url: string }>();
  for (const [index, row] of links.entries()) {
    const [slug, url, title, description, folder, hidden, expires, screenshot, note] = row;
    const id = 1001 + index;
    await executeD1(
      "INSERT INTO links(id,user_id,slug,original_url,title,meta_title,meta_description,meta_favicon,screenshot_url,folder_id,is_hidden,expires_at,created_at,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        user,
        slug,
        url,
        title,
        title,
        description,
        title ? cover : null,
        screenshot ? mediaUrl(screenshot) : null,
        folder,
        hidden,
        expires,
        index < 8 ? time - index * day : time + (index - 7) * 3_600_000,
        note ?? null,
      ],
    );
    linkIndex.set(slug, { id, url });
    if (slug !== "plain-address") {
      for (const tag of folder === "demo-atlas"
        ? ["demo-visual", "demo-field", "demo-design"]
        : [index % 2 ? "demo-reading" : "demo-field"])
        await executeD1("INSERT INTO link_tags(link_id,tag_id) VALUES(?,?)", [id, tag]);
    }
  }
  const savedLink = (slug: string) => {
    const link = linkIndex.get(slug);
    if (!link) throw new Error(`Unknown fixture link: ${slug}`);
    return link;
  };
  await executeD1(
    "INSERT INTO links(user_id,slug,original_url,title,created_at) VALUES(?,?,?,?,?)",
    [
      "fixture-other-owner",
      "other-owner-link",
      "https://example.com/other",
      "Another owner's private record",
      time,
    ],
  );
  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    for (let hit = 0; hit < daysAgo + 2; hit++)
      await executeD1(
        "INSERT INTO analytics(link_id,country,city,device,browser,os,referer,source,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          1001 + (hit % 2),
          hit % 2 ? "JP" : "US",
          hit % 2 ? "Kyoto" : "Portland",
          hit % 2 ? "mobile" : "desktop",
          hit % 2 ? "Safari" : "Chrome",
          hit % 2 ? "iOS" : "macOS",
          "https://example.com/journal",
          "origin",
          time - daysAgo * day + hit * 900_000,
        ],
      );
  }
  await executeD1(
    "UPDATE links SET clicks=(SELECT count(*) FROM analytics WHERE link_id=links.id) WHERE user_id=?",
    [user],
  );
  for (const [id, title, content, ...tags] of [
    [
      1001,
      "A weekly reading ritual",
      `# A weekly reading ritual\n\n![Field notes](${cover})\n\nKeep a short reading list, write one observation, and share one useful link.\n\n- [x] Gather references\n- [ ] Write the next field note`,
      "demo-design",
    ],
    [
      1002,
      "Small, useful tools",
      "## Working notes\n\nA tool should have a clear purpose, careful defaults, and an easy way out.\n\n| Question | Decision |\n| --- | --- |\n| Where is data stored? | Locally for demonstrations |\n| Who can edit? | The signed-in owner |",
      "demo-design",
    ],
    [1003, null, "Look for a quieter path around the harbor."],
    [1004, "One sentence", "Leave room in the atlas for what is still unknown."],
    [
      1005,
      "把海岸笔记整理成可检索的图文目录",
      `## 图文目录\n\n![Marker study](${mediaUrl("demo/marker-study.svg")})\n\n从长标题、竖图和短备注开始，看看窄屏是否仍能快速扫读。\n\n![Coast transect](${mediaUrl("demo/coast-transect.svg")})`,
      "demo-visual",
      "demo-field",
      "demo-follow-up",
    ],
    [
      1006,
      "Notes on a very long walk along the north shore, recorded in order of observation",
      "Start by recording the time, the weather and the direction of the walk. Note changes to the path one observation at a time, then list open questions separately from confident conclusions.\n\n> The field notes are evidence, not the finished story.",
    ],
  ] as const) {
    await executeD1(
      "INSERT INTO ideas(id,user_id,title,content,excerpt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      [id, user, title, content, generateExcerpt(content, 200), time, time],
    );
    for (const tag of tags)
      await executeD1("INSERT INTO idea_tags(idea_id,tag_id) VALUES(?,?)", [id, tag]);
  }
  for (const [id, parent, position, title, done, due, emoji] of [
    [1001, null, 0, "Prepare the autumn field guide", 0, time + 86_400_000 * 3, "🍂"],
    [1002, 1001, 0, "Select the cover illustration", 1, null, "🎨"],
    [1003, 1001, 1, "Review accessibility notes", 0, time - 86_400_000, "🔎"],
    [1004, null, 1, "Share this week's reading list", 0, time + 86_400_000, "📚"],
    [1005, null, 2, "Collect trail names without a deadline", 0, null, "🧭"],
    [1006, 1002, 0, "Check the portrait and panorama crops", 1, null, "📐"],
    [1007, 1001, 2, "Ask for a second reading of the route notes", 0, time + 6 * day, "💬"],
  ]) {
    await executeD1(
      "INSERT INTO todos(id,user_id,parent_id,position,title,content,excerpt,done,done_at,due_at,emoji,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        user,
        parent,
        position,
        title,
        "Synthetic task notes. Ready to edit.",
        "Synthetic task notes.",
        done,
        done ? time : null,
        due,
        emoji,
        time,
        time,
      ],
    );
    await executeD1("INSERT INTO todo_tags(todo_id,name,created_at) VALUES(?,?,?)", [
      id,
      done ? "complete" : "field-guide",
      time,
    ]);
  }
  const firstPhoto = {
    id: "demo-photo",
    key: "demo/field-notes.svg",
    width: 1200,
    height: 720,
  };
  const posts = [
    {
      slug: "field-post",
      text: "A morning at the shoreline. The best research tool is a notebook and enough time to notice what changed.",
      photos: [firstPhoto],
      urls: [],
    },
    {
      slug: "atlas-gallery",
      text: "Four walks, four frames. The same coast looks different in a map, a portrait, a square plate and a panorama.",
      photos: illustrations.map(({ slug, width, height }) => ({
        id: `demo-photo-${slug}`,
        key: `demo/${slug}.svg`,
        width,
        height,
      })),
      urls: [],
    },
    {
      slug: "field-reminder",
      text: "Bring a pencil; leave the checklist short.",
      photos: [],
      urls: [],
    },
    {
      slug: "atlas-essay",
      text: "What a map leaves out\n\nThe view from the waterline never quite matches the map. A day's tide moves the boundary; a year's foot traffic changes where a trail begins. Those uncertainties belong in the notes, rather than hidden under a cleaner line.\n\nThese observations come from four walks between the breakwater and the north beacon. Start with the map for orientation, then use the route notes to decide where to look more closely. The route is not a recommendation: access, weather and light change between visits.\n\nThe atlas keeps the original sketches next to their revised captions, so readers can see which observations proved useful and which questions remain open.",
      photos: [],
      urls: ["https://example.com/atlas/essay"],
    },
  ];
  for (const { slug, text, photos, urls } of posts) {
    const link = savedLink(slug);
    const postId = link.url.split("/").at(-1);
    const tweet = {
      id: postId,
      text,
      url: link.url,
      created_at: CATALOG_ANCHOR,
      lang: "en",
      author: {
        id: "demo-author",
        username: "fieldnotes_demo",
        name: "Alex River",
        profile_image_url: cover,
        followers_count: 128,
        is_verified: false,
      },
      metrics: {
        retweet_count: 4,
        like_count: 32,
        reply_count: 3,
        quote_count: 1,
        view_count: 450,
        bookmark_count: 12,
      },
      entities: { hashtags: ["fieldnotes"], mentioned_users: [], urls },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      media: photos.map(({ id, key, width, height }) => ({
        id,
        type: "PHOTO",
        url: mediaUrl(key),
        width,
        height,
      })),
    };
    await executeD1(
      "INSERT INTO x_bookmarks(link_id,user_id,source_url,post_id,state,result_json,updated_at) VALUES(?,?,?,?,'complete',?,?)",
      [link.id, user, link.url, postId, JSON.stringify({ tweet, media: [] }), time],
    );
    for (const { id, key } of photos) {
      const upload = mediaUploads.get(key);
      if (!upload) throw new Error(`Unknown fixture photo: ${key}`);
      await executeD1(
        "INSERT INTO x_media(id,link_id,user_id,media_id,kind,r2_key,mime,size,sha256,lease_token,state,upload_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          link.id,
          user,
          id,
          "photo",
          key,
          "image/svg+xml",
          upload.bytes.length,
          createHash("sha256").update(upload.bytes).digest("hex"),
          "fixture-capture",
          "published",
          upload.uploadId,
          time,
        ],
      );
    }
  }
  for (const [slug, state, error] of [
    ["capture-pending", "pending", null],
    ["capture-failed", "failed", "post_unavailable"],
  ] as const) {
    const link = savedLink(slug);
    await executeD1(
      "INSERT INTO x_bookmarks(link_id,user_id,source_url,state,error_code,updated_at) VALUES(?,?,?,?,?,?)",
      [link.id, user, link.url, state, error, time],
    );
  }
  await executeD1(
    "INSERT INTO user_settings(user_id,ai_provider,ai_api_key,ai_model,xray_api_url,xray_api_token) VALUES(?,?,?,?,?,?)",
    [
      user,
      "aihubmix",
      "fixture-key",
      "fixture-default",
      "https://xray.example.invalid",
      "fixture-key",
    ],
  );
  const repository = {
    sourceFullName: "fieldnotes-demo/notebook",
    fullName: "fieldnotes-demo/notebook",
    description: "A synthetic research toolkit for the small web.",
    stars: 128,
    forks: 12,
    commits: 48,
    language: "TypeScript",
    defaultBranch: "main",
    pushedAt: CATALOG_ANCHOR,
    archived: false,
    license: "MIT",
    topics: ["notes", "local-first"],
    readme:
      "# Notebook\n\nA small research toolkit.\n\n## Principles\n\n- Keep useful references\n- Make ownership clear\n- Export your work\n",
    readmePath: "README.md",
  };
  for (const { slug, data } of [
    { slug: "field-code", data: repository },
    {
      slug: "atlas-toolkit",
      data: {
        ...repository,
        description:
          "Small map-making tools for turning a notebook into a navigable atlas. Includes offline indexes, accessible color palettes, and reproducible export recipes for source data and artwork.",
        stars: 1240,
        forks: 89,
        commits: 432,
        language: "Rust",
        license: "Apache-2.0",
        topics: ["cartography", "local-first", "visualization", "accessibility", "offline"],
        readme: `# Atlas Toolkit\n\n![Tide atlas](${mediaUrl("demo/tide-atlas.svg")})\n\nBuild a small, reproducible atlas from field notes.`,
      },
    },
    {
      slug: "archive-palette",
      data: {
        ...repository,
        description: null,
        stars: 0,
        forks: 0,
        commits: 4,
        language: null,
        archived: true,
        license: "NOASSERTION",
        topics: [],
        readme: null,
      },
    },
    { slug: "field-handbook", data: null },
  ]) {
    const link = savedLink(slug);
    const fullName = new URL(link.url).pathname.slice(1);
    await executeD1(
      "INSERT INTO github_bookmarks(link_id,user_id,source_url,full_name,state,result_json,captured_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        link.id,
        user,
        link.url,
        fullName,
        data ? "complete" : "pending",
        data ? JSON.stringify({ ...data, fullName, sourceFullName: fullName }) : null,
        data ? time : null,
        time,
      ],
    );
  }
  for (const [id, scopes, revoked] of [
    ["reader", "links:read", null],
    ["revoked", "links:read,links:write", time],
  ]) {
    const token = `zhe_fixture_${id}_never_production`;
    await executeD1(
      "INSERT INTO api_keys(id,prefix,key_hash,user_id,name,scopes,created_at,revoked_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        `demo-${id}`,
        token.slice(0, 12),
        createHash("sha256").update(token).digest("hex"),
        user,
        `${id} fixture key`,
        scopes,
        time / 1000,
        revoked ? Number(revoked) / 1000 : null,
      ],
    );
  }
  await executeD1("INSERT INTO webhooks(user_id,token,rate_limit,created_at) VALUES(?,?,?,?)", [
    user,
    "wh_demo_local_only",
    5,
    time,
  ]);
}
