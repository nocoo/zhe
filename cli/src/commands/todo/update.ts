import { defineCommand, pc } from "@nocoo/base-cli";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import type { UpdateTodoRequest } from "../../api/types.js";
import { parsePositiveInt } from "../../utils.js";
import { handleApiError, requireAuth } from "./helpers.js";

export const updateSubcommand = defineCommand({
  meta: {
    name: "update",
    description: "Update an existing todo",
  },
  args: {
    id: { type: "positional", description: "Todo ID", required: true },
    title: { type: "string", alias: "t", description: "New title" },
    content: { type: "string", alias: "c", description: "New content (empty string clears)" },
    done: { type: "boolean", description: "Mark done / not done" },
    tag: {
      type: "string",
      alias: "T",
      description: "Replace tags (comma-separated names, empty clears)",
    },
    due: { type: "string", alias: "d", description: "Due date (ISO or ms); use 'clear' to remove" },
    emoji: { type: "string", description: "Emoji icon (empty clears)" },
    json: { type: "boolean", description: "Output as JSON" },
  },
  async run({ args }) {
    const apiKey = requireAuth();
    const client = new ApiClient(apiKey);

    const id = parsePositiveInt(args.id as string);
    if (id === null) {
      console.log(pc.red("Invalid todo ID."));
      process.exit(EXIT_INVALID_ARGS);
    }

    const request: UpdateTodoRequest = {};
    if (args.title !== undefined) request.title = args.title;
    if (args.content !== undefined) request.content = args.content === "" ? null : args.content;
    if (args.done !== undefined) request.done = args.done;
    if (args.emoji !== undefined) request.emoji = args.emoji === "" ? null : args.emoji;

    if (args.tag !== undefined) {
      request.tagNames =
        args.tag === ""
          ? []
          : args.tag
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
    }

    if (args.due !== undefined) {
      if (args.due === "clear") {
        request.dueAtMs = null;
      } else {
        const parsed = Date.parse(args.due);
        if (Number.isNaN(parsed)) {
          const asNum = Number.parseInt(args.due, 10);
          if (!Number.isFinite(asNum)) {
            console.log(pc.red("Invalid due date."));
            process.exit(EXIT_INVALID_ARGS);
          }
          request.dueAtMs = asNum;
        } else {
          request.dueAtMs = parsed;
        }
      }
    }

    if (Object.keys(request).length === 0) {
      console.log(pc.yellow("No changes specified."));
      process.exit(EXIT_INVALID_ARGS);
    }

    try {
      const response = await client.updateTodo(id, request);

      if (args.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const { todo } = response;
      console.log(pc.green(`✓ Updated todo ${pc.cyan(`#${todo.id}`)} (${todo.title})`));
    } catch (error) {
      handleApiError(error);
    }
  },
});
