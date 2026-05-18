/**
 * OpenAPI 3.1 spec builders for the webhook API. Split out of models/webhook.ts
 * so the model file stays small.
 */

import { WEBHOOK_NOTE_MAX_LENGTH, RATE_LIMIT_DEFAULT_MAX } from "./webhook";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type OpenApiSpec = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** HEAD / — token validation probe. */
function buildHeadOp(): Record<string, unknown> {
  return {
    summary: "Test connection",
    description: "Returns 200 if the token is valid, 404 otherwise. No response body.",
    responses: {
      "200": { description: "Token is valid" },
      "404": { description: "Invalid webhook token" },
    },
  };
}

/** GET / — webhook status + usage stats + OpenAPI docs. */
function buildGetOp(): Record<string, unknown> {
  return {
    summary: "Get status, stats & API schema",
    description: "Retrieve webhook status, usage stats, and this OpenAPI specification.",
    responses: {
      "200": {
        description: "Webhook info with stats and OpenAPI docs",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                status: { type: "string", description: "Webhook status (\"active\")" },
                createdAt: { type: "string", format: "date-time", description: "When the webhook was created" },
                rateLimit: { type: "integer", description: "Requests per minute" },
                stats: {
                  type: "object",
                  properties: {
                    totalLinks: { type: "integer" },
                    totalClicks: { type: "integer" },
                    recentLinks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          slug: { type: "string" },
                          originalUrl: { type: "string", format: "uri" },
                          clicks: { type: "integer" },
                          createdAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
                docs: { type: "object", description: "This OpenAPI 3.1 specification" },
              },
            },
          },
        },
      },
      "404": { description: "Invalid webhook token" },
    },
  };
}

/** POST request body schema — url / customSlug / folder / note. */
function buildPostRequestBody(): Record<string, unknown> {
  return {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["url"],
          properties: {
            url: {
              type: "string",
              format: "uri",
              description: "The original URL to shorten (must be a valid URL)",
            },
            customSlug: {
              type: "string",
              minLength: 1,
              maxLength: 50,
              pattern: "^[a-zA-Z0-9_-]+$",
              description:
                "Optional custom slug. Auto-generated if omitted. Must not be a reserved path.",
            },
            folder: {
              type: "string",
              minLength: 1,
              maxLength: 50,
              description:
                "Optional folder name (case-insensitive match). Left uncategorized if not found.",
            },
            note: {
              type: "string",
              minLength: 1,
              maxLength: WEBHOOK_NOTE_MAX_LENGTH,
              description: "Optional bookmark note or comment.",
            },
          },
        },
      },
    },
  };
}

function buildPostResponses(maxRequests: number): Record<string, unknown> {
  const linkPayload = {
    type: "object",
    properties: {
      slug: { type: "string", description: "The generated or custom slug" },
      shortUrl: { type: "string", format: "uri", description: "The full short URL" },
      originalUrl: { type: "string", format: "uri", description: "The original URL" },
    },
  };
  return {
    "201": {
      description: "Short link created",
      content: { "application/json": { schema: linkPayload } },
    },
    "200": {
      description: "URL already shortened — existing link returned (idempotent)",
      content: { "application/json": { schema: linkPayload } },
    },
    "400": { description: "Invalid request body or slug format" },
    "404": { description: "Invalid webhook token" },
    "409": { description: "Custom slug already taken" },
    "429": { description: `Rate limit exceeded (${maxRequests} req/min)` },
  };
}

function buildPostOp(maxRequests: number): Record<string, unknown> {
  return {
    summary: "Create a short link",
    description: `Create a short link. Rate-limited to ${maxRequests} requests per minute.`,
    requestBody: buildPostRequestBody(),
    responses: buildPostResponses(maxRequests),
  };
}

export function buildOpenApiSpec(
  webhookUrl: string,
  maxRequests: number = RATE_LIMIT_DEFAULT_MAX,
): OpenApiSpec {
  return {
    openapi: "3.1.0",
    info: {
      title: "zhe.to Webhook API",
      version: "1.0.0",
      description:
        "Create short links via webhook. Authentication is via UUID token in the URL path.",
    },
    servers: [{ url: webhookUrl }],
    paths: {
      "/": {
        head: buildHeadOp(),
        get: buildGetOp(),
        post: buildPostOp(maxRequests),
      },
    },
  };
}
