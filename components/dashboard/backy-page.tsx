"use client";

import { CloudUpload } from "@nocoo/basalt/icons";
import { type BackyInitialData, useBackyViewModel } from "@/viewmodels/useBackyViewModel";
import { PullSection } from "./backy-page-parts/pull-section";
import { PushSection } from "./backy-page-parts/push-section";
import { DashboardPageHeader } from "./page-header";

export function BackyPage({ initialData }: { initialData?: BackyInitialData }) {
  const vm = useBackyViewModel(initialData);

  return (
    <div className="space-y-basalt-layout">
      <DashboardPageHeader icon={CloudUpload} title="Backy" description="远程备份推送与拉取" />
      <PushSection vm={vm} />
      <PullSection vm={vm} />
    </div>
  );
}
