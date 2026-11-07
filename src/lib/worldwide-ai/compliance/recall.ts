import { audit } from "../audit";
import { iso, json, type Row, type Sql } from "../db/sql";
import { sha256Hex } from "../hash";
import { insertHold } from "../lab/bulk";
import { actorKey, type OperatorActor } from "../types";
import { ComplianceError, ownerOnly, tidy } from "./common";

/**
 * Recall tracing: from an ingredient lot, a batch or a packaging run, everything the records link it to. Lots go into
 * batches through their allocations, batches are packaged in runs, and packaging lots (bottles, labels) go into runs as
 * components. The trace follows those links in both directions and nothing else, and says what it can't see.
 *
 * What it can't see is said every time: where packaged units went. Orders and shipments in the store aren't linked to
 * packaging runs, so the trace can't list customers or retailers, and no notice is sent to anyone.
 *
 * A trace can be saved, as it stood, as a recall check. The owner can also hold every batch it reaches, which stops them
 * being packaged or released until the holds are lifted. Deciding on a recall is a person's, outside this workspace.
 */

export const START_KINDS = {
	ingredient_lot: "An ingredient or packaging lot",
	batch: "A batch",
	packaging_run: "A packaging run",
} as const;
export type StartKind = keyof typeof START_KINDS;

export type TracedLot = {
	id: string;
	code: string;
	ingredientId: string;
	ingredient: string;
	unit: string;
	status: string;
	/** How it was used, in its own unit: what batches used of it, or what runs took of it as a component. */
	uses: Array<{
		into: string;
		quantity: string | null;
		basis: "used" | "reserved, not yet used" | "component";
	}>;
};

export type TracedBatch = {
	id: string;
	code: string;
	status: string;
	qualityStatus: string;
	yieldMl: string | null;
	bulkRemainingMl: string | null;
	openHolds: number;
};

export type TracedRun = {
	id: string;
	code: string;
	batchCode: string;
	sku: string;
	unitsFilled: number;
	unitsRejected: number;
	labelVersion: string;
	stampsApplied: number;
	runAt: string;
};

export type RecallTrace = {
	start: { kind: StartKind; id: string; label: string };
	lots: TracedLot[];
	batches: TracedBatch[];
	runs: TracedRun[];
	totals: { batches: number; runs: number; unitsFilled: number };
	/** What the records don't show. Always at least where packaged units went. */
	gaps: string[];
};

export const NOT_LINKED =
	"Where packaged units went is not recorded here. Orders and shipments in the store aren't linked to packaging runs, so this trace can't list customers, retailers or what is still in stock. Find those from the store's own records, by SKU and packaging date.";

type RunRow = {
	id: string;
	code: string;
	batchId: string;
	batchCode: string;
	sku: string;
	unitsFilled: number;
	unitsRejected: number;
	labelVersion: string;
	runAt: string;
	components: Array<{ lotId: string; lotCode: string; ingredient: string; quantity: string }>;
};

const toRunRow = (r: Row): RunRow => ({
	id: r.id as string,
	code: r.code as string,
	batchId: r.batch_id as string,
	batchCode: r.batch_code as string,
	sku: r.sku as string,
	unitsFilled: Number(r.units_filled),
	unitsRejected: Number(r.units_rejected),
	labelVersion: r.label_version as string,
	runAt: iso(r.run_at) as string,
	components: (r.components as RunRow["components"]) ?? [],
});

const RUN_SELECT = `select p.id, p.code, p.batch_id, b.code as batch_code, p.sku, p.units_filled, p.units_rejected,
	p.label_version, p.run_at, p.components from wai_packaging_runs p join wai_batches b on b.id = p.batch_id`;

const LOT_SELECT = `select l.id, l.lot_code, l.unit, l.status, i.id as ingredient_id, i.name as ingredient
	from wai_ingredient_lots l join wai_ingredients i on i.id = l.ingredient_id`;

/** Follows the records from one starting point. Reads only. */
export async function traceRecall(sql: Sql, kind: string, startId: string): Promise<RecallTrace> {
	const id = tidy(startId, 60);
	if (!(kind in START_KINDS)) throw new ComplianceError("invalid", "Choose what the trace starts from.");
	if (!/^[0-9a-f-]{36}$/i.test(id))
		throw new ComplianceError("invalid", "Choose what the trace starts from.");
	const start = kind as StartKind;
	const gaps: string[] = [];
	const batchIds = new Set<string>();
	const runs = new Map<string, RunRow>();
	const lotUses = new Map<string, TracedLot["uses"]>();
	const addUse = (lotId: string, entry: TracedLot["uses"][number]) =>
		lotUses.set(lotId, [...(lotUses.get(lotId) ?? []), entry]);
	let label = "";

	const addRuns = (rows: Row[]) => {
		for (const row of rows) {
			const run = toRunRow(row);
			runs.set(run.id, run);
			batchIds.add(run.batchId);
		}
	};

	if (start === "ingredient_lot") {
		const lot = await sql.query(`${LOT_SELECT} where l.id = $1`, [id]);
		if (!lot.rows[0]) throw new ComplianceError("not_found", "That lot doesn't exist.");
		label = `${lot.rows[0].ingredient as string}, lot ${lot.rows[0].lot_code as string}`;
		// Downstream: the batches that used or are set to use it, and the runs that took it as a component.
		const allocations = await sql.query(
			`select a.batch_id, b.code, b.status, a.used_quantity::text as used, a.reserved_quantity::text as reserved,
				a.release_movement_id is not null as released
			 from wai_batch_allocations a join wai_batches b on b.id = a.batch_id where a.lot_id = $1`,
			[id],
		);
		// The batches that hold the lot's own liquid. A run that only took the lot as a component affects that run alone,
		// not the other runs of its batch.
		const liquid = new Set<string>();
		for (const a of allocations.rows) {
			if (a.status === "cancelled" || (a.released && a.used === null)) continue;
			batchIds.add(a.batch_id as string);
			liquid.add(a.batch_id as string);
			addUse(id, {
				into: a.code as string,
				quantity: (a.used as string | null) ?? (a.reserved as string),
				basis: a.used === null ? "reserved, not yet used" : "used",
			});
		}
		addRuns((await sql.query(`${RUN_SELECT} where p.components @> $1::jsonb`, [json([{ lotId: id }])])).rows);
		if (liquid.size)
			addRuns((await sql.query(`${RUN_SELECT} where p.batch_id = any($1::uuid[])`, [[...liquid]])).rows);
	} else if (start === "batch") {
		const batch = await sql.query(`select id, code from wai_batches where id = $1`, [id]);
		if (!batch.rows[0]) throw new ComplianceError("not_found", "That batch doesn't exist.");
		label = `Batch ${batch.rows[0].code as string}`;
		batchIds.add(id);
		addRuns((await sql.query(`${RUN_SELECT} where p.batch_id = $1`, [id])).rows);
	} else {
		const run = await sql.query(`${RUN_SELECT} where p.id = $1`, [id]);
		if (!run.rows[0]) throw new ComplianceError("not_found", "That packaging run doesn't exist.");
		addRuns(run.rows);
		label = `Packaging run ${run.rows[0].code as string}`;
	}

	// Upstream: the lots every batch reached was made from, and the packaging lots in every run reached.
	if (start !== "ingredient_lot" && batchIds.size) {
		const allocations = await sql.query(
			`select a.lot_id, b.code, a.used_quantity::text as used, a.reserved_quantity::text as reserved,
				a.release_movement_id is not null as released
			 from wai_batch_allocations a join wai_batches b on b.id = a.batch_id where a.batch_id = any($1::uuid[])`,
			[[...batchIds]],
		);
		for (const a of allocations.rows) {
			if (a.released && a.used === null) continue;
			addUse(a.lot_id as string, {
				into: a.code as string,
				quantity: (a.used as string | null) ?? (a.reserved as string),
				basis: a.used === null ? "reserved, not yet used" : "used",
			});
		}
	}
	// From a lot the trace runs downstream only, so the other lots in the runs it reaches aren't listed.
	for (const run of runs.values())
		for (const component of run.components)
			if (start !== "ingredient_lot" || component.lotId === id)
				addUse(component.lotId, { into: run.code, quantity: component.quantity ?? null, basis: "component" });

	const lotRows = lotUses.size
		? (
				await sql.query(`${LOT_SELECT} where l.id = any($1::uuid[]) order by i.name, l.lot_code`, [
					[...lotUses.keys()],
				])
			).rows
		: [];
	const lots: TracedLot[] = lotRows.map((r) => ({
		id: r.id as string,
		code: r.lot_code as string,
		ingredientId: r.ingredient_id as string,
		ingredient: r.ingredient as string,
		unit: r.unit as string,
		status: r.status as string,
		uses: lotUses.get(r.id as string) ?? [],
	}));

	const batchRows = batchIds.size
		? (
				await sql.query(
					`select b.id, b.code, b.status, b.quality_status, b.actual_yield_ml::text as yield_ml,
						b.bulk_remaining_ml::text as bulk_ml,
						(select count(*) from wai_quality_holds h where h.batch_id = b.id and h.lifted_at is null)::int as open_holds
					 from wai_batches b where b.id = any($1::uuid[]) order by b.code`,
					[[...batchIds]],
				)
			).rows
		: [];
	const batches: TracedBatch[] = batchRows.map((r) => ({
		id: r.id as string,
		code: r.code as string,
		status: r.status as string,
		qualityStatus: r.quality_status as string,
		yieldMl: (r.yield_ml as string | null) ?? null,
		bulkRemainingMl: (r.bulk_ml as string | null) ?? null,
		openHolds: Number(r.open_holds),
	}));
	for (const batch of batches)
		if (batch.status !== "completed")
			gaps.push(
				`Batch ${batch.code} hasn't been made (${batch.status}), so nothing from it has been packaged yet.${
					start === "ingredient_lot" ? " It is set to use the lot this trace started from." : ""
				}`,
			);

	const stamps = runs.size
		? (
				await sql.query(
					`select packaging_run_id, coalesce(sum(quantity), 0)::int as n from wai_stamp_events
					 where kind = 'applied' and packaging_run_id = any($1::uuid[]) group by packaging_run_id`,
					[[...runs.keys()]],
				)
			).rows
		: [];
	const stamped = new Map(stamps.map((r) => [r.packaging_run_id as string, Number(r.n)]));
	const tracedRuns: TracedRun[] = [...runs.values()]
		.sort((a, b) => a.runAt.localeCompare(b.runAt) || a.code.localeCompare(b.code))
		.map((run) => ({
			id: run.id,
			code: run.code,
			batchCode: run.batchCode,
			sku: run.sku,
			unitsFilled: run.unitsFilled,
			unitsRejected: run.unitsRejected,
			labelVersion: run.labelVersion,
			stampsApplied: stamped.get(run.id) ?? 0,
			runAt: run.runAt,
		}));
	for (const run of runs.values())
		for (const component of run.components)
			if (lotUses.has(component.lotId) && !lots.some((lot) => lot.id === component.lotId))
				gaps.push(`${run.code} names a packaging lot that isn't in the lot records (${component.lotCode}).`);
	gaps.push(NOT_LINKED);

	return {
		start: { kind: start, id, label },
		lots,
		batches,
		runs: tracedRuns,
		totals: {
			batches: batches.length,
			runs: tracedRuns.length,
			unitsFilled: tracedRuns.reduce((sum, run) => sum + run.unitsFilled, 0),
		},
		gaps: [...new Set(gaps)],
	};
}

export type RecallCheck = {
	id: string;
	startKind: StartKind;
	startId: string;
	startLabel: string;
	reason: string;
	result: RecallTrace;
	resultSha256: string;
	holdsPlaced: number;
	runBy: string;
	runAt: string;
};

const CHECK_COLUMNS = `id, start_kind, start_id, start_label, reason, result, result_sha256, holds_placed, run_by, run_at`;

const toCheck = (r: Row): RecallCheck => ({
	id: r.id as string,
	startKind: r.start_kind as StartKind,
	startId: r.start_id as string,
	startLabel: r.start_label as string,
	reason: r.reason as string,
	result: r.result as RecallTrace,
	resultSha256: r.result_sha256 as string,
	holdsPlaced: Number(r.holds_placed),
	runBy: r.run_by as string,
	runAt: iso(r.run_at) as string,
});

/**
 * Saves a trace, as it stands now, as a recall check. With `hold`, the owner also holds every batch it reaches that isn't
 * already held or cancelled, in the same step, so the saved check and the holds agree.
 */
export async function saveRecallCheck(
	sql: Sql,
	actor: OperatorActor,
	input: { startKind: string; startId: string; reason: string; hold?: boolean },
): Promise<RecallCheck> {
	const reason = tidy(input.reason, 1000);
	if (!reason)
		throw new ComplianceError(
			"invalid",
			"Say why the trace is being run: a complaint, a supplier notice, a practice run.",
		);
	if (input.hold)
		await ownerOnly(
			sql,
			actor,
			"compliance.recall.hold",
			tidy(input.startId, 60),
			"Only the owner can hold everything a trace reaches.",
		);
	const check = await sql.transaction(async (tx) => {
		const trace = await traceRecall(tx, input.startKind, input.startId);
		const held = new Set<string>();
		if (input.hold)
			for (const batch of trace.batches) {
				if (batch.status === "cancelled" || batch.openHolds > 0) continue;
				await insertHold(
					tx,
					actor,
					batch.id,
					`Recall check from ${trace.start.label}: ${reason}`.slice(0, 500),
				);
				held.add(batch.id);
			}
		const placed = held.size;
		// What is saved includes the holds this check placed, so the record and the batches agree.
		const saved: RecallTrace = {
			...trace,
			batches: trace.batches.map((batch) =>
				held.has(batch.id) ? { ...batch, openHolds: batch.openHolds + 1 } : batch,
			),
		};
		const body = json(saved);
		const { rows } = await tx.query(
			`insert into wai_recall_checks (start_kind, start_id, start_label, reason, result, result_sha256, holds_placed, run_by)
			 values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8) returning ${CHECK_COLUMNS}`,
			[
				trace.start.kind,
				trace.start.id,
				trace.start.label,
				reason,
				body,
				sha256Hex(body),
				placed,
				actorKey(actor),
			],
		);
		return toCheck(rows[0]);
	});
	await audit(sql, {
		actor,
		action: input.hold ? "compliance.recall.hold" : "compliance.recall.save",
		subject: check.id,
		outcome: "allowed",
		detail: {
			start: check.startLabel,
			batches: check.result.totals.batches,
			runs: check.result.totals.runs,
			holds: check.holdsPlaced,
		},
	});
	return check;
}

export async function listRecallChecks(sql: Sql): Promise<RecallCheck[]> {
	const { rows } = await sql.query(
		`select ${CHECK_COLUMNS} from wai_recall_checks order by run_at desc limit 100`,
	);
	return rows.map(toCheck);
}

export async function getRecallCheck(sql: Sql, id: string): Promise<RecallCheck | null> {
	if (!/^[0-9a-f-]{36}$/i.test(tidy(id, 60))) return null;
	const { rows } = await sql.query(`select ${CHECK_COLUMNS} from wai_recall_checks where id = $1`, [
		tidy(id, 60),
	]);
	return rows[0] ? toCheck(rows[0]) : null;
}

/** What a trace can start from: the lots, batches and packaging runs on record, newest first. */
export async function recallStartingPoints(
	sql: Sql,
): Promise<Record<StartKind, Array<{ id: string; label: string }>>> {
	const [lots, batches, runs] = await Promise.all([
		sql.query(`${LOT_SELECT} order by l.created_at desc limit 300`),
		sql.query(
			`select id, code, status from wai_batches where status <> 'cancelled' order by planned_at desc limit 300`,
		),
		sql.query(`select id, code, sku from wai_packaging_runs order by run_at desc limit 300`),
	]);
	return {
		ingredient_lot: lots.rows.map((r) => ({
			id: r.id as string,
			label: `${r.ingredient as string}, lot ${r.lot_code as string}`,
		})),
		batch: batches.rows.map((r) => ({
			id: r.id as string,
			label: `${r.code as string} (${r.status as string})`,
		})),
		packaging_run: runs.rows.map((r) => ({
			id: r.id as string,
			label: `${r.code as string}, ${r.sku as string}`,
		})),
	};
}
