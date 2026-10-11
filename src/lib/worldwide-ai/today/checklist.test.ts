import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listAudit } from "../audit";
import { readConfig } from "../config";
import type { SqlClient } from "../db/sql";
import { requestFunction, runFunction } from "../functions/pipeline";
import { getProductByTask } from "../functions/products";
import { FUNCTIONS, lookupFunction } from "../functions/registry";
import { generateDailyReport } from "../reports/daily";
import { getTask } from "../tasks/repo";
import { freshDb, owner, staff, workflowDeps } from "../testing.test-util";
import type { OperatorActor } from "../types";
import {
	addAction,
	assigneeLabel,
	closeAction,
	isFor,
	listClosedActions,
	listOpenActions,
	snoozeAction,
	trackReportAction,
	updateAction,
} from "./checklist";

let sql: SqlClient;
const TODAY = "2026-10-14";
const other: OperatorActor = { kind: "operator", id: "staff-2", label: "Robin Other", role: "staff" };
const env = { POSTGRES_URL: "postgres://test" };

beforeAll(async () => {
	sql = await freshDb();
});
afterAll(async () => {
	await sql.close();
});

describe("adding an action by hand", () => {
	it("records what has to be done, for whom, how pressing, and by when", async () => {
		await expect(addAction(sql, staff, { title: "x" })).rejects.toThrow("Say what has to be done.");
		await expect(addAction(sql, staff, { title: "Call the courier", dueOn: "next week" })).rejects.toThrow(
			"The date must be a date like 2026-10-31.",
		);
		const item = await addAction(sql, staff, {
			title: "Call the courier about the missing pallet",
			detail: "Waybill 7731.",
			priority: "high",
			dueOn: "2026-10-16",
			assignedTo: "owner",
		});
		expect(item).toMatchObject({
			source: "manual",
			status: "open",
			priority: "high",
			assignedTo: "owner",
			dueOn: "2026-10-16",
			// A date someone typed is their suggestion, never a recorded deadline.
			dueConfirmed: false,
			createdBy: "operator:staff-1",
		});
	});

	it("can be for anyone, a role, or the person asking, and never for someone else by name", async () => {
		const mine = await addAction(sql, staff, { title: "Check the label printer", assignedTo: "me" });
		expect(mine.assignedTo).toBe("operator:staff-1");
		await expect(
			addAction(sql, staff, { title: "Chase Robin", assignedTo: "operator:staff-2" }),
		).rejects.toThrow("An action can be for anyone, the owner, staff, or you.");
		const anyone = await addAction(sql, staff, { title: "Tidy the receiving shelf" });
		expect(isFor(anyone, owner) && isFor(anyone, other)).toBe(true);
		expect(isFor(mine, staff)).toBe(true);
		expect(isFor(mine, other)).toBe(false);
		expect(isFor({ assignedTo: "staff" }, other)).toBe(true);
		expect(isFor({ assignedTo: "staff" }, owner)).toBe(false);
		expect(assigneeLabel(mine, staff)).toBe("You");
		expect(assigneeLabel(mine, other)).toBe("One person");
		expect(assigneeLabel(anyone)).toBe("Anyone");
	});

	it("lists what is open with the most pressing first", async () => {
		await addAction(sql, owner, { title: "Sign the lease renewal", priority: "urgent", dueOn: "2026-10-15" });
		expect((await listOpenActions(sql, { today: TODAY })).map((item) => [item.priority, item.title])).toEqual(
			[
				["urgent", "Sign the lease renewal"],
				["high", "Call the courier about the missing pallet"],
				["normal", "Check the label printer"],
				["normal", "Tidy the receiving shelf"],
			],
		);
	});
});

describe("changing, putting off and closing an action", () => {
	it("changes who it is for, its priority and its date", async () => {
		const [, courier] = await listOpenActions(sql);
		const changed = await updateAction(sql, owner, courier.id, {
			assignedTo: "staff",
			priority: "urgent",
			dueOn: "2026-10-20",
		});
		expect(changed).toMatchObject({ assignedTo: "staff", priority: "urgent", dueOn: "2026-10-20" });
		expect((await listAudit(sql, 1))[0]).toMatchObject({ action: "checklist.update", subject: courier.id });
	});

	it("puts an item off only with a reason and a later day, and brings it back on that day", async () => {
		const printer = (await listOpenActions(sql)).find((item) => item.title === "Check the label printer");
		const id = printer?.id ?? "";
		await expect(snoozeAction(sql, staff, id, { until: TODAY, reason: "Busy" }, TODAY)).rejects.toThrow(
			"Choose a day after today to bring it back.",
		);
		await expect(snoozeAction(sql, staff, id, { until: "2026-10-21", reason: " " }, TODAY)).rejects.toThrow(
			"Say why it is being put off. The reason is kept with it.",
		);
		const snoozed = await snoozeAction(
			sql,
			staff,
			id,
			{ until: "2026-10-21", reason: "Waiting for the replacement ribbon" },
			TODAY,
		);
		expect(snoozed).toMatchObject({
			snoozedUntil: "2026-10-21",
			snoozeReason: "Waiting for the replacement ribbon",
		});
		const titles = async (day: string) =>
			(await listOpenActions(sql, { today: day })).map((item) => item.title);
		expect(await titles(TODAY)).not.toContain("Check the label printer");
		expect(await titles("2026-10-20")).not.toContain("Check the label printer");
		expect(await titles("2026-10-21")).toContain("Check the label printer");
		// It is still open, and still listed when nothing is being hidden.
		expect((await listOpenActions(sql)).map((item) => item.title)).toContain("Check the label printer");
	});

	it("closes an item only with a note of what was done, and can't close it twice", async () => {
		const shelf = (await listOpenActions(sql)).find((item) => item.title === "Tidy the receiving shelf");
		const id = shelf?.id ?? "";
		await expect(closeAction(sql, staff, id, { outcome: "done", note: "" })).rejects.toThrow(
			"Say what was done. The note is kept with it.",
		);
		const done = await closeAction(sql, staff, id, { outcome: "done", note: "Cleared and relabelled." });
		expect(done).toMatchObject({
			status: "done",
			closingNote: "Cleared and relabelled.",
			closedBy: "operator:staff-1",
		});
		await expect(closeAction(sql, staff, id, { outcome: "done", note: "Again" })).rejects.toThrow(
			"That action has already been closed.",
		);
		await expect(updateAction(sql, staff, id, { priority: "high" })).rejects.toThrow(
			"That action has already been closed.",
		);
		const lease = (await listOpenActions(sql)).find((item) => item.title === "Sign the lease renewal");
		await expect(
			closeAction(sql, owner, lease?.id ?? "", { outcome: "dismissed", note: "" }),
		).rejects.toThrow("Say why it is being dismissed.");
		await closeAction(sql, owner, lease?.id ?? "", {
			outcome: "dismissed",
			note: "The landlord withdrew the renewal.",
		});
		expect((await listClosedActions(sql)).map((item) => [item.title, item.status]).sort()).toEqual([
			["Sign the lease renewal", "dismissed"],
			["Tidy the receiving shelf", "done"],
		]);
	});

	it("is protected by the database: only a person, and a closed item says who and what", async () => {
		await expect(
			sql.query(`insert into wai_action_items (title, created_by) values ('From an agent', 'agent:nexus')`),
		).rejects.toThrow();
		const open = (await listOpenActions(sql))[0];
		await expect(
			sql.query(`update wai_action_items set status = 'done' where id = $1`, [open.id]),
		).rejects.toThrow();
		await expect(
			sql.query(`update wai_action_items set snoozed_until = '2026-12-01' where id = $1`, [open.id]),
		).rejects.toThrow();
	});
});

describe("tracking a line of a daily report", () => {
	it("makes one checklist item for one thing, however often it is tracked, and closing it changes nothing else", async () => {
		const db = await freshDb();
		try {
			// A result waiting for review gives the report something to list.
			const deps = workflowDeps(db, null, env);
			const sample = FUNCTIONS.get("vault.settlement-match")?.sample?.() ?? {};
			const asked = await requestFunction(deps, staff, "vault.settlement-match", sample, {
				lookup: lookupFunction,
			});
			await runFunction(deps, asked.task.id, { lookup: lookupFunction });
			const generate = (at: string, again = false) =>
				generateDailyReport(
					{ sql: db, config: readConfig(env), env, now: () => new Date(at) },
					{ kind: "morning", actor: owner, again },
				);
			const first = (await generate(new Date(Date.now() + 60_000).toISOString())).report;
			const index = first.report?.actions.findIndex((action) => action.title.startsWith("Review: ")) ?? -1;
			expect(index).toBeGreaterThanOrEqual(0);

			const tracked = await trackReportAction(db, staff, { reportId: first.id, index });
			expect(tracked.created).toBe(true);
			expect(tracked.item).toMatchObject({
				source: "report",
				reportId: first.id,
				priority: "normal",
				assignedTo: null,
			});
			expect(tracked.item.title).toMatch(/^Review: /);
			expect(tracked.item.detail).toContain("1. Open the result.");
			expect(tracked.item.links.map((link) => link.label)).toEqual([
				"Result",
				`Task ${asked.task.id.slice(0, 8)}`,
			]);

			// Tracked again from the same report, and from a later report describing the same thing: still one item.
			expect((await trackReportAction(db, owner, { reportId: first.id, index })).created).toBe(false);
			const later = (await generate(new Date(Date.now() + 120_000).toISOString(), true)).report;
			const again = await trackReportAction(db, owner, {
				reportId: later.id,
				index: later.report?.actions.findIndex((action) => action.title.startsWith("Review: ")) ?? -1,
			});
			expect(again.created).toBe(false);
			expect(again.item.id).toBe(tracked.item.id);
			expect(await listOpenActions(db)).toHaveLength(1);

			// Ticking the item off does not accept the result or complete the task. They are exactly as they were.
			await closeAction(db, staff, tracked.item.id, { outcome: "done", note: "Looked at it." });
			expect((await getTask(db, asked.task.id))?.state).toBe("needs_review");
			expect((await getProductByTask(db, asked.task.id))?.reviewState).toBe("pending");
			const next = (await generate(new Date(Date.now() + 180_000).toISOString(), true)).report;
			expect(next.report?.actions.some((action) => action.title.startsWith("Review: "))).toBe(true);

			await expect(trackReportAction(db, staff, { reportId: first.id, index: 99 })).rejects.toThrow(
				"That line of the report doesn't exist.",
			);
		} finally {
			await db.close();
		}
	});
});
