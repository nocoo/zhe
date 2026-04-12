/**
 * zhe logout — Clear stored credentials
 */

import { defineCommand, pc } from "@nocoo/cli-base";
import { clearApiKey, getApiKey } from "../config.js";

export const logoutCommand = defineCommand({
	meta: {
		name: "logout",
		description: "Clear stored credentials",
	},
	run() {
		const existingKey = getApiKey();

		if (!existingKey) {
			console.log(pc.dim("Not logged in."));
			return;
		}

		clearApiKey();
		console.log(pc.green("✓ Logged out"));
	},
});
