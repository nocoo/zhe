import { XrayPage } from '@/components/dashboard/xray-page';
import { getXrayConfig } from '@/actions/xray';

export default async function XrayRoute() {
  const result = await getXrayConfig();
  return <XrayPage {...(result.success && result.data ? { initialData: result.data } : {})} />;
}
