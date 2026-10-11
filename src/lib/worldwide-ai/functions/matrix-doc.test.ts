import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES } from "../agents/registry";
import { ROLE_IDS } from "../types";
import { evidenceFor, matrixOwners, renderCapabilityMatrix } from "./matrix-doc";
import { ALL_FUNCTIONS, capabilityMatrix } from "./registry";

const DOCUMENT = join(process.cwd(), "docs", "worldwide-ai", "capability-matrix.md");
const unix = (text: string) => text.replace(/\r\n/g, "\n");

describe("the capability matrix document", () => {
	it("has exactly one entry per agent, in roster order, each for a function that agent owns", () => {
		expect(matrixOwners()).toEqual([...ROLE_IDS]);
		expect(capabilityMatrix().map((row) => row.number)).toEqual(ROLES.map((_, index) => index + 1));
		const text = renderCapabilityMatrix();
		expect(text.match(/^### \d+\. /gm)).toHaveLength(49);
		expect(text.match(/^\| \d+ \| /gm)).toHaveLength(49);
	});

	it("points every function at a test file that exists and names its agent", () => {
		for (const definition of ALL_FUNCTIONS) {
			const file = join(process.cwd(), evidenceFor(definition));
			expect(existsSync(file), `${definition.id}: ${file}`).toBe(true);
			const role = ROLES.find((r) => r.id === definition.agent);
			const source = readFileSync(file, "utf8");
			// A test either names the function, or runs every function of its kind and so names the agent or the list it runs.
			expect(
				source.includes(definition.id) ||
					source.includes(role?.name ?? "\u0000") ||
					/it\.each\((code|drafting)\.map/.test(source),
				definition.id,
			).toBe(true);
		}
	});

	it("never calls anything proven against live services, and names every agent's role pack", () => {
		const text = renderCapabilityMatrix();
		expect(text).not.toMatch(/production-ready|fully operational|all green/i);
		expect(text.match(/\*\*Role pack:\*\* `[a-z0-9-]+` version \d+, supported by /g)).toHaveLength(49);
		expect(text).toContain(
			"A pack guides work only after its exact version has been evaluated and the owner has approved it",
		);
		expect(text).toContain(
			"none has been run against the live database, the live model or real business records",
		);
	});

	it("matches the saved document (run `pnpm worldwide-ai:matrix` after changing the registry)", () => {
		const text = renderCapabilityMatrix();
		if (process.env.WORLDWIDE_AI_WRITE_DOCS === "1") {
			mkdirSync(dirname(DOCUMENT), { recursive: true });
			writeFileSync(DOCUMENT, text, "utf8");
		}
		expect(existsSync(DOCUMENT), "docs/worldwide-ai/capability-matrix.md is missing").toBe(true);
		expect(unix(readFileSync(DOCUMENT, "utf8"))).toBe(text);
	});
});
