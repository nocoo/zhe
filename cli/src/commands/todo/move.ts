import { defineCommand, pc } from "@nocoo/base-cli";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import { parsePositiveInt } from "../../utils.js";
import { handleApiError, requireAuth } from "./helpers.js";

export const moveSubcommand = defineCommand({
  meta: {
    name: "move",
    description: "Reparent and reorder a todo",
  },
  args: {
    id: { type: "positional", description: "Todo ID", required: true },
    root: { type: "boolean", description: "Move to top level (same as omitting --parent)" },
    parent: {
      type: "string",
      alias: "p",
      description: "New parent todo ID (omit or use --root for top level)",
    },
    position: {
      type: "string",
      alias: "n",
      description: "Position among siblings (0-based)",
      required: true,
    },
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

    if (args.root && args.parent !== undefined) {
      console.log(pc.red("Use either --root or --parent, not both."));
      process.exit(EXIT_INVALID_ARGS);
    }

    let parentId: number | null;
    if (args.root || args.parent === undefined) {
      parentId = null;
    } else {
      const parentRaw = args.parent as string;
      if (parentRaw === "root" || parentRaw === "null") {
        parentId = null;
      } else {
        parentId = parsePositiveInt(parentRaw);
        if (parentId === null) {
          console.log(pc.red("Invalid parent todo ID."));
          process.exit(EXIT_INVALID_ARGS);
        }
      }
    }

    const position = Number.parseInt(args.position as string, 10);
    if (!Number.isInteger(position) || position < 0) {
      console.log(pc.red("Position must be a non-negative integer."));
      process.exit(EXIT_INVALID_ARGS);
    }

    try {
      const response = await client.moveTodo(id, { parentId, position });

      if (args.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      console.log(pc.green(`✓ Moved todo ${pc.cyan(`#${id}`)}`));
    } catch (error) {
      handleApiError(error);
    }
  },
});
