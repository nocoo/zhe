import { OverviewPage } from '@/components/dashboard/overview-page';
import { getOverviewStats } from '@/actions/overview';

export default async function OverviewRoute() {
  const result = await getOverviewStats();
  const initialData = result.success ? result.data : undefined;
  return <OverviewPage initialData={initialData} />;
}
