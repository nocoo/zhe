import { BackyPage } from '@/components/dashboard/backy-page';
import { getBackyConfig, fetchBackyHistory } from '@/actions/backy';

export default async function BackyRoute() {
  const configResult = await getBackyConfig();

  if (!configResult.success || !configResult.data) {
    return <BackyPage />;
  }

  // Config exists — also prefetch history
  const historyResult = await fetchBackyHistory();
  const initialData = {
    webhookUrl: configResult.data.webhookUrl,
    maskedApiKey: configResult.data.maskedApiKey,
    history: historyResult.success && historyResult.data ? historyResult.data : undefined,
  };

  return <BackyPage initialData={initialData} />;
}
