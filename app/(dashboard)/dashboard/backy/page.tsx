import { BackyPage } from '@/components/dashboard/backy-page';
import { getBackyConfig, fetchBackyHistory, getBackyPullWebhook } from '@/actions/backy';
import type { BackyInitialData } from '@/viewmodels/useBackyViewModel';

export default async function BackyRoute() {
  const [configResult, pullResult] = await Promise.all([
    getBackyConfig(),
    getBackyPullWebhook(),
  ]);

  const initialData: BackyInitialData = {
    pullWebhook: pullResult.success && pullResult.data ? pullResult.data : undefined,
  };

  if (configResult.success && configResult.data) {
    initialData.webhookUrl = configResult.data.webhookUrl;
    initialData.maskedApiKey = configResult.data.maskedApiKey;

    // Push config exists — also prefetch history
    const historyResult = await fetchBackyHistory();
    if (historyResult.success && historyResult.data) {
      initialData.history = historyResult.data;
    }
  }

  return <BackyPage initialData={initialData} />;
}
