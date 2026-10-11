#!/usr/bin/env node
/**
 * Rewrites what is generated from the Worldwide AI registries: docs/worldwide-ai/capability-matrix.md and the portable
 * skill packages under skills/worldwide-ai/.
 *
 *   pnpm worldwide-ai:matrix      (or pnpm worldwide-ai:skills: the same thing)
 *
 * Both are generated, never edited by hand. The same tests that write them here check them on every test run, so a registry
 * or skill change without regenerated files fails `pnpm run verify`.
 */
import { spawn } from "node:child_process";

// One command string, so Windows (which needs a shell to find npx) and the others start it the same way.
const child = spawn(
	"npx vitest run src/lib/worldwide-ai/functions/matrix-doc.test.ts src/lib/worldwide-ai/skills/export.test.ts",
	{
		stdio: "inherit",
		shell: true,
		env: { ...process.env, WORLDWIDE_AI_WRITE_DOCS: "1" },
	},
);
child.on("exit", (code) => process.exit(code ?? 0));
