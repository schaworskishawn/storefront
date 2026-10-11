#!/usr/bin/env node
// @ts-check
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { defaultExec, createRunner } from "./runner.mjs";
import { createAdapter } from "./server.mjs";

/**
 * Starts the adapter on the OpenClaw host. Everything is configured by environment variables (see README.md):
 *   ADAPTER_SECRET          shared secret, at least 32 characters (the storefront's OPENCLAW_ADAPTER_SECRET)
 *   ALLOWED_HOSTS           comma-separated hostnames the worker may open ("www.example.com,*.staging.example.com")
 *   JOBS_DIR                where job records and screenshots are kept (default ./jobs): put this on persistent storage
 *   PORT / BIND             where to listen (default 8787 on 127.0.0.1: put TLS and a private network in front of it)
 *   OPENCLAW_BIN            the openclaw command (default "openclaw")
 *   OPENCLAW_BROWSER_PROFILE the dedicated browser profile to use (default "inspector")
 *   OPENCLAW_MEDIA_DIRS     folders OpenClaw writes screenshots to, separated by ":" or ";" (default ~/.openclaw/media)
 */

const secret = process.env.ADAPTER_SECRET ?? "";
if (secret.length < 32) {
	console.error("ADAPTER_SECRET must be set to at least 32 characters.");
	process.exit(1);
}
const allowedHosts = (process.env.ALLOWED_HOSTS ?? "")
	.split(",")
	.map((h) => h.trim().toLowerCase())
	.filter(Boolean);
if (!allowedHosts.length) {
	console.error("ALLOWED_HOSTS must list at least one hostname.");
	process.exit(1);
}

const bin = process.env.OPENCLAW_BIN ?? "openclaw";
const profile = process.env.OPENCLAW_BROWSER_PROFILE ?? "inspector";
const mediaDirs = (process.env.OPENCLAW_MEDIA_DIRS ?? join(homedir(), ".openclaw", "media"))
	.split(delimiter === ":" ? /[:;]/ : ";")
	.filter(Boolean);

const runner = createRunner({ bin, profile, mediaDirs });
const adapter = createAdapter({
	secret,
	allowedHosts,
	jobsDir: resolve(process.env.JOBS_DIR ?? "./jobs"),
	runner,
	version: "1",
	healthCheck: async () => {
		try {
			await defaultExec(bin, ["browser", "--browser-profile", profile, "--json", "status"], {
				timeoutMs: 15_000,
			});
			return { ok: true, detail: "OpenClaw's browser answered." };
		} catch {
			return { ok: false, detail: "OpenClaw's browser did not answer." };
		}
	},
});

await adapter.recover();
const address = await adapter.listen(Number(process.env.PORT ?? 8787), process.env.BIND ?? "127.0.0.1");
console.log(
	`[adapter] listening on ${address.address}:${address.port}; profile "${profile}"; ${allowedHosts.length} allowed host(s)`,
);

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		void adapter.close().then(() => process.exit(0));
	});
}
