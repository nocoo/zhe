import { getUploads } from "@/actions/upload-read";
import { UploadList } from "@/components/dashboard/upload-list";

export default async function UploadsPage() {
  const result = await getUploads();
  return <UploadList {...(result.success && result.data ? { initialUploads: result.data } : {})} />;
}
