#!/usr/bin/env node
/**
 * `cap sync` with an optional server URL, so it works the same in PowerShell, cmd and bash (inline `VAR=value cmd` only works
 * in bash).
 *
 *   node scripts/cap-sync.mjs                          # production URL from capacitor.config.ts
 *   node scripts/cap-sync.mjs http://10.0.2.2:3000     # Android emulator → the dev server on this computer
 *
 * The URL ends up in the native projects' capacitor.config.json; run it again (without a URL) to go back to production.
 */
import { spawnSync } from "node:child_process";

const url = process.argv[2];
if (url && !/^https?:\/\//.test(url)) {
	console.error(`"${url}" is not a URL. Example: node scripts/cap-sync.mjs http://10.0.2.2:3000`);
	process.exit(1);
}

const env = { ...process.env };
if (url) {
	env.CAPACITOR_SERVER_URL = url;
	console.log(`Pointing the app at ${url}`);
} else {
	delete env.CAPACITOR_SERVER_URL;
	console.log("Pointing the app at the production URL in capacitor.config.ts");
}

const result = spawnSync("pnpm", ["exec", "cap", "sync"], { stdio: "inherit", env, shell: true });
process.exit(result.status ?? 1);
