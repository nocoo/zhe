import { resetDemo } from "./lib/demo-storage";

await resetDemo(process.cwd());
console.log("Owned Demo storage reset. Start the local launcher to reseed.");
