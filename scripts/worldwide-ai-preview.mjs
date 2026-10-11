#!/usr/bin/env node
/**
 * Starts the dev server with the Worldwide AI workspace in local preview: an in-memory database seeded with fictional,
 * clearly labelled records, files kept in a local folder, and a stand-in operator, so the workspace can be opened at
 * /worldwide-ai without a store sign-in or any cloud service.
 *
 *   pnpm worldwide-ai:preview            preview as the owner, on port 3100
 *   pnpm worldwide-ai:preview staff      preview as a staff member
 *
 * The stand-in operator only exists under `next dev` with the demonstration store (see src/lib/worldwide-ai/auth/roles.ts);
 * it is refused in production, on Vercel, and against a real database. Everything in the preview is lost when the server
 * stops. Agents that need the model stay "awaiting configuration" unless ANTHROPIC_API_KEY is set in your environment.
 */
import { spawn } from "node:child_process";

const role = process.argv[2] === "staff" ? "staff" : "owner";
const port = process.env.PORT ?? "3100";
if (!/^\d{2,5}$/.test(port)) {
	console.error(`PORT must be a number, not "${port}".`);
	process.exit(1);
}

// One command string, so Windows (which needs a shell to find npx) and the others start it the same way.
const child = spawn(`npx next dev --webpack -p ${port}`, {
	stdio: "inherit",
	shell: true,
	env: {
		...process.env,
		NODE_ENV: "development",
		WORLDWIDE_AI_STORE: "demo",
		WORLDWIDE_AI_DEMO_OPERATOR: role,
	},
});

console.log(`\nWorldwide AI preview (${role}, demonstration data): http://localhost:${port}/worldwide-ai\n`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
