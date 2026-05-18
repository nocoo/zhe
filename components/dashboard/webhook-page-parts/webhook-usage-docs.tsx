"use client";

import { buildOpenApiSpec, buildAgentPrompt } from "@/models/webhook";
import {
  AgentPromptSection,
  BehaviorNotes,
  CurlExamples,
  ErrorCodesTable,
  MethodsTable,
  PostParamsTable,
  PostResponseFormat,
  RateLimitNote,
} from "./usage-docs-sections";

type PostProperty = {
  type: string;
  description?: string;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  format?: string;
};

export function WebhookUsageDocs({
  webhookUrl,
  tmpUploadUrl,
  rateLimit,
  copyToClipboard,
}: {
  webhookUrl: string;
  tmpUploadUrl: string | null;
  rateLimit: number;
  copyToClipboard: (text: string) => void | Promise<void>;
}) {
  const spec = buildOpenApiSpec(webhookUrl, rateLimit);
  const postOp = spec.paths["/"].post;
  const postSchema = postOp.requestBody.content["application/json"].schema;
  const properties = postSchema.properties as Record<string, PostProperty>;
  const required = (postSchema.required as string[]) ?? [];
  const agentPrompt = buildAgentPrompt(
    webhookUrl,
    rateLimit,
    tmpUploadUrl ?? undefined,
  );

  return (
    <div
      className="space-y-4 border-t border-border/50 pt-4"
      data-testid="webhook-usage-docs"
    >
      <p className="text-xs font-medium text-foreground">使用说明</p>

      <MethodsTable spec={spec} />
      <CurlExamples webhookUrl={webhookUrl} tmpUploadUrl={tmpUploadUrl} />
      <PostParamsTable properties={properties} required={required} />
      <PostResponseFormat />
      <RateLimitNote rateLimit={rateLimit} />
      <BehaviorNotes />
      <ErrorCodesTable
        responses={postOp.responses as Record<string, { description: string }>}
      />

      <AgentPromptSection
        agentPrompt={agentPrompt}
        copyToClipboard={copyToClipboard}
      />
    </div>
  );
}
