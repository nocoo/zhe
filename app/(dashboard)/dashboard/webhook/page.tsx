import { WebhookPage } from '@/components/dashboard/webhook-page';
import { getWebhookToken } from '@/actions/webhook';

export default async function WebhookRoute() {
  const result = await getWebhookToken();
  const initialData = result.success && result.data
    ? { token: result.data.token, createdAt: String(result.data.createdAt), rateLimit: result.data.rateLimit }
    : undefined;
  return <WebhookPage initialData={initialData} />;
}
