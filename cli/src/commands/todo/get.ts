import { defineCommand, pc } from "@nocoo/base-cli";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import { parsePositiveInt } from "../../utils.js";
import { formatDate, formatTagNames, handleApiError, requireAuth } from "./helpers.js";

export const getSubcommand = defineCommand({
  meta: {
    name: "get",
    description: "Get full details of a todo",
  },
  args: {
    id: { type: "positional", description: "Todo ID", required: true },
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

    try {
      const response = await client.getTodo(id);

      if (args.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      const { todo } = response;
      const tags = formatTagNames(todo.tagNames);
      const status = todo.done ? pc.green("done") : pc.yellow("open");

      console.log(pc.dim("─".repeat(40)));
      console.log(`Todo ${pc.cyan(`#${todo.id}`)} — ${pc.bold(todo.title)} (${status})`);
      if (tags) console.log(`Tags: ${pc.yellow(tags)}`);
      if (todo.dueAt) console.log(`Due: ${formatDate(todo.dueAt)}`);
      console.log(pc.dim("─".repeat(40)));
      if (todo.content) {
        console.log();
        console.log(todo.content);
      }
    } catch (error) {
      handleApiError(error);
    }
  },
});
