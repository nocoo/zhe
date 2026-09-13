import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defineCommand } from "@nocoo/base-cli";
import { authenticatedClient, runOnce, watchConnector } from "../connector/runtime.js";

const execute = promisify(execFile);
const label = "ai.hexly.zhe.connector";
const agentFile = () => join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export const connectorCommand = defineCommand({
  meta: {
    name: "connector",
    description: "Enrich saved X bookmarks using this CLI login and the local X session",
  },
  subCommands: {
    status: defineCommand({
      meta: { name: "status", description: "Show Connector queue and shared CLI key expiry" },
      async run() {
        console.log(JSON.stringify(await authenticatedClient().connectorStatus(), null, 2));
      },
    }),
    once: defineCommand({
      meta: { name: "once", description: "Process one saved X bookmark" },
      async run() {
        console.log(JSON.stringify(await runOnce()));
      },
    }),
    watch: defineCommand({
      meta: { name: "watch", description: "Poll saved X bookmarks every 20 seconds" },
      async run() {
        const controller = new AbortController();
        const stop = () => controller.abort();
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        try {
          await watchConnector(controller.signal);
        } finally {
          process.removeListener("SIGINT", stop);
          process.removeListener("SIGTERM", stop);
        }
      },
    }),
    start: defineCommand({
      meta: { name: "start", description: "Run Connector in the background at macOS login" },
      async run() {
        if (process.platform !== "darwin")
          throw new Error("Use `zhe connector watch` with your system's process supervisor.");
        await authenticatedClient().connectorStatus();
        for (const command of ["ffmpeg", "ffprobe"])
          await execute(command, ["-version"], { maxBuffer: 65_536 });
        const cli = fileURLToPath(new URL("../index.js", import.meta.url));
        const configDir = join(homedir(), ".config", "zhe");
        await mkdir(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
        await mkdir(configDir, { recursive: true, mode: 0o700 });
        const log = join(configDir, "connector.log");
        await writeFile(log, "", { flag: "a", mode: 0o600 });
        await writeFile(
          agentFile(),
          `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${[process.execPath, cli, "connector", "watch"].map((arg) => `<string>${xml(arg)}</string>`).join("")}</array>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH ?? "/usr/bin:/bin")}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>60</integer>
<key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>`,
          { mode: 0o600 },
        );
        const domain = `gui/${process.getuid?.()}`;
        await execute("launchctl", ["bootout", `${domain}/${label}`]).catch(() => {});
        await execute("launchctl", ["bootstrap", domain, agentFile()]);
        console.log(
          "Connector started. Shared zhe login; polling every 20 seconds. Stop with `zhe connector stop`.",
        );
      },
    }),
    stop: defineCommand({
      meta: { name: "stop", description: "Stop the background Connector" },
      async run() {
        if (process.platform !== "darwin")
          throw new Error("Stop the process running `zhe connector watch`.");
        await execute("launchctl", ["bootout", `gui/${process.getuid?.()}/${label}`]).catch(
          () => {},
        );
        const { rm } = await import("node:fs/promises");
        await rm(agentFile(), { force: true });
        console.log("Connector stopped.");
      },
    }),
  },
});
