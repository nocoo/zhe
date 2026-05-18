"use client";

import { useBackyViewModel, type BackyInitialData } from "@/viewmodels/useBackyViewModel";
import { PushSection } from "./backy-page-parts/push-section";
import { PullSection } from "./backy-page-parts/pull-section";

export function BackyPage({ initialData }: { initialData?: BackyInitialData }) {
  const vm = useBackyViewModel(initialData);

  return (
    <div className="space-y-6">
      <PushSection vm={vm} />
      <PullSection vm={vm} />
    </div>
  );
}
