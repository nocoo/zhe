"use client";

/**
 * Lightweight emoji picker used by the todos feature.
 *
 * Backed by ~180 hand-curated emoji from six categories, each tagged with
 * English + pinyin-ish keywords so `.includes(query)` matches
 * intuitively for the average user. Deliberately NOT an emoji-mart
 * install — the picker sits on a decorative field and 800 KB of Unicode
 * data would swamp the bundle.
 *
 * Trigger renders whatever the caller passes as `children`. When no
 * children are provided, a chip-shaped default button with the current
 * emoji (or `+` placeholder) is rendered.
 */

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TodoEmojiPickerProps {
  /** Currently selected emoji, or null when unset. */
  value: string | null;
  /** Called when a new emoji is picked or the selection is cleared. */
  onChange: (next: string | null) => void;
  /** Optional custom trigger; when omitted a chip button is rendered. */
  children?: React.ReactNode;
  /** aria-label for the default trigger button. */
  triggerLabel?: string;
  /** Additional classes for the default trigger button. */
  className?: string;
}

interface EmojiEntry {
  /** The rendered glyph. */
  char: string;
  /** Free-form search keywords (English words used most often). */
  keywords: readonly string[];
}

interface EmojiGroup {
  label: string;
  entries: readonly EmojiEntry[];
}

// Hand-curated palette. Grouped by everyday usage rather than the full
// Unicode standard so the picker fits in one popover without paging.
const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    label: "常用",
    entries: [
      { char: "📝", keywords: ["note", "memo", "笔记"] },
      { char: "✅", keywords: ["done", "check", "完成"] },
      { char: "🎯", keywords: ["target", "goal", "目标"] },
      { char: "⭐", keywords: ["star", "important", "重要"] },
      { char: "🔥", keywords: ["fire", "hot", "紧急"] },
      { char: "⚡", keywords: ["zap", "quick", "闪电"] },
      { char: "📌", keywords: ["pin", "钉"] },
      { char: "🚀", keywords: ["rocket", "launch", "启动"] },
      { char: "💡", keywords: ["idea", "bulb", "想法"] },
      { char: "🧠", keywords: ["brain", "think", "思考"] },
      { char: "📅", keywords: ["date", "calendar", "日历"] },
      { char: "⏰", keywords: ["alarm", "time", "闹钟"] },
      { char: "🕒", keywords: ["clock", "time", "时间"] },
      { char: "🔖", keywords: ["bookmark", "书签"] },
      { char: "🏁", keywords: ["flag", "finish", "完成"] },
      { char: "🎁", keywords: ["gift", "礼物"] },
    ],
  },
  {
    label: "情绪",
    entries: [
      { char: "😀", keywords: ["smile", "happy", "开心"] },
      { char: "😂", keywords: ["joy", "laugh", "笑"] },
      { char: "😊", keywords: ["smile", "微笑"] },
      { char: "😍", keywords: ["love", "heart eyes", "爱"] },
      { char: "🥳", keywords: ["party", "celebrate", "庆祝"] },
      { char: "😎", keywords: ["cool", "帅"] },
      { char: "🤔", keywords: ["think", "hmm", "思考"] },
      { char: "😴", keywords: ["sleep", "困"] },
      { char: "😭", keywords: ["cry", "哭"] },
      { char: "😤", keywords: ["angry", "生气"] },
      { char: "😱", keywords: ["shock", "惊"] },
      { char: "🤯", keywords: ["mind blown", "崩溃"] },
      { char: "🥲", keywords: ["tear", "smile", "苦笑"] },
      { char: "🫡", keywords: ["salute", "敬礼"] },
      { char: "🤝", keywords: ["handshake", "握手"] },
      { char: "🙏", keywords: ["pray", "thanks", "感谢"] },
    ],
  },
  {
    label: "工作",
    entries: [
      { char: "💼", keywords: ["work", "briefcase", "工作"] },
      { char: "📧", keywords: ["email", "邮件"] },
      { char: "📞", keywords: ["phone", "call", "电话"] },
      { char: "💬", keywords: ["chat", "talk", "消息"] },
      { char: "🗓️", keywords: ["schedule", "日程"] },
      { char: "📊", keywords: ["chart", "data", "图表"] },
      { char: "📈", keywords: ["growth", "up", "增长"] },
      { char: "📉", keywords: ["decline", "下降"] },
      { char: "🧾", keywords: ["receipt", "invoice", "发票"] },
      { char: "💰", keywords: ["money", "cash", "钱"] },
      { char: "💳", keywords: ["card", "pay", "支付"] },
      { char: "🏦", keywords: ["bank", "银行"] },
      { char: "📎", keywords: ["clip", "attach", "附件"] },
      { char: "🗂️", keywords: ["files", "folder", "文件"] },
      { char: "🖨️", keywords: ["printer", "打印"] },
      { char: "🧑‍💻", keywords: ["coder", "developer", "开发"] },
    ],
  },
  {
    label: "生活",
    entries: [
      { char: "🏠", keywords: ["home", "house", "家"] },
      { char: "🛏️", keywords: ["bed", "sleep", "床"] },
      { char: "🛒", keywords: ["cart", "shop", "购物"] },
      { char: "🍳", keywords: ["cook", "egg", "做饭"] },
      { char: "🍜", keywords: ["noodles", "面"] },
      { char: "🍚", keywords: ["rice", "饭"] },
      { char: "🍱", keywords: ["bento", "便当"] },
      { char: "☕", keywords: ["coffee", "咖啡"] },
      { char: "🍵", keywords: ["tea", "茶"] },
      { char: "🍺", keywords: ["beer", "啤酒"] },
      { char: "🎂", keywords: ["cake", "birthday", "蛋糕"] },
      { char: "🧺", keywords: ["laundry", "basket", "洗衣"] },
      { char: "🧹", keywords: ["clean", "broom", "打扫"] },
      { char: "🚗", keywords: ["car", "车"] },
      { char: "🚴", keywords: ["bike", "自行车"] },
      { char: "✈️", keywords: ["plane", "travel", "飞机"] },
    ],
  },
  {
    label: "健康",
    entries: [
      { char: "🏃", keywords: ["run", "exercise", "跑步"] },
      { char: "🏋️", keywords: ["gym", "workout", "健身"] },
      { char: "🧘", keywords: ["meditate", "yoga", "冥想"] },
      { char: "💊", keywords: ["pill", "medicine", "药"] },
      { char: "💉", keywords: ["shot", "vaccine", "针"] },
      { char: "🩺", keywords: ["doctor", "medical", "医生"] },
      { char: "💧", keywords: ["water", "drop", "水"] },
      { char: "🍎", keywords: ["apple", "fruit", "苹果"] },
      { char: "🥗", keywords: ["salad", "沙拉"] },
      { char: "🥩", keywords: ["steak", "meat", "肉"] },
      { char: "🧴", keywords: ["lotion", "洗护"] },
      { char: "🦷", keywords: ["teeth", "dental", "牙齿"] },
    ],
  },
  {
    label: "学习",
    entries: [
      { char: "📚", keywords: ["books", "study", "读书"] },
      { char: "📖", keywords: ["book", "open", "书"] },
      { char: "✏️", keywords: ["pencil", "write", "写"] },
      { char: "🖊️", keywords: ["pen", "笔"] },
      { char: "📐", keywords: ["ruler", "尺"] },
      { char: "🧮", keywords: ["abacus", "算盘"] },
      { char: "🔬", keywords: ["microscope", "science", "科学"] },
      { char: "🧪", keywords: ["test tube", "试管"] },
      { char: "🌍", keywords: ["earth", "world", "地球"] },
      { char: "🗺️", keywords: ["map", "地图"] },
      { char: "🎨", keywords: ["art", "paint", "画"] },
      { char: "🎵", keywords: ["music", "note", "音乐"] },
      { char: "🎧", keywords: ["headphone", "耳机"] },
      { char: "📷", keywords: ["camera", "photo", "拍照"] },
      { char: "🎬", keywords: ["film", "movie", "电影"] },
      { char: "🎮", keywords: ["game", "游戏"] },
    ],
  },
];

const ALL_EMOJIS: readonly EmojiEntry[] = EMOJI_GROUPS.flatMap((g) => g.entries);

/** Match strategy: case-insensitive substring against char OR keywords. */
function filterEntries(query: string): readonly EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_EMOJIS.filter(
    (e) => e.char.includes(q) || e.keywords.some((k) => k.toLowerCase().includes(q)),
  );
}

export function TodoEmojiPicker({
  value,
  onChange,
  children,
  triggerLabel = "选择 emoji",
  className,
}: TodoEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => filterEntries(query), [query]);

  const commit = (next: string | null) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const trigger = children ?? (
    <button
      type="button"
      aria-label={triggerLabel}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-widget border border-border/60 bg-background text-base leading-none transition-colors hover:bg-accent",
        value === null && "text-muted-foreground",
        className,
      )}
    >
      {value ?? "+"}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2"
        data-todo-emoji-picker
        // Prevent the popover-close from bubbling into arborist's tree
        // click handlers, which would otherwise steal selection focus.
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 pb-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索 emoji..."
            className="h-7 text-xs"
            aria-label="搜索 emoji"
          />
          {value !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => commit(null)}
              aria-label="清除 emoji"
            >
              <X className="h-3.5 w-3.5" />
              清除
            </Button>
          )}
        </div>

        <div className="max-h-64 overflow-y-auto">
          {query.trim().length > 0 ? (
            <EmojiGrid entries={matches} onPick={commit} emptyLabel="未找到匹配的 emoji" />
          ) : (
            EMOJI_GROUPS.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                  {group.label}
                </div>
                <EmojiGrid entries={group.entries} onPick={commit} />
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmojiGrid({
  entries,
  onPick,
  emptyLabel,
}: {
  entries: readonly EmojiEntry[];
  onPick: (char: string) => void;
  emptyLabel?: string;
}) {
  if (entries.length === 0) {
    return emptyLabel ? (
      <p className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
    ) : null;
  }
  return (
    <div className="grid grid-cols-8 gap-1">
      {entries.map((e) => (
        <button
          key={e.char}
          type="button"
          onClick={() => onPick(e.char)}
          aria-label={e.keywords[0] ?? e.char}
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-accent"
        >
          {e.char}
        </button>
      ))}
    </div>
  );
}
