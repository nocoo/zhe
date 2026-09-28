import { createHash } from "node:crypto";
import { uploadBufferToR2 } from "../lib/r2/local-binding";
import { executeD1, queryD1 } from "../tests/playwright/helpers/d1";

export const CATALOG_VERSION = 3;
export const CATALOG_ANCHOR = "2026-09-27T00:00:00Z";
export const FIXTURE_USER = { id: "e2e-test-user-id", name: "Alex River", email: "e2e@test.local" };
const time = Date.parse(CATALOG_ANCHOR);
const user = FIXTURE_USER.id;

export async function seedCatalog(): Promise<void> {
  const marker = await queryD1<{ value: string }>(
    "SELECT value FROM _test_marker WHERE key = 'env'",
  );
  if (marker[0]?.value !== "test") throw new Error("Owned local database required");
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
    ["reading", "Read next", "blue"],
    ["design", "Design systems", "purple"],
    ["field", "Field research", "green"],
  ]) {
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
  ];
  for (const [index, file] of media.entries()) {
    const bytes = Buffer.from(file.body);
    await uploadBufferToR2(file.key, bytes, file.type);
    await executeD1(
      "INSERT INTO uploads(id,user_id,key,file_name,file_type,file_size,public_url,created_at) VALUES(?,?,?,?,?,?,?,?)",
      [
        1001 + index,
        user,
        file.key,
        file.name,
        file.type,
        bytes.length,
        `${process.env.R2_PUBLIC_DOMAIN}/${file.key}`,
        time,
      ],
    );
  }
  const cover = `${process.env.R2_PUBLIC_DOMAIN}/demo/field-notes.svg`;
  const links = [
    [
      "field-notes",
      "https://example.com/field-notes",
      "A quieter web",
      "Notes on making useful, calm software.",
      "demo-research",
      0,
      null,
    ],
    [
      "reading-room",
      "https://example.com/reading-room",
      "The reading room",
      "A small collection of essays, with space to think.",
      "demo-library",
      0,
      null,
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
      time - 86_400_000,
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
  ];
  for (const [i, row] of links.entries()) {
    const [slug, url, title, description, folder, hidden, expires] = row;
    await executeD1(
      "INSERT INTO links(id,user_id,slug,original_url,title,meta_title,meta_description,meta_favicon,screenshot_url,folder_id,is_hidden,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        1001 + i,
        user,
        slug,
        url,
        title,
        title,
        description,
        cover,
        i < 2 ? cover : null,
        folder,
        hidden,
        expires,
        time - i * 86_400_000,
      ],
    );
    await executeD1("INSERT INTO link_tags(link_id,tag_id) VALUES(?,?)", [
      1001 + i,
      i % 2 ? "demo-reading" : "demo-field",
    ]);
  }
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
  for (let day = 0; day < 7; day++) {
    for (let hit = 0; hit < day + 2; hit++)
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
          time - day * 86_400_000 + hit * 900_000,
        ],
      );
  }
  await executeD1(
    "UPDATE links SET clicks=(SELECT count(*) FROM analytics WHERE link_id=links.id) WHERE user_id=?",
    [user],
  );
  for (const [id, title, content] of [
    [
      1001,
      "A weekly reading ritual",
      `# A weekly reading ritual\n\n![Field notes](${cover})\n\nKeep a short reading list, write one observation, and share one useful link.\n\n- [x] Gather references\n- [ ] Write the next field note`,
    ],
    [
      1002,
      "Small, useful tools",
      "## Working notes\n\nA tool should have a clear purpose, careful defaults, and an easy way out.\n\n| Question | Decision |\n| --- | --- |\n| Where is data stored? | Locally for demonstrations |\n| Who can edit? | The signed-in owner |",
    ],
  ]) {
    await executeD1(
      "INSERT INTO ideas(id,user_id,title,content,excerpt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      [id, user, title, content, String(content).slice(0, 160), time, time],
    );
    await executeD1("INSERT INTO idea_tags(idea_id,tag_id) VALUES(?,?)", [id, "demo-design"]);
  }
  for (const [id, parent, position, title, done, due, emoji] of [
    [1001, null, 0, "Prepare the autumn field guide", 0, time + 86_400_000 * 3, "🍂"],
    [1002, 1001, 0, "Select the cover illustration", 1, null, "🎨"],
    [1003, 1001, 1, "Review accessibility notes", 0, time - 86_400_000, "🔎"],
    [1004, null, 1, "Share this week's reading list", 0, time + 86_400_000, "📚"],
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
  const post = {
    tweet: {
      id: "2100000000000000002",
      text: "A morning at the shoreline. The best research tool is a notebook and enough time to notice what changed.",
      url: links[4]?.[1],
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
      entities: { hashtags: ["fieldnotes"], mentioned_users: [], urls: [] },
      is_retweet: false,
      is_quote: false,
      is_reply: false,
      media: [{ id: "demo-photo", type: "PHOTO", url: cover, width: 1200, height: 720 }],
    },
    media: [],
  };
  for (const [id, state, result, error] of [
    [1005, "complete", JSON.stringify(post), null],
    [1007, "pending", null, null],
    [1008, "failed", null, "post_unavailable"],
  ]) {
    await executeD1(
      "INSERT INTO x_bookmarks(link_id,user_id,source_url,state,result_json,error_code,updated_at) VALUES(?,?,?,?,?,?,?)",
      [id, user, links[Number(id) - 1001]?.[1], state, result, error, time],
    );
  }
  await executeD1(
    "INSERT INTO x_media(id,link_id,user_id,media_id,kind,r2_key,mime,size,sha256,lease_token,state,upload_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      "demo-photo",
      1005,
      user,
      "demo-photo",
      "photo",
      "demo/field-notes.svg",
      "image/svg+xml",
      Buffer.byteLength(svg),
      createHash("sha256").update(svg).digest("hex"),
      "fixture-capture",
      "published",
      1001,
      time,
    ],
  );
  await executeD1(
    "INSERT INTO user_settings(user_id,ai_provider,ai_api_key,ai_model) VALUES(?,?,?,?)",
    [user, "aihubmix", "fixture-key", "fixture-default"],
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
  await executeD1(
    "INSERT INTO github_bookmarks(link_id,user_id,source_url,full_name,state,result_json,captured_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    [
      1006,
      user,
      links[5]?.[1],
      repository.fullName,
      "complete",
      JSON.stringify(repository),
      time,
      time,
    ],
  );
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
