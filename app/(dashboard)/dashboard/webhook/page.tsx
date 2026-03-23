import { WebhookPage } from '@/components/dashboard/webhook-page';
import { getWebhookToken } from '@/actions/webhook';

export default async function WebhookRoute() {
  const result = await getWebhookToken();
  const props = result.success && result.data
    ? { initialData: { token: result.data.token, createdAt: String(result.data.createdAt), rateLimit: result.data.rateLimit } }
    : {};
  return <WebhookPage {...props} />;
}
