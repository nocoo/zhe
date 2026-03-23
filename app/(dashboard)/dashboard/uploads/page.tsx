import { UploadList } from '@/components/dashboard/upload-list';
import { getUploads } from '@/actions/upload';

export default async function UploadsPage() {
  const result = await getUploads();
  return <UploadList {...(result.success && result.data ? { initialUploads: result.data } : {})} />;
}
