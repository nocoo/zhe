import { UploadList } from '@/components/dashboard/upload-list';
import { getUploads } from '@/actions/upload';

export default async function UploadsPage() {
  const result = await getUploads();
  const initialUploads = result.success ? result.data : undefined;
  return <UploadList initialUploads={initialUploads} />;
}
