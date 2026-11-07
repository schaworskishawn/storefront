import { audit } from "../audit";
import { iso, type Row, type Sql } from "../db/sql";
import { listPackagingRuns } from "../lab/finished";
import { actorKey, type OperatorActor } from "../types";
import { ComplianceError, day, ownerOnly, requiredDay, tidy } from "./common";

/**
 * The excise stamp ledger: the stamps the business has received, and every thing a person did with them.
 *
 * Each receipt is a stock of stamps, with the jurisdiction and licensee they were issued for, the document they came with,
 * and their printed identifiers when they carry a run of them. Every stamp in a stock is counted in exactly one state:
 * available, reserved, applied, damaged, returned, disposed, or lost, and the counts always add up to what was received.
 * Each event moves stamps from one state to another and is never changed afterwards.
 *
 * What it guards: identifiers can't be received twice or applied twice; more stamps can't be applied to a packaging run
 * than it filled units; a damaged stamp stays damaged until a return or a disposal is recorded, and a disposal needs the
 * owner, the authorization it was done under and the evidence that it happened. A loss stays open until stamps are found.
 *
 * What it doesn't do: order, make, reproduce or dispose of a stamp, or decide which products need one. Recording a disposal
 * here records that a person did it; it doesn't do it.
 */

export const STAMP_STATES = {
	available: "Available",
	reserved: "Reserved",
	applied: "Applied",
	damaged: "Damaged",
	returned: "Returned",
	disposed: "Disposed of",
	lost: "Lost, not found",
} as const;
export type StampState = keyof typeof STAMP_STATES;

type Action = {
	label: string;
	from: readonly StampState[];
	to: StampState;
	needs?: { reason?: true; evidence?: true; authorization?: true; run?: true };
	ownerOnly?: true;
};

/** What a person can record, which states it takes stamps from, and where it puts them. */
export const STAMP_ACTIONS = {
	reserved: { label: "Reserve for a packaging run", from: ["available"], to: "reserved" },
	unreserved: { label: "Release a reservation", from: ["reserved"], to: "available" },
	applied: {
		label: "Apply to a packaging run",
		from: ["available", "reserved"],
		to: "applied",
		needs: { run: true },
	},
	damaged: {
		label: "Record damage",
		from: ["available", "reserved"],
		to: "damaged",
		needs: { reason: true },
	},
	returned: {
		label: "Record a return",
		from: ["damaged", "available"],
		to: "returned",
		needs: { evidence: true },
	},
	disposed: {
		label: "Record a disposal",
		from: ["damaged"],
		to: "disposed",
		needs: { authorization: true, evidence: true },
		ownerOnly: true,
	},
	lost: { label: "Record a loss", from: ["available"], to: "lost", needs: { reason: true } },
	found: { label: "Record lost stamps found", from: ["lost"], to: "available", needs: { reason: true } },
} as const satisfies Record<string, Action>;
export type StampAction = keyof typeof STAMP_ACTIONS;

export type StampStock = {
	id: string;
	code: string;
	jurisdiction: string;
	authorizedEntity: string;
	sourceDocument: string;
	serialPrefix: string;
	serialFrom: number | null;
	serialTo: number | null;
	quantity: number;
	receivedOn: string;
	location: string;
	counts: Record<StampState, number>;
	receivedBy: string;
	receivedAt: string;
};

export type StampEvent = {
	id: string;
	stockId: string;
	kind: StampAction | "received" | "moved";
	quantity: number;
	fromState: StampState | null;
	toState: StampState | null;
	serialFrom: number | null;
	serialTo: number | null;
	packagingRunId: string | null;
	packagingRunCode: string | null;
	location: string | null;
	authorization: string | null;
	evidence: string | null;
	reason: string | null;
	actor: string;
	at: string;
};

const STOCK_COLUMNS = `id, code, jurisdiction, authorized_entity, source_document, serial_prefix, serial_from, serial_to,
	quantity, received_on, location, available, reserved, applied, damaged, returned, disposed, lost, received_by, received_at`;
const EVENT_COLUMNS = `e.id, e.stock_id, e.kind, e.quantity, e.from_state, e.to_state, e.serial_from, e.serial_to,
	e.packaging_run_id, p.code as packaging_run_code, e.location, e.authorization_ref, e.evidence, e.reason, e.actor, e.at`;

const big = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

const toStock = (r: Row): StampStock => ({
	id: r.id as string,
	code: r.code as string,
	jurisdiction: r.jurisdiction as string,
	authorizedEntity: r.authorized_entity as string,
	sourceDocument: r.source_document as string,
	serialPrefix: r.serial_prefix as string,
	serialFrom: big(r.serial_from),
	serialTo: big(r.serial_to),
	quantity: Number(r.quantity),
	receivedOn: day(r.received_on) as string,
	location: r.location as string,
	counts: {
		available: Number(r.available),
		reserved: Number(r.reserved),
		applied: Number(r.applied),
		damaged: Number(r.damaged),
		returned: Number(r.returned),
		disposed: Number(r.disposed),
		lost: Number(r.lost),
	},
	receivedBy: r.received_by as string,
	receivedAt: iso(r.received_at) as string,
});

const toEvent = (r: Row): StampEvent => ({
	id: r.id as string,
	stockId: r.stock_id as string,
	kind: r.kind as StampEvent["kind"],
	quantity: Number(r.quantity),
	fromState: (r.from_state as StampState | null) ?? null,
	toState: (r.to_state as StampState | null) ?? null,
	serialFrom: big(r.serial_from),
	serialTo: big(r.serial_to),
	packagingRunId: (r.packaging_run_id as string | null) ?? null,
	packagingRunCode: (r.packaging_run_code as string | null) ?? null,
	location: (r.location as string | null) ?? null,
	authorization: (r.authorization_ref as string | null) ?? null,
	evidence: (r.evidence as string | null) ?? null,
	reason: (r.reason as string | null) ?? null,
	actor: r.actor as string,
	at: iso(r.at) as string,
});

/** A printed number, as typed. Up to fifteen digits, so it stays exact. */
function serial(label: string, value: unknown): number | null {
	const text = tidy(value, 20).replace(/[\s,]/g, "");
	if (!text) return null;
	if (!/^\d{1,15}$/.test(text))
		throw new ComplianceError("invalid", `${label} must be the printed number, digits only.`);
	return Number(text);
}

function count(label: string, value: unknown): number | null {
	const text = tidy(value, 12);
	if (!text) return null;
	if (!/^\d{1,7}$/.test(text) || Number(text) < 1)
		throw new ComplianceError("invalid", `${label} must be a whole number of stamps, at least 1.`);
	return Number(text);
}

/** The first and last identifier and how many that is, when a run of identifiers was entered. */
function range(fromValue: unknown, toValue: unknown, quantityValue: unknown) {
	const from = serial("The first identifier", fromValue);
	const to = serial("The last identifier", toValue);
	const quantity = count("The number of stamps", quantityValue);
	if ((from === null) !== (to === null))
		throw new ComplianceError("invalid", "Enter both the first and the last identifier, or neither.");
	if (from !== null && to !== null) {
		if (to < from) throw new ComplianceError("invalid", "The last identifier can't come before the first.");
		const span = to - from + 1;
		if (quantity !== null && quantity !== span)
			throw new ComplianceError(
				"invalid",
				`${from} to ${to} is ${span} stamps, not ${quantity}. Check the identifiers and the count.`,
			);
		if (span > 9_999_999)
			throw new ComplianceError("invalid", "That is more stamps than one record can hold.");
		return { from, to, quantity: span };
	}
	if (quantity === null) throw new ComplianceError("invalid", "Enter how many stamps.");
	return { from: null, to: null, quantity };
}

const overlaps = (a: { from: number; to: number }, b: { from: number; to: number }) =>
	a.from <= b.to && b.from <= a.to;

export type NewStampStock = {
	jurisdiction: string;
	authorizedEntity: string;
	sourceDocument: string;
	serialPrefix?: string;
	serialFrom?: string;
	serialTo?: string;
	quantity?: string;
	receivedOn: string;
	location: string;
	idempotencyKey: string;
};

/**
 * Records stamps received. A run of identifiers already received for the same jurisdiction and prefix is refused, so the
 * same stamps can't be counted twice; the same request sent again records nothing new.
 */
export async function receiveStamps(
	sql: Sql,
	actor: OperatorActor,
	input: NewStampStock,
): Promise<StampStock> {
	const key = tidy(input.idempotencyKey, 120);
	if (!key)
		throw new ComplianceError("invalid", "The request is missing its key. Reload the page and try again.");
	const again = await sql.query(`select ${STOCK_COLUMNS} from wai_stamp_stocks where idempotency_key = $1`, [
		key,
	]);
	if (again.rows[0]) return toStock(again.rows[0]);
	const jurisdiction = tidy(input.jurisdiction, 120);
	if (!jurisdiction)
		throw new ComplianceError("invalid", "Say which jurisdiction the stamps were issued for.");
	const authorizedEntity = tidy(input.authorizedEntity, 200);
	if (!authorizedEntity)
		throw new ComplianceError("invalid", "Say which licensee the stamps were issued to.");
	const sourceDocument = tidy(input.sourceDocument, 300);
	if (!sourceDocument) throw new ComplianceError("invalid", "Name the document the stamps came with.");
	const location = tidy(input.location, 200);
	if (!location) throw new ComplianceError("invalid", "Say where the stamps are kept.");
	const receivedOn = requiredDay("The date they were received", input.receivedOn);
	const prefix = tidy(input.serialPrefix, 20).toUpperCase();
	const run = range(input.serialFrom, input.serialTo, input.quantity);
	if (prefix && run.from === null)
		throw new ComplianceError(
			"invalid",
			"A prefix goes with a run of identifiers. Enter the first and last as well.",
		);
	const stock = await sql.transaction(async (tx) => {
		if (run.from !== null && run.to !== null) {
			const clash = await tx.query(
				`select code, serial_from, serial_to from wai_stamp_stocks
				 where lower(jurisdiction) = lower($1) and serial_prefix = $2 and serial_from <= $4 and serial_to >= $3 limit 1`,
				[jurisdiction, prefix, run.from, run.to],
			);
			if (clash.rows[0])
				throw new ComplianceError(
					"conflict",
					`Nothing was recorded. ${prefix}${run.from} to ${prefix}${run.to} overlaps ${clash.rows[0].code}, which was already received for ${jurisdiction}.`,
				);
		}
		const { rows: counted } = await tx.query<{ n: number }>(
			`select count(*)::int as n from wai_stamp_stocks where received_on = $1`,
			[receivedOn],
		);
		const code = `ST-${receivedOn.replaceAll("-", "")}-${String(Number(counted[0].n) + 1).padStart(2, "0")}`;
		const { rows } = await tx.query(
			`insert into wai_stamp_stocks (code, jurisdiction, authorized_entity, source_document, serial_prefix, serial_from,
				serial_to, quantity, received_on, location, available, idempotency_key, received_by)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$8,$11,$12) returning ${STOCK_COLUMNS}`,
			[
				code,
				jurisdiction,
				authorizedEntity,
				sourceDocument,
				prefix,
				run.from,
				run.to,
				run.quantity,
				receivedOn,
				location,
				key,
				actorKey(actor),
			],
		);
		const made = toStock(rows[0]);
		await tx.query(
			`insert into wai_stamp_events (stock_id, kind, quantity, to_state, serial_from, serial_to, location, evidence,
				idempotency_key, actor)
			 values ($1, 'received', $2, 'available', $3, $4, $5, $6, $7, $8)`,
			[
				made.id,
				made.quantity,
				run.from,
				run.to,
				location,
				sourceDocument,
				`${key}:received`,
				actorKey(actor),
			],
		);
		return made;
	});
	await audit(sql, {
		actor,
		action: "compliance.stamps.receive",
		subject: stock.id,
		outcome: "allowed",
		detail: { code: stock.code, jurisdiction, quantity: stock.quantity, source: sourceDocument },
	});
	return stock;
}

async function stockById(sql: Sql, id: string, lock = false): Promise<StampStock> {
	const { rows } = await sql.query(
		`select ${STOCK_COLUMNS} from wai_stamp_stocks where id = $1 ${lock ? "for update" : ""}`,
		[tidy(id, 60)],
	);
	if (!rows[0]) throw new ComplianceError("not_found", "Those stamps aren't in the ledger.");
	return toStock(rows[0]);
}

export type StampMove = {
	stockId: string;
	kind: string;
	/** Which state the stamps come from, when the action can take them from more than one. */
	from?: string;
	quantity?: string;
	serialFrom?: string;
	serialTo?: string;
	packagingRunId?: string;
	authorization?: string;
	evidence?: string;
	reason?: string;
	idempotencyKey: string;
};

/** Records one thing a person did with stamps. The same request sent again records nothing new. */
export async function recordStampEvent(
	sql: Sql,
	actor: OperatorActor,
	input: StampMove,
): Promise<StampEvent> {
	const kind = (Object.keys(STAMP_ACTIONS) as StampAction[]).find((k) => k === input.kind);
	if (!kind) throw new ComplianceError("invalid", "Choose what was done with the stamps.");
	const action: Action = STAMP_ACTIONS[kind];
	if (action.ownerOnly)
		await ownerOnly(
			sql,
			actor,
			`compliance.stamps.${kind}`,
			tidy(input.stockId, 60),
			"Only the owner can record a disposal of stamps.",
		);
	const key = tidy(input.idempotencyKey, 120);
	if (!key)
		throw new ComplianceError("invalid", "The request is missing its key. Reload the page and try again.");
	const again = await sql.query(
		`select ${EVENT_COLUMNS} from wai_stamp_events e left join wai_packaging_runs p on p.id = e.packaging_run_id
		 where e.idempotency_key = $1`,
		[key],
	);
	if (again.rows[0]) return toEvent(again.rows[0]);
	const from = (action.from as readonly string[]).find(
		(state) => state === (input.from || action.from[0]),
	) as StampState | undefined;
	if (!from)
		throw new ComplianceError(
			"invalid",
			`${action.label} takes stamps that are ${action.from.map((s) => STAMP_STATES[s].toLowerCase()).join(" or ")}.`,
		);
	const reason = tidy(input.reason, 1000) || null;
	const evidence = tidy(input.evidence, 1000) || null;
	const authorization = tidy(input.authorization, 300) || null;
	if (action.needs?.reason && !reason) throw new ComplianceError("invalid", "Say what happened.");
	if (action.needs?.evidence && !evidence)
		throw new ComplianceError("invalid", "Say what shows it happened.");
	if (action.needs?.authorization && !authorization)
		throw new ComplianceError(
			"invalid",
			"Name the authorization the disposal was done under. A damaged stamp isn't disposed of until that is recorded.",
		);
	const runId = tidy(input.packagingRunId, 60) || null;
	if (action.needs?.run && !runId)
		throw new ComplianceError("invalid", "Choose the packaging run the stamps went on.");
	const event = await sql.transaction(async (tx) => {
		const stock = await stockById(tx, input.stockId, true);
		const span = range(input.serialFrom, input.serialTo, input.quantity);
		if (span.from !== null) {
			if (kind !== "applied")
				throw new ComplianceError(
					"invalid",
					"Identifiers are recorded when stamps are applied. Enter a count here.",
				);
			if (stock.serialFrom === null || stock.serialTo === null)
				throw new ComplianceError(
					"invalid",
					"These stamps were received without identifiers. Enter a count.",
				);
		}
		if (kind === "applied" && stock.serialFrom !== null && stock.serialTo !== null) {
			if (span.from === null || span.to === null)
				throw new ComplianceError(
					"invalid",
					"These stamps carry identifiers. Enter the first and last one applied, so none can be applied twice.",
				);
			const inside = { from: stock.serialFrom, to: stock.serialTo };
			if (span.from < inside.from || span.to > inside.to)
				throw new ComplianceError(
					"invalid",
					`${stock.serialPrefix}${span.from} to ${stock.serialPrefix}${span.to} isn't within this stock's ${stock.serialPrefix}${inside.from} to ${stock.serialPrefix}${inside.to}.`,
				);
			const used = await tx.query(
				`select serial_from, serial_to from wai_stamp_events where stock_id = $1 and kind = 'applied' and serial_from is not null`,
				[stock.id],
			);
			const clash = used.rows.find((r) =>
				overlaps(
					{ from: span.from as number, to: span.to as number },
					{ from: Number(r.serial_from), to: Number(r.serial_to) },
				),
			);
			if (clash)
				throw new ComplianceError(
					"conflict",
					`Nothing was recorded. Some of ${stock.serialPrefix}${span.from} to ${stock.serialPrefix}${span.to} were already applied (${stock.serialPrefix}${Number(clash.serial_from)} to ${stock.serialPrefix}${Number(clash.serial_to)}).`,
				);
		}
		if (stock.counts[from] < span.quantity)
			throw new ComplianceError(
				"conflict",
				`Only ${stock.counts[from]} of these stamps are ${STAMP_STATES[from].toLowerCase()}, not ${span.quantity}.`,
			);
		let runCode: string | null = null;
		if (runId) {
			const run = await tx.query(
				`select id, code, units_filled from wai_packaging_runs where id = $1 for update`,
				[runId],
			);
			if (!run.rows[0]) throw new ComplianceError("not_found", "That packaging run doesn't exist.");
			runCode = run.rows[0].code as string;
			if (kind === "applied") {
				const { rows: applied } = await tx.query<{ n: number }>(
					`select coalesce(sum(quantity), 0)::int as n from wai_stamp_events where packaging_run_id = $1 and kind = 'applied'`,
					[runId],
				);
				const units = Number(run.rows[0].units_filled);
				if (Number(applied[0].n) + span.quantity > units)
					throw new ComplianceError(
						"conflict",
						`${runCode} filled ${units} units and already has ${Number(applied[0].n)} stamps applied. ${span.quantity} more would be more stamps than units.`,
					);
			}
		}
		const to = action.to;
		await tx.query(`update wai_stamp_stocks set ${from} = ${from} - $2, ${to} = ${to} + $2 where id = $1`, [
			stock.id,
			span.quantity,
		]);
		const { rows } = await tx.query(
			`insert into wai_stamp_events (stock_id, kind, quantity, from_state, to_state, serial_from, serial_to,
				packaging_run_id, authorization_ref, evidence, reason, idempotency_key, actor)
			 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
			[
				stock.id,
				kind,
				span.quantity,
				from,
				to,
				span.from,
				span.to,
				runId,
				authorization,
				evidence,
				reason,
				key,
				actorKey(actor),
			],
		);
		return { id: rows[0].id as string, stock, runCode, quantity: span.quantity };
	});
	await audit(sql, {
		actor,
		action: `compliance.stamps.${kind}`,
		subject: event.stock.id,
		outcome: "allowed",
		detail: { code: event.stock.code, quantity: event.quantity, from, run: event.runCode },
	});
	const { rows } = await sql.query(
		`select ${EVENT_COLUMNS} from wai_stamp_events e left join wai_packaging_runs p on p.id = e.packaging_run_id where e.id = $1`,
		[event.id],
	);
	return toEvent(rows[0]);
}

/** Records that stamps were moved to another place. Their counts don't change. */
export async function moveStamps(
	sql: Sql,
	actor: OperatorActor,
	input: { stockId: string; location: string; reason?: string; idempotencyKey: string },
): Promise<StampStock> {
	const key = tidy(input.idempotencyKey, 120);
	if (!key)
		throw new ComplianceError("invalid", "The request is missing its key. Reload the page and try again.");
	const location = tidy(input.location, 200);
	if (!location) throw new ComplianceError("invalid", "Say where they are now.");
	const moved = await sql.transaction(async (tx) => {
		const again = await tx.query(`select stock_id from wai_stamp_events where idempotency_key = $1`, [key]);
		if (again.rows[0]) return stockById(tx, again.rows[0].stock_id as string);
		const stock = await stockById(tx, input.stockId, true);
		if (stock.location === location) throw new ComplianceError("invalid", `They are already at ${location}.`);
		await tx.query(`update wai_stamp_stocks set location = $2 where id = $1`, [stock.id, location]);
		await tx.query(
			`insert into wai_stamp_events (stock_id, kind, quantity, location, reason, idempotency_key, actor)
			 values ($1, 'moved', 0, $2, $3, $4, $5)`,
			[stock.id, location, tidy(input.reason, 500) || null, key, actorKey(actor)],
		);
		return { ...stock, location };
	});
	await audit(sql, {
		actor,
		action: "compliance.stamps.move",
		subject: moved.id,
		outcome: "allowed",
		detail: { code: moved.code, location },
	});
	return moved;
}

export async function listStampStocks(sql: Sql): Promise<StampStock[]> {
	const { rows } = await sql.query(
		`select ${STOCK_COLUMNS} from wai_stamp_stocks order by received_on desc, code desc limit 500`,
	);
	return rows.map(toStock);
}

export async function getStampStock(
	sql: Sql,
	id: string,
): Promise<{ stock: StampStock; events: StampEvent[] } | null> {
	const found = await sql.query(`select ${STOCK_COLUMNS} from wai_stamp_stocks where id = $1`, [
		tidy(id, 60),
	]);
	if (!found.rows[0]) return null;
	const { rows } = await sql.query(
		`select ${EVENT_COLUMNS} from wai_stamp_events e left join wai_packaging_runs p on p.id = e.packaging_run_id
		 where e.stock_id = $1 order by e.at desc, e.id desc`,
		[found.rows[0].id],
	);
	return { stock: toStock(found.rows[0]), events: rows.map(toEvent) };
}

/** What a stock's counts should be, from its events alone. Pure. */
export function replayStampEvents(events: readonly StampEvent[]): Record<StampState, number> {
	const counts: Record<StampState, number> = {
		available: 0,
		reserved: 0,
		applied: 0,
		damaged: 0,
		returned: 0,
		disposed: 0,
		lost: 0,
	};
	for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
		if (event.fromState) counts[event.fromState] -= event.quantity;
		if (event.toState) counts[event.toState] += event.quantity;
	}
	return counts;
}

export type StampReconciliation = {
	byJurisdiction: Array<{ jurisdiction: string; received: number; counts: Record<StampState, number> }>;
	/** Packaging runs with stamps applied, and how that compares with what they filled. */
	runs: Array<{
		id: string;
		code: string;
		sku: string;
		unitsFilled: number;
		unitsRejected: number;
		applied: number;
	}>;
	/** Packaging runs with no stamps recorded. Whether their product needs stamps isn't decided here. */
	unstamped: Array<{ id: string; code: string; sku: string; unitsFilled: number }>;
	exceptions: Array<{ stockId: string; code: string; kind: "lost" | "damaged" | "ledger"; detail: string }>;
};

export async function stampReconciliation(sql: Sql): Promise<StampReconciliation> {
	const stocks = await listStampStocks(sql);
	const { rows: eventRows } = await sql.query(
		`select ${EVENT_COLUMNS} from wai_stamp_events e left join wai_packaging_runs p on p.id = e.packaging_run_id
		 order by e.at limit 20000`,
	);
	const events = eventRows.map(toEvent);
	const byJurisdiction = new Map<
		string,
		{ jurisdiction: string; received: number; counts: Record<StampState, number> }
	>();
	const exceptions: StampReconciliation["exceptions"] = [];
	for (const stock of stocks) {
		const keyName = stock.jurisdiction.toLowerCase();
		const entry = byJurisdiction.get(keyName) ?? {
			jurisdiction: stock.jurisdiction,
			received: 0,
			counts: { available: 0, reserved: 0, applied: 0, damaged: 0, returned: 0, disposed: 0, lost: 0 },
		};
		entry.received += stock.quantity;
		for (const state of Object.keys(entry.counts) as StampState[]) entry.counts[state] += stock.counts[state];
		byJurisdiction.set(keyName, entry);
		if (stock.counts.lost)
			exceptions.push({
				stockId: stock.id,
				code: stock.code,
				kind: "lost",
				detail: `${stock.counts.lost} lost and not found.`,
			});
		if (stock.counts.damaged)
			exceptions.push({
				stockId: stock.id,
				code: stock.code,
				kind: "damaged",
				detail: `${stock.counts.damaged} damaged, with no return or disposal recorded.`,
			});
		const replayed = replayStampEvents(events.filter((event) => event.stockId === stock.id));
		const off = (Object.keys(replayed) as StampState[]).filter(
			(state) => replayed[state] !== stock.counts[state],
		);
		if (off.length)
			exceptions.push({
				stockId: stock.id,
				code: stock.code,
				kind: "ledger",
				detail: `The counts don't match the ledger for: ${off.map((s) => STAMP_STATES[s].toLowerCase()).join(", ")}.`,
			});
	}
	const appliedByRun = new Map<string, number>();
	for (const event of events)
		if (event.kind === "applied" && event.packagingRunId)
			appliedByRun.set(event.packagingRunId, (appliedByRun.get(event.packagingRunId) ?? 0) + event.quantity);
	const runs = await listPackagingRuns(sql);
	return {
		byJurisdiction: [...byJurisdiction.values()].sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction)),
		runs: runs
			.filter((run) => appliedByRun.has(run.id))
			.map((run) => ({
				id: run.id,
				code: run.code,
				sku: run.sku,
				unitsFilled: run.unitsFilled,
				unitsRejected: run.unitsRejected,
				applied: appliedByRun.get(run.id) ?? 0,
			})),
		unstamped: runs
			.filter((run) => !appliedByRun.has(run.id))
			.map((run) => ({ id: run.id, code: run.code, sku: run.sku, unitsFilled: run.unitsFilled })),
		exceptions,
	};
}
