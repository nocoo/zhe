import { defineCommand, pc } from "@nocoo/base-cli";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import type { CreateTodoRequest } from "../../api/types.js";
import { parsePositiveInt } from "../../utils.js";
import { handleApiError, requireAuth } from "./helpers.js";
import { parseTodoDueArg } from "./parse-due.js";

export const createSubcommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a new todo",
  },
  args: {
    title: { type: "positional", description: "Todo title", required: true },
    parent: { type: "string", alias: "p", description: "Parent todo ID" },
    content: { type: "string", alias: "c", description: "Optional note content" },
    tag: {
      type: "string",
      alias: "T",
      description: "Add tag by name (repeatable via comma-separated list)",
    },
    due: {
      type: "string",
      alias: "d",
      description: "Due date: YYYY-MM-DD or Unix ms (digits only)",
    },
    emoji: { type: "string", description: "Optional emoji icon" },
    json: { type: "boolean", description: "Output as JSON" },
  },
  async run({ args }) {
    const apiKey = requireAuth();
    const client = new ApiClient(apiKey);

    const title = (args.title as string).trim();
    if (!title) {
      console.log(pc.red("Title cannot be empty."));
      process.exit(EXIT_INVALID_ARGS);
    }

    const request: CreateTodoRequest = { title };

    if (args.parent !== undefined) {
      const parentId = parsePositiveInt(args.parent);
      if (parentId === null) {
        console.log(pc.red("Invalid parent todo ID."));
        process.exit(EXIT_INVALID_ARGS);
      }
      request.parentId = parentId;
    }

    if (args.content !== undefined) request.content = args.content;
    if (args.emoji !== undefined) request.emoji = args.emoji;

    if (args.tag) {
      request.tagNames = args.tag
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    if (args.due) {
      const dueAtMs = parseTodoDueArg(args.due);
      if (dueAtMs === null) {
        console.log(pc.red("Invalid due date. Use YYYY-MM-DD or Unix milliseconds."));
        process.exit(EXIT_INVALID_ARGS);
      }
      request.dueAtMs = dueAtMs;
    }

    try {
      const response = await client.createTodo(request);

      if (args.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const { todo } = response;
      console.log(pc.green(`✓ Created todo ${pc.cyan(`#${todo.id}`)} (${todo.title})`));
    } catch (error) {
      handleApiError(error);
    }
  },
});
