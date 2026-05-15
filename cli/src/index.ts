#!/usr/bin/env node
/**
 * zhe CLI — Manage zhe.to short links
 */

import { defineCommand, runMain } from "@nocoo/cli-base";
import { createCommand } from "./commands/create.js";
import { deleteCommand } from "./commands/delete.js";
import { folderCommand } from "./commands/folder.js";
import { foldersCommand } from "./commands/folders.js";
import { getCommand } from "./commands/get.js";
import { ideaCommand } from "./commands/idea.js";
import { inboxCommand } from "./commands/inbox.js";
import { listCommand } from "./commands/list.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { openCommand } from "./commands/open.js";
import { tagCommand } from "./commands/tag.js";
import { tagsCommand } from "./commands/tags.js";
import { updateCommand } from "./commands/update.js";
import { CLI_VERSION } from "./version.js";

const main = defineCommand({
	meta: {
		name: "zhe",
		version: CLI_VERSION,
		description: "CLI for managing zhe.to short links",
	},
	subCommands: {
		login: loginCommand,
		logout: logoutCommand,
		list: listCommand,
		inbox: inboxCommand,
		folders: foldersCommand,
		folder: folderCommand,
		tags: tagsCommand,
		tag: tagCommand,
		idea: ideaCommand,
		create: createCommand,
		get: getCommand,
		update: updateCommand,
		delete: deleteCommand,
		open: openCommand,
	},
});

runMain(main);
