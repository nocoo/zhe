"use client";

import { useXrayViewModel, type XrayInitialData } from "@/viewmodels/useXrayViewModel";
import { BookmarksSection } from "./xray-page-parts/bookmarks-section";
import { ConfigSection } from "./xray-page-parts/config-section";
import { TestSection } from "./xray-page-parts/test-section";

export function XrayPage({ initialData }: { initialData?: XrayInitialData }) {
  const vm = useXrayViewModel(initialData);

  return (
    <div className="space-y-6">
      {/* ── API 配置 + 接口测试（并排） ──────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ConfigSection vm={vm} />
        <TestSection vm={vm} />
      </div>

      {/* ── 我的书签 ─────────────────────────────────────────── */}
      <BookmarksSection vm={vm} />
    </div>
  );
}
