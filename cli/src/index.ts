#!/usr/bin/env node
/**
 * zhe CLI — Manage zhe.to short links
 */

import { defineCommand, runMain } from "@nocoo/cli-base";
import { createCommand } from "./commands/create.js";
import { deleteCommand } from "./commands/delete.js";
import { getCommand } from "./commands/get.js";
import { listCommand } from "./commands/list.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { openCommand } from "./commands/open.js";
import { updateCommand } from "./commands/update.js";

const main = defineCommand({
	meta: {
		name: "zhe",
		version: "1.0.0",
		description: "CLI for managing zhe.to short links",
	},
	subCommands: {
		login: loginCommand,
		logout: logoutCommand,
		list: listCommand,
		create: createCommand,
		get: getCommand,
		update: updateCommand,
		delete: deleteCommand,
		open: openCommand,
	},
});

runMain(main);
