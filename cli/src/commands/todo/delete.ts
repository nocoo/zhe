import { defineCommand, pc } from "@nocoo/base-cli";
import { ApiClient, EXIT_INVALID_ARGS } from "../../api/client.js";
import { parsePositiveInt } from "../../utils.js";
import { confirm, handleApiError, requireAuth } from "./helpers.js";

export const deleteSubcommand = defineCommand({
  meta: {
    name: "delete",
    description: "Delete a todo (cascades to children)",
  },
  args: {
    id: { type: "positional", description: "Todo ID", required: true },
    yes: { type: "boolean", alias: "y", description: "Skip confirmation" },
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
      if (!args.yes) {
        const { todo } = await client.getTodo(id);
        const confirmed = await confirm(`Delete todo #${id} (${todo.title})?`);
        if (!confirmed) {
          console.log(pc.dim("Cancelled."));
          return;
        }
      }

      await client.deleteTodo(id);

      if (args.json) {
        console.log(JSON.stringify({ success: true, id }, null, 2));
        return;
      }

      console.log(pc.green(`✓ Deleted todo ${pc.cyan(`#${id}`)}`));
    } catch (error) {
      handleApiError(error);
    }
  },
});
