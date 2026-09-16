"use client";

import { Badge, Button, LayerCard } from "@nocoo/basalt";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadConnectorSummary } from "@/actions/connector";

const labels: Record<string, string> = {
  pending: "等待补全",
  running: "正在补全",
  complete: "已补全",
  partial: "媒体待补全",
  failed: "待重试",
  unavailable: "不可访问",
};

export function ConnectorPanel() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof loadConnectorSummary>> | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadConnectorSummary();
      if (mounted.current) {
        setSummary(data);
        setError(false);
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  return (
    <LayerCard padding="none">
      <LayerCard.Header className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">本机 Connector</h2>
        <Button
          size="icon"
          variant="ghost"
          onClick={refresh}
          disabled={loading}
          aria-label="刷新 Connector 状态"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </LayerCard.Header>
      <LayerCard.Body className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          照常通过网页、Webhook 或 CLI 保存 X 和 GitHub 链接。Connector 使用本机 X
          登录补全文本和媒体，并采集 GitHub 仓库的 stars、commit 数和 README 全文；书签会自动更新。
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          与 Zhe CLI 共用安装和登录。为 CLI 密钥选择 <code>links:read</code> 和{" "}
          <code>connector:write</code>。API Key 默认永久有效，也可选择 30、7、3、1
          天，可在此页面随时撤销。
        </p>
        <LayerCard.Well>
          <pre className="overflow-x-auto text-xs leading-7">
            <code>{"npm install -g @nocoo/zhe\nzhe login\nzhe connector start"}</code>
          </pre>
        </LayerCard.Well>
        <p className="text-xs leading-6 text-muted-foreground">
          X 采集需要 OpenCLI 浏览器扩展、X 登录和 FFmpeg；OpenCLI 随包安装。 GitHub
          公开仓库无需登录，也可复用本机 <code>gh auth login</code>，提高限额或读取有权限的仓库。
          macOS 可后台运行；其他系统使用 <code>zhe connector watch</code>。使用{" "}
          <code>zhe connector stop</code> 停止后台任务。
        </p>
        <div className="flex flex-wrap items-center gap-2" role="status">
          {error ? (
            <span className="text-sm text-muted-foreground">状态暂时无法读取</span>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {summary?.lastSeenAt
                  ? `最近连接：${new Date(summary.lastSeenAt).toLocaleString("zh-CN")}`
                  : "尚未连接"}
              </span>
              {summary?.states.map(({ state, count }) => (
                <Badge key={state} variant="secondary">
                  {labels[state] ?? state} {count}
                </Badge>
              ))}
            </>
          )}
        </div>
      </LayerCard.Body>
    </LayerCard>
  );
}
