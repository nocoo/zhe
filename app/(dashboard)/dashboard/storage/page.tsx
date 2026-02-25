import { StoragePage } from '@/components/dashboard/storage-page';
import { scanStorage } from '@/actions/storage';

export default async function StorageRoute() {
  const result = await scanStorage();
  const initialData = result.success ? result.data : undefined;
  return <StoragePage initialData={initialData} />;
}
