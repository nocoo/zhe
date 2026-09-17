import { Suspense } from "react";
import { SearchPage } from "@/components/search-page";
export default function Page() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6">
          正在加载搜索…
        </p>
      }
    >
      <SearchPage />
    </Suspense>
  );
}
