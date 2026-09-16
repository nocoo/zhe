"use client";

import { toast } from "@nocoo/basalt/components/toast";
import { Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GitHubAnalysis } from "@/models/ai-github-analysis";

export function GitHubAnalysisButton({
  linkId,
  name,
  analysis,
  hasReadme,
  onSaved,
}: {
  linkId: number;
  name: string;
  analysis?: GitHubAnalysis | null;
  hasReadme: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<GitHubAnalysis | null>(null);
  const [error, setError] = useState("");
  const [needsConfig, setNeedsConfig] = useState(false);
  const result = generated ?? analysis;

  const analyze = async () => {
    setBusy(true);
    setError("");
    setNeedsConfig(false);
    try {
      const response = await fetch("/api/ai/analyze-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId }),
      });
      const data = await response.json();
      if (!response.ok || !data.analysis) {
        setNeedsConfig(data.reason === "no_ai_config");
        setError(data.error || "AI 分析失败，请重试");
        return;
      }
      setGenerated(data.analysis);
      onSaved();
      toast.success("AI 分析已保存");
    } catch {
      setError("暂时无法连接，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={result ? "secondary" : "outline"}
        size="sm"
        disabled={!hasReadme && !result}
        title={hasReadme ? "根据 README 全文提取并总结" : "等待 README 全文采集完成"}
        onClick={() => {
          setOpen(true);
          if (!result && !busy) void analyze();
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? "分析中" : result ? "AI 详情" : "AI 分析"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="max-h-[90dvh] overflow-hidden">
          <div className="flex items-start gap-3">
            <DialogHeader className="min-w-0 flex-1">
              <DialogTitle className="break-all">{name}</DialogTitle>
              <DialogDescription>AI 仓库分析 · 基于已采集的 README 全文</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="关闭 AI 分析">
                <X />
              </Button>
            </DialogClose>
          </div>
          <div className="min-h-0 space-y-5 overflow-y-auto">
            {busy && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                正在阅读 README 并提取字段…
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {needsConfig && (
              <Button variant="outline" size="default" asChild>
                <Link href="/dashboard/settings/ai">前往 AI 设置</Link>
              </Button>
            )}
            {result && (
              <>
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">中文简介</h3>
                  <p className="text-sm leading-6">{result.summary}</p>
                </section>
                {(
                  [
                    ["核心功能", result.features],
                    ["适用场景", result.useCases],
                    ["技术栈", result.techStack],
                    ["主题标签", result.tags],
                  ] as const
                ).map(([label, items]) => (
                  <section key={label} className="space-y-2">
                    <h3 className="text-sm font-medium">{label}</h3>
                    {items.length ? (
                      label === "技术栈" || label === "主题标签" ? (
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((item) => (
                            <Badge
                              key={item}
                              variant="outline"
                              className="max-w-full whitespace-normal break-words"
                            >
                              {item}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
                          {items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground">README 未说明</p>
                    )}
                  </section>
                ))}
                <p className="text-xs text-muted-foreground">
                  {result.model} · {new Date(result.generatedAt).toLocaleString()}
                </p>
              </>
            )}
          </div>
          <div className="flex justify-end border-t border-border/60 pt-3">
            <Button size="default" disabled={busy || !hasReadme} onClick={analyze}>
              <Sparkles />
              {result ? "重新分析" : "重试分析"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
