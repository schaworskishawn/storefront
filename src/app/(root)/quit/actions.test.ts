import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	generateStages,
	parseQuitData,
	stamp,
	startingData,
	type QuitData,
} from "@/ui/sections/wv-home/wv-quit-model";
import { QUIT_PLAN_KEY } from "./account";

const exec = vi.fn();
vi.mock("@/lib/graphql", () => ({
	executeAuthenticatedGraphQL: (doc: unknown, options: unknown) => exec(doc, options),
}));

import { saveQuitPlan } from "./actions";

const plan = (savedAt: number): QuitData =>
	stamp(
		startingData("2026-10-04", { product: "Vape", baselinePuffs: 50, stages: generateStages(20, 7) }),
		savedAt,
	);

type Reply = { ok: true; data: unknown } | { ok: false; error: { message: string } };
const ok = (data: unknown): Reply => ({ ok: true, data });
const fail: Reply = { ok: false, error: { message: "boom" } };

/** Wires the two Saleor calls: reading the account (`me`) and saving to it. */
function saleor(me: Reply, save: Reply = ok({ updateMetadata: { errors: [] } })) {
	exec.mockImplementation(async (doc: unknown) =>
		String(doc).includes("mutation SaveMyQuitPlan") ? save : me,
	);
}
const account = (stored: QuitData | null) =>
	ok({ me: { id: "VXNlcjox", metafield: stored ? JSON.stringify(stored) : null } });
const saveCalls = () => exec.mock.calls.filter(([doc]) => String(doc).includes("mutation SaveMyQuitPlan"));

beforeEach(() => {
	exec.mockReset();
	vi.useRealTimers();
});

describe("saveQuitPlan", () => {
	it("saves the plan on the signed-in customer's own account", async () => {
		saleor(account(null));
		const mine = plan(Date.now());
		expect(await saveQuitPlan(mine)).toEqual({ status: "saved" });

		const [call] = saveCalls();
		const options = call[1] as { variables: { id: string; value: string } };
		expect(options.variables.id).toBe("VXNlcjox"); // the id comes from the session, never from the browser
		expect(parseQuitData(options.variables.value)).toEqual(mine);
	});

	it("replaces an older copy on the account", async () => {
		const now = Date.now();
		saleor(account(plan(now - 5_000)));
		expect(await saveQuitPlan(plan(now))).toEqual({ status: "saved" });
		expect(saveCalls()).toHaveLength(1);
	});

	it("hands back a newer copy instead of overwriting it", async () => {
		const now = Date.now();
		const theirs = plan(now);
		saleor(account(theirs));
		const result = await saveQuitPlan(plan(now - 5_000));
		expect(result).toEqual({ status: "newer", plan: theirs });
		expect(saveCalls()).toHaveLength(0);
	});

	it("does nothing for a visitor who isn't signed in", async () => {
		saleor(ok({ me: null }));
		expect(await saveQuitPlan(plan(Date.now()))).toEqual({ status: "guest" });
		expect(saveCalls()).toHaveLength(0);
	});

	it("reports an error when the account can't be reached or the save is refused", async () => {
		saleor(fail);
		expect(await saveQuitPlan(plan(Date.now()))).toEqual({ status: "error" });

		saleor(account(null), fail);
		expect(await saveQuitPlan(plan(Date.now()))).toEqual({ status: "error" });

		saleor(account(null), ok({ updateMetadata: { errors: [{ message: "nope" }] } }));
		expect(await saveQuitPlan(plan(Date.now()))).toEqual({ status: "error" });
	});

	it("rejects anything that isn't a plan without touching the account", async () => {
		saleor(account(null));
		for (const junk of [null, undefined, 42, "x", {}, { v: 3 }, { ...plan(1), plan: { stages: [] } }]) {
			expect(await saveQuitPlan(junk as unknown as QuitData)).toEqual({ status: "error" });
		}
		expect(exec).not.toHaveBeenCalled();
	});

	it("rejects a plan that is too big", async () => {
		saleor(account(null));
		const big = plan(Date.now());
		big.plan.stages = Array.from({ length: 60 }, () => ({ name: "x".repeat(40), strength: 1, days: 1 }));
		const filler = Object.fromEntries(
			Array.from({ length: 800 }, (_, i) => {
				const date = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
				return [date, { date, strength: 1, puffs: 1, note: "y".repeat(200) }];
			}),
		);
		expect(await saveQuitPlan({ ...big, logs: filler } as unknown as QuitData)).toEqual({ status: "error" });
		expect(exec).not.toHaveBeenCalled();
	});

	it("pulls a timestamp from the far future back to now, so a wrong clock can't win forever", async () => {
		saleor(account(null));
		await saveQuitPlan(plan(Date.now() + 365 * 86_400_000));
		const options = saveCalls()[0][1] as { variables: { value: string } };
		const saved = parseQuitData(options.variables.value);
		expect(saved?.savedAt).toBeLessThanOrEqual(Date.now());
	});

	it("only keeps what the plan format allows", async () => {
		saleor(account(null));
		await saveQuitPlan({ ...plan(Date.now()), admin: true } as unknown as QuitData);
		const options = saveCalls()[0][1] as { variables: { value: string } };
		expect(JSON.parse(options.variables.value)).not.toHaveProperty("admin");
	});
});

describe("the stored key", () => {
	it("matches the key used by the GraphQL document", () => {
		const doc = readFileSync("src/graphql/QuitPlan.graphql", "utf8");
		expect(doc.match(new RegExp(`"${QUIT_PLAN_KEY}"`, "g"))).toHaveLength(2); // read and write
	});
});
