import { defineCommand, pc } from "@nocoo/base-cli";
import { ApiClient } from "../../api/client.js";
import { formatTagNames, handleApiError, requireAuth } from "./helpers.js";

export const listSubcommand = defineCommand({
  meta: {
    name: "list",
    description: "List all todos (flat tree rows)",
  },
  args: {
    json: { type: "boolean", description: "Output as JSON" },
  },
  async run({ args }) {
    const apiKey = requireAuth();
    const client = new ApiClient(apiKey);

    try {
      const response = await client.listTodos();

      if (args.json) {
        console.log(JSON.stringify(response, null, 2));
        return;
      }

      if (response.todos.length === 0) {
        console.log(pc.yellow("No todos found."));
        return;
      }

      console.log(pc.dim("ID    DONE  TITLE                    TAGS"));
      console.log(pc.dim("─".repeat(56)));

      for (const todo of response.todos) {
        const done = todo.done ? pc.green("yes") : pc.dim("no ");
        const title = todo.title.slice(0, 24);
        const tags = formatTagNames(todo.tagNames);
        console.log(
          `${pc.cyan(String(todo.id).padEnd(6))}${done.padEnd(6)}${title.padEnd(25)}${pc.yellow(tags)}`,
        );
      }
    } catch (error) {
      handleApiError(error);
    }
  },
});
