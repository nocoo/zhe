"use client";

import { type BackyInitialData, useBackyViewModel } from "@/viewmodels/useBackyViewModel";
import { PullSection } from "./backy-page-parts/pull-section";
import { PushSection } from "./backy-page-parts/push-section";

export function BackyPage({ initialData }: { initialData?: BackyInitialData }) {
  const vm = useBackyViewModel(initialData);

  return (
    <div className="space-y-6">
      <PushSection vm={vm} />
      <PullSection vm={vm} />
    </div>
  );
}
