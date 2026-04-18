/**
 * GET  /api/v1/ideas - List all ideas for the authenticated user
 * POST /api/v1/ideas - Create a new idea
 *
 * Requires: ideas:read (GET), ideas:write (POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithRateLimit, apiError } from "@/lib/api/auth";
import { logApiRequest } from "@/lib/api/audit";
import { parsePaginationParams, parseJsonBody, isErrorResponse } from "@/lib/api/validation";
import { ScopedDB, type IdeaListItem, type IdeaDetail } from "@/lib/db/scoped";

/**
 * GET /api/v1/ideas
 *
 * Query params:
 *   - q (optional): Keyword search across title and excerpt
 *   - tagId (optional): Filter by tag ID
 *   - limit (optional): Max results (default 100, max 500)
 *   - offset (optional): Pagination offset
 *
 * Response: { ideas: IdeaListItem[] }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "ideas:read");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  try {
    const db = new ScopedDB(userId);
    const url = new URL(request.url);

    // Build filter options
    const queryParam = url.searchParams.get("q");
    const tagIdParam = url.searchParams.get("tagId");

    const options: { query?: string; tagId?: string } = {};
    if (queryParam) options.query = queryParam;
    if (tagIdParam) options.tagId = tagIdParam;

    let ideas = await db.getIdeas(options);

    // Apply pagination with validation
    const paginationResult = parsePaginationParams(url);
    if (isErrorResponse(paginationResult)) {
      return paginationResult;
    }
    const { limit, offset } = paginationResult;

    ideas = ideas.slice(offset, offset + limit);

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/ideas",
      method: "GET",
      statusCode: 200,
    });

    return NextResponse.json(
      { ideas: ideas.map(ideaListItemToResponse) },
      { headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("[/api/v1/ideas GET]", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * POST /api/v1/ideas
 *
 * Body:
 *   - content (required): Markdown content
 *   - title (optional): Idea title
 *   - tagIds (optional): Array of tag IDs to associate
 *
 * Response: { idea: IdeaDetail }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await requireAuthWithRateLimit(request, "ideas:write");
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { auth, headers: rateLimitHeaders } = authResult;
  const { userId, keyId, keyPrefix } = auth;

  const bodyResult = await parseJsonBody(request);
  if (isErrorResponse(bodyResult)) {
    return bodyResult;
  }
  const bodyObj = bodyResult;

  try {
    // Validate required fields
    if (!bodyObj.content || typeof bodyObj.content !== "string") {
      return apiError("Missing or invalid 'content' field", 400);
    }

    const content = bodyObj.content.trim();
    if (!content) {
      return apiError("Content cannot be empty", 400);
    }

    // Validate title if provided
    if (bodyObj.title !== undefined && bodyObj.title !== null && typeof bodyObj.title !== "string") {
      return apiError("'title' must be a string or null", 400);
    }

    // Validate tagIds if provided
    if (bodyObj.tagIds !== undefined && bodyObj.tagIds !== null) {
      if (!Array.isArray(bodyObj.tagIds)) {
        return apiError("'tagIds' must be an array", 400);
      }
      if (!bodyObj.tagIds.every((id: unknown) => typeof id === "string")) {
        return apiError("All tag IDs must be strings", 400);
      }
    }

    const db = new ScopedDB(userId);

    // Create the idea
    const idea = await db.createIdea({
      content,
      ...(bodyObj.title !== undefined && bodyObj.title !== null && { title: bodyObj.title as string }),
      ...(bodyObj.tagIds !== undefined && bodyObj.tagIds !== null && { tagIds: bodyObj.tagIds as string[] }),
    });

    logApiRequest({
      keyId,
      keyPrefix,
      userId,
      endpoint: "/api/v1/ideas",
      method: "POST",
      statusCode: 201,
    });

    return NextResponse.json(
      { idea: ideaDetailToResponse(idea) },
      { status: 201, headers: rateLimitHeaders },
    );
  } catch (error) {
    console.error("[/api/v1/ideas POST]", error);
    // Check for invalid tag IDs error
    if (error instanceof Error && error.message.includes("Invalid tag IDs")) {
      return apiError(error.message, 400);
    }
    return apiError("Internal server error", 500);
  }
}

/**
 * Transform an IdeaListItem to API response format.
 * Converts Date objects to ISO strings.
 */
function ideaListItemToResponse(idea: IdeaListItem): Record<string, unknown> {
  return {
    id: idea.id,
    title: idea.title,
    excerpt: idea.excerpt,
    tagIds: idea.tagIds,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

/**
 * Transform an IdeaDetail to API response format.
 * Converts Date objects to ISO strings.
 */
function ideaDetailToResponse(idea: IdeaDetail): Record<string, unknown> {
  return {
    id: idea.id,
    title: idea.title,
    content: idea.content,
    excerpt: idea.excerpt,
    tagIds: idea.tagIds,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}
