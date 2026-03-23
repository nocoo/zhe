import { StoragePage } from '@/components/dashboard/storage-page';
import { scanStorage } from '@/actions/storage';

export default async function StorageRoute() {
  const result = await scanStorage();
  return <StoragePage {...(result.success && result.data ? { initialData: result.data } : {})} />;
}
