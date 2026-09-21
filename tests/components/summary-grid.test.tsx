// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryGrid } from "@/components/dashboard/storage-page-parts/summary-grid";
import type { StorageFile, StorageScanResult } from "@/models/storage";

function StubCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  variant?: "default" | "warning" | "success";
  index?: number;
}) {
  return <p>{`${label}=${value}=${sub}${variant ? `=${variant}` : ""}`}</p>;
}

function makeFile(key: string, size: number): StorageFile {
  return {
    key,
    size,
    lastModified: "2026-09-01T00:00:00.000Z",
    isReferenced: true,
    publicUrl: `https://example.com/${key}`,
  };
}

function makeScan({
  connected = true,
  orphanFiles = 0,
  orphanSize = 0,
  files = [],
}: {
  connected?: boolean;
  orphanFiles?: number;
  orphanSize?: number;
  files?: StorageFile[];
} = {}): StorageScanResult {
  return {
    d1: {
      connected,
      totalLinks: 3,
      totalUploads: 2,
      totalAnalytics: 5,
      tables: [{ name: "links", rows: 3 }],
    },
    r2: {
      connected: true,
      summary: { totalFiles: 4, totalSize: 4096, orphanFiles, orphanSize },
      files,
    },
  };
}

describe("SummaryGrid", () => {
  it("reports a healthy scan with success accent and no reclaimable storage", () => {
    render(
      <SummaryGrid
        data={makeScan({ files: [makeFile("2026/a.png", 4096)] })}
        SummaryCard={StubCard}
      />,
    );
    expect(screen.getByText("R2 总存储=4.0 KB=4 个文件")).toBeInTheDocument();
    expect(screen.getByText("D1 数据库=已连接=3 链接 · 2 上传")).toBeInTheDocument();
    expect(screen.getByText("孤儿文件=0=全部干净=success")).toBeInTheDocument();
    expect(screen.getByText("临时文件=0=无临时文件")).toBeInTheDocument();
  });

  it("surfaces disconnected D1, reclaimable orphans and pending tmp files", () => {
    render(
      <SummaryGrid
        data={makeScan({
          connected: false,
          orphanFiles: 2,
          orphanSize: 2048,
          files: [makeFile("tmp/0b6f9c2e-1111-2222-3333-444444444444_1770000000000.png", 512)],
        })}
        SummaryCard={StubCard}
      />,
    );
    expect(screen.getByText("D1 数据库=未连接=3 链接 · 2 上传")).toBeInTheDocument();
    expect(screen.getByText("孤儿文件=2=2.0 KB 可回收=warning")).toBeInTheDocument();
    expect(screen.getByText("临时文件=1=512 B · 1h 后自动清理")).toBeInTheDocument();
  });
});
