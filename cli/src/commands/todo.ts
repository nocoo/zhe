/**
 * zhe todo — Manage hierarchical todos.
 */

import { defineCommand } from "@nocoo/base-cli";
import { createSubcommand } from "./todo/create.js";
import { deleteSubcommand } from "./todo/delete.js";
import { getSubcommand } from "./todo/get.js";
import { listSubcommand } from "./todo/list.js";
import { moveSubcommand } from "./todo/move.js";
import { updateSubcommand } from "./todo/update.js";

export const todoCommand = defineCommand({
  meta: {
    name: "todo",
    description: "Manage todos",
  },
  subCommands: {
    list: listSubcommand,
    get: getSubcommand,
    create: createSubcommand,
    update: updateSubcommand,
    move: moveSubcommand,
    delete: deleteSubcommand,
  },
});
