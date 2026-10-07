import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BADGES, BADGE_HEIGHT, BADGE_WIDTH } from "./wv-badges";

const pageExists = (href: string) => existsSync(`src/app/(root)${href.split(/[?#]/)[0]}/page.tsx`);

describe("footer badges", () => {
	it("has a badge file for every entry", () => {
		for (const badge of BADGES) expect(existsSync(`public/badges/${badge.file}`), badge.file).toBe(true);
	});

	it("draws every badge at the classic 88 x 31", () => {
		expect(BADGE_WIDTH).toBe(88);
		expect(BADGE_HEIGHT).toBe(31);
		for (const badge of BADGES) {
			const svg = readFileSync(`public/badges/${badge.file}`, "utf8");
			expect(svg, badge.file).toContain('width="88"');
			expect(svg, badge.file).toContain('height="31"');
			expect(svg, badge.file).toContain('viewBox="0 0 88 31"');
		}
	});

	it("only links to pages that exist", () => {
		for (const badge of BADGES.filter((b) => b.href)) {
			expect(badge.href?.startsWith("/"), badge.file).toBe(true);
			expect(pageExists(badge.href as string), `${badge.file} -> ${badge.href} has no page`).toBe(true);
		}
	});

	it("describes every badge for people who can't see it", () => {
		for (const badge of BADGES) expect(badge.alt.trim().length, badge.file).toBeGreaterThan(3);
	});

	it("lists each badge once", () => {
		expect(new Set(BADGES.map((b) => b.file)).size).toBe(BADGES.length);
	});

	it("leaves no drawn badge unused (so a stale file doesn't linger)", () => {
		const used = new Set(BADGES.map((b) => b.file));
		// Badges for pages that arrive in later changes are generated now and listed when their page exists.
		const planned = new Set(["guestbook.svg"]);
		for (const file of readdirSync("public/badges").filter((f) => f.endsWith(".svg"))) {
			expect(used.has(file) || planned.has(file), `${file} is drawn but not listed`).toBe(true);
		}
	});

	it("keeps the rewards badge out of the way while rewards are off", () => {
		const rewards = BADGES.filter((b) => b.rewards);
		expect(rewards.map((b) => b.href)).toEqual(["/rewards"]);
	});
});
