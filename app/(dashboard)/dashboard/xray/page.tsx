import { XrayPage } from '@/components/dashboard/xray-page';
import { getXrayConfig } from '@/actions/xray';

export default async function XrayRoute() {
  const result = await getXrayConfig();
  const initialData = result.success && result.data ? result.data : undefined;
  return <XrayPage initialData={initialData} />;
}
