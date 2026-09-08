"use client";

import { PageHeader } from "@nocoo/basalt/components/page-header";
import { type BackyInitialData, useBackyViewModel } from "@/viewmodels/useBackyViewModel";
import { PullSection } from "./backy-page-parts/pull-section";
import { PushSection } from "./backy-page-parts/push-section";

export function BackyPage({ initialData }: { initialData?: BackyInitialData }) {
  const vm = useBackyViewModel(initialData);

  return (
    <div className="space-y-6">
      <PageHeader title="Backy" description="将数据推送到远程备份，或从远程拉取。" />
      <PushSection vm={vm} />
      <PullSection vm={vm} />
    </div>
  );
}
