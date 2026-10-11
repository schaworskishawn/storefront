#!/usr/bin/env node
/**
 * Rewrites docs/worldwide-ai/capability-matrix.md from the agent and function registries.
 *
 *   pnpm worldwide-ai:matrix
 *
 * The document is generated, never edited by hand. The same test that writes it here checks it on every test run, so a
 * registry change without a regenerated document fails `pnpm run verify`.
 */
import { spawn } from "node:child_process";

// One command string, so Windows (which needs a shell to find npx) and the others start it the same way.
const child = spawn("npx vitest run src/lib/worldwide-ai/functions/matrix-doc.test.ts", {
	stdio: "inherit",
	shell: true,
	env: { ...process.env, WORLDWIDE_AI_WRITE_DOCS: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
