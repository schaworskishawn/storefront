import { audit } from "../audit";
import { iso, type Row, type Sql } from "../db/sql";
import { daysBetween } from "../time";
import { actorKey, type OperatorActor } from "../types";
import { getBatch } from "./batches";
import { insertHold } from "./bulk";
import { InventoryError } from "./inventory";

/**
 * Equipment, its calibrations, which batch it was used on, and cleaning and line-clearance records.
 *
 * What the workspace enforces from these records:
 * - Equipment that is out of service, has failed its last calibration, is overdue, or has no calibration on record when one
 *   is required can't be recorded against a batch.
 * - A failed calibration takes the equipment out of service and puts every batch measured with it since its last passing
 *   calibration on hold, in the same step. The workspace doesn't guess a shorter window: nothing says when it went wrong.
 * - Only the owner returns equipment to service, and not while its last calibration is a failure.
 *
 * These are records people typed in. Nothing here reads an instrument, controls a machine, or shows that a cleaning was
 * physically done.
 */

export class EquipmentError extends InventoryError {}

export const EQUIPMENT_KINDS = {
	scale: "Scale or balance",
	mixer: "Mixer",
	filler: "Filler",
	instrument: "Measuring instrument",
	other: "Other",
} as const;
export type EquipmentKind = keyof typeof EQUIPMENT_KINDS;

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";
const day = (value: unknown): string | null =>
	value === null || value === undefined
		? null
		: value instanceof Date
			? value.toISOString().slice(0, 10)
			: String(value).slice(0, 10);

function calendarDay(label: string, value: unknown): string {
	const text = tidy(value, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)))
		throw new EquipmentError("invalid", `${label} must be a date, like 2026-10-14.`);
	return text;
}

const addDays = (from: string, days: number): string =>
	new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export type Equipment = {
	id: string;
	code: string;
	name: string;
	kind: EquipmentKind;
	location: string | null;
	calibrationIntervalDays: number | null;
	status: "in_service" | "out_of_service";
	statusReason: string | null;
	createdAt: string;
};

export type Calibration = {
	id: string;
	equipmentId: string;
	performedOn: string;
	result: "pass" | "fail";
	certificate: string;
	performedBy: string;
	dueOn: string | null;
	notes: string | null;
	recordedBy: string;
	recordedAt: string;
};

const EQUIPMENT_COLUMNS = `id, code, name, kind, location, calibration_interval_days, status, status_reason, created_at`;
const CALIBRATION_COLUMNS = `id, equipment_id, performed_on, result, certificate, performed_by, due_on, notes, recorded_by, recorded_at`;

const toEquipment = (r: Row): Equipment => ({
	id: r.id as string,
	code: r.code as string,
	name: r.name as string,
	kind: r.kind as EquipmentKind,
	location: (r.location as string | null) ?? null,
	calibrationIntervalDays: r.calibration_interval_days === null ? null : Number(r.calibration_interval_days),
	status: r.status as Equipment["status"],
	statusReason: (r.status_reason as string | null) ?? null,
	createdAt: iso(r.created_at) as string,
});

const toCalibration = (r: Row): Calibration => ({
	id: r.id as string,
	equipmentId: r.equipment_id as string,
	performedOn: day(r.performed_on) as string,
	result: r.result as Calibration["result"],
	certificate: r.certificate as string,
	performedBy: r.performed_by as string,
	dueOn: day(r.due_on),
	notes: (r.notes as string | null) ?? null,
	recordedBy: r.recorded_by as string,
	recordedAt: iso(r.recorded_at) as string,
});

/** Newest first: by the day it was carried out, then by when it was typed in. */
const newestFirst = (calibrations: readonly Calibration[]): Calibration[] =>
	[...calibrations].sort(
		(a, b) => b.performedOn.localeCompare(a.performedOn) || b.recordedAt.localeCompare(a.recordedAt),
	);

export type Standing = {
	/** Whether it may be recorded against a batch today. */
	eligible: boolean;
	calibration: "not_required" | "current" | "due_soon" | "overdue" | "never" | "failed";
	dueOn: string | null;
	reasons: string[];
};

export const CALIBRATION_LABELS: Record<Standing["calibration"], string> = {
	not_required: "No calibration required",
	current: "In calibration",
	due_soon: "Calibration due soon",
	overdue: "Calibration overdue",
	never: "No calibration on record",
	failed: "Failed calibration",
};

/**
 * Where a piece of equipment stands today, from its records alone. Pure, so the same records always give the same answer.
 * "Due soon" is within fourteen days. A calibration that is required and not on record is never assumed.
 */
export function equipmentStanding(
	equipment: Equipment,
	calibrations: readonly Calibration[],
	today: string,
): Standing {
	const reasons: string[] = [];
	if (equipment.status === "out_of_service")
		reasons.push(`Out of service: ${equipment.statusReason ?? ""}`.trim());
	const [latest] = newestFirst(calibrations);
	let calibration: Standing["calibration"];
	let dueOn: string | null = null;
	if (latest?.result === "fail") {
		calibration = "failed";
		reasons.push(
			`It failed calibration on ${latest.performedOn} (${latest.certificate}) and has not passed one since.`,
		);
	} else if (!latest) {
		if (equipment.calibrationIntervalDays === null) calibration = "not_required";
		else {
			calibration = "never";
			reasons.push("It needs calibrating and no calibration is on record. One is never assumed.");
		}
	} else {
		dueOn =
			latest.dueOn ??
			(equipment.calibrationIntervalDays === null
				? null
				: addDays(latest.performedOn, equipment.calibrationIntervalDays));
		if (dueOn === null) calibration = "not_required";
		else if (dueOn < today) {
			calibration = "overdue";
			reasons.push(`Its calibration was due on ${dueOn}.`);
		} else calibration = daysBetween(today, dueOn) <= 14 ? "due_soon" : "current";
	}
	return { eligible: reasons.length === 0, calibration, dueOn, reasons };
}

async function calibrationsOf(sql: Sql, equipmentIds: readonly string[]): Promise<Calibration[]> {
	if (equipmentIds.length === 0) return [];
	const { rows } = await sql.query(
		`select ${CALIBRATION_COLUMNS} from wai_calibrations where equipment_id = any($1::uuid[]) order by performed_on desc, recorded_at desc`,
		[equipmentIds],
	);
	return rows.map(toCalibration);
}

export type EquipmentRow = { equipment: Equipment; standing: Standing; lastCalibration: Calibration | null };

export async function listEquipment(sql: Sql, today: string): Promise<EquipmentRow[]> {
	const { rows } = await sql.query(
		`select ${EQUIPMENT_COLUMNS} from wai_equipment order by lower(code) limit 500`,
	);
	const all = rows.map(toEquipment);
	const calibrations = await calibrationsOf(
		sql,
		all.map((equipment) => equipment.id),
	);
	return all.map((equipment) => {
		const mine = calibrations.filter((calibration) => calibration.equipmentId === equipment.id);
		return {
			equipment,
			standing: equipmentStanding(equipment, mine, today),
			lastCalibration: newestFirst(mine)[0] ?? null,
		};
	});
}

export async function addEquipment(
	sql: Sql,
	actor: OperatorActor,
	input: { code: string; name: string; kind: string; location?: string; calibrationIntervalDays?: string },
): Promise<Equipment> {
	const code = tidy(input.code, 40);
	if (!code)
		throw new EquipmentError("invalid", "Give it a short code, like SC-1, as marked on the equipment.");
	const name = tidy(input.name, 160);
	if (!name) throw new EquipmentError("invalid", "Say what it is.");
	const kind = (Object.keys(EQUIPMENT_KINDS) as EquipmentKind[]).find((k) => k === input.kind);
	if (!kind) throw new EquipmentError("invalid", "Choose what kind of equipment it is.");
	const intervalText = tidy(input.calibrationIntervalDays, 8);
	if (intervalText && !/^\d{1,5}$/.test(intervalText))
		throw new EquipmentError(
			"invalid",
			"The calibration interval must be a whole number of days. Leave it blank when it needs no calibration.",
		);
	const interval = intervalText ? Number(intervalText) : null;
	if (interval !== null && interval < 1)
		throw new EquipmentError("invalid", "The calibration interval must be at least one day.");
	const taken = await sql.query(`select 1 from wai_equipment where lower(code) = lower($1)`, [code]);
	if (taken.rows[0]) throw new EquipmentError("conflict", `Equipment ${code} is already recorded.`);
	const { rows } = await sql.query(
		`insert into wai_equipment (code, name, kind, location, calibration_interval_days, created_by)
		 values ($1,$2,$3,$4,$5,$6) returning ${EQUIPMENT_COLUMNS}`,
		[code, name, kind, tidy(input.location, 160) || null, interval, actorKey(actor)],
	);
	const equipment = toEquipment(rows[0]);
	await audit(sql, {
		actor,
		action: "equipment.add",
		subject: equipment.id,
		outcome: "allowed",
		detail: { code, kind, calibrationIntervalDays: interval },
	});
	return equipment;
}

/**
 * Takes equipment out of service (anyone, with a reason) or returns it (the owner, with a reason, and never while its last
 * calibration is a failure).
 */
export async function setEquipmentStatus(
	sql: Sql,
	actor: OperatorActor,
	input: { equipmentId: string; status: string; reason: string },
): Promise<Equipment> {
	const status = (["in_service", "out_of_service"] as const).find((s) => s === input.status);
	if (!status) throw new EquipmentError("invalid", "Equipment is in service or out of service.");
	if (status === "in_service" && actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "equipment.return",
			subject: input.equipmentId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new EquipmentError("forbidden", "Only the owner can return equipment to service.");
	}
	const reason = tidy(input.reason, 500);
	if (!reason)
		throw new EquipmentError(
			"invalid",
			status === "in_service"
				? "Say on what basis it is going back into service."
				: "Say why it is being taken out of service.",
		);
	const equipment = await sql.transaction(async (tx) => {
		const found = await tx.query(`select ${EQUIPMENT_COLUMNS} from wai_equipment where id = $1 for update`, [
			tidy(input.equipmentId, 60),
		]);
		if (!found.rows[0]) throw new EquipmentError("not_found", "That equipment doesn't exist.");
		const current = toEquipment(found.rows[0]);
		if (current.status === status)
			throw new EquipmentError(
				"conflict",
				`${current.code} is already ${status === "in_service" ? "in service" : "out of service"}.`,
			);
		if (status === "in_service") {
			const [latest] = newestFirst(await calibrationsOf(tx, [current.id]));
			if (latest?.result === "fail")
				throw new EquipmentError(
					"conflict",
					`${current.code} failed its last calibration on ${latest.performedOn}. Record a passing calibration before returning it to service.`,
				);
		}
		const { rows } = await tx.query(
			`update wai_equipment set status = $2, status_reason = $3, status_changed_by = $4, status_changed_at = now() where id = $1
			 returning ${EQUIPMENT_COLUMNS}`,
			[current.id, status, status === "in_service" ? null : reason, actorKey(actor)],
		);
		return toEquipment(rows[0]);
	});
	await audit(sql, {
		actor,
		action: status === "in_service" ? "equipment.return" : "equipment.remove",
		subject: equipment.id,
		outcome: "allowed",
		detail: { code: equipment.code, reason },
	});
	return equipment;
}

export type EquipmentUse = {
	id: string;
	equipmentId: string;
	equipmentCode: string;
	equipmentName: string;
	batchId: string;
	batchCode: string;
	purpose: string;
	usedOn: string;
	recordedBy: string;
	recordedAt: string;
};

const USE_COLUMNS = `u.id, u.equipment_id, e.code as equipment_code, e.name as equipment_name, u.batch_id, b.code as batch_code,
	u.purpose, u.used_on, u.recorded_by, u.recorded_at`;
const USE_FROM = `wai_equipment_use u join wai_equipment e on e.id = u.equipment_id join wai_batches b on b.id = u.batch_id`;

const toUse = (r: Row): EquipmentUse => ({
	id: r.id as string,
	equipmentId: r.equipment_id as string,
	equipmentCode: r.equipment_code as string,
	equipmentName: r.equipment_name as string,
	batchId: r.batch_id as string,
	batchCode: r.batch_code as string,
	purpose: r.purpose as string,
	usedOn: day(r.used_on) as string,
	recordedBy: r.recorded_by as string,
	recordedAt: iso(r.recorded_at) as string,
});

export async function listEquipmentUse(
	sql: Sql,
	filter: { batchId?: string; equipmentId?: string },
): Promise<EquipmentUse[]> {
	const where: string[] = [];
	const values: unknown[] = [];
	if (filter.batchId) where.push(`u.batch_id = $${values.push(filter.batchId)}`);
	if (filter.equipmentId) where.push(`u.equipment_id = $${values.push(filter.equipmentId)}`);
	const { rows } = await sql.query(
		`select ${USE_COLUMNS} from ${USE_FROM} ${where.length ? `where ${where.join(" and ")}` : ""}
		 order by u.used_on desc, u.recorded_at desc limit 300`,
		values,
	);
	return rows.map(toUse);
}

/**
 * Records that a batch was made or measured with a piece of equipment. Refused when the equipment isn't eligible today:
 * out of service, failed, overdue, or needing a calibration that isn't on record.
 */
export async function recordEquipmentUse(
	sql: Sql,
	actor: OperatorActor,
	input: { batchId: string; equipmentId: string; purpose: string },
	today: string,
): Promise<EquipmentUse> {
	const purpose = tidy(input.purpose, 160);
	if (!purpose)
		throw new EquipmentError("invalid", "Say what it was used for, like weighing the nicotine base.");
	const batch = await getBatch(sql, tidy(input.batchId, 60));
	if (!batch) throw new EquipmentError("not_found", "That batch doesn't exist.");
	if (batch.status !== "reserved" && batch.status !== "completed")
		throw new EquipmentError(
			"conflict",
			`Batch ${batch.code} is ${batch.status}. Equipment is recorded against a batch that is being made or has been made.`,
		);
	const id = await sql.transaction(async (tx) => {
		const found = await tx.query(`select ${EQUIPMENT_COLUMNS} from wai_equipment where id = $1 for update`, [
			tidy(input.equipmentId, 60),
		]);
		if (!found.rows[0]) throw new EquipmentError("invalid", "Choose the equipment that was used.");
		const equipment = toEquipment(found.rows[0]);
		const standing = equipmentStanding(equipment, await calibrationsOf(tx, [equipment.id]), today);
		if (!standing.eligible)
			throw new EquipmentError(
				"conflict",
				`${equipment.code} can't be recorded against a batch. ${standing.reasons.join(" ")}`,
			);
		const existing = await tx.query<{ id: string }>(
			`select id from wai_equipment_use where equipment_id = $1 and batch_id = $2 and lower(purpose) = lower($3)`,
			[equipment.id, batch.id, purpose],
		);
		if (existing.rows[0]) return existing.rows[0].id;
		const { rows } = await tx.query<{ id: string }>(
			`insert into wai_equipment_use (equipment_id, batch_id, purpose, used_on, recorded_by) values ($1,$2,$3,$4::date,$5) returning id`,
			[equipment.id, batch.id, purpose, today, actorKey(actor)],
		);
		return rows[0].id;
	});
	const { rows } = await sql.query(`select ${USE_COLUMNS} from ${USE_FROM} where u.id = $1`, [id]);
	const use = toUse(rows[0]);
	await audit(sql, {
		actor,
		action: "equipment.use",
		subject: use.batchId,
		outcome: "allowed",
		detail: { equipment: use.equipmentCode, batch: use.batchCode, purpose },
	});
	return use;
}

/**
 * Records a calibration as it was carried out. A pass sets when the next is due. A failure takes the equipment out of
 * service and, in the same transaction, puts on hold every batch recorded against it since its last passing calibration
 * that hasn't been rejected. The batches held are returned so the screen can name them.
 */
export async function recordCalibration(
	sql: Sql,
	actor: OperatorActor,
	input: {
		equipmentId: string;
		performedOn: string;
		result: string;
		certificate: string;
		performedBy: string;
		dueOn?: string;
		notes?: string;
	},
	today: string,
): Promise<{ calibration: Calibration; equipment: Equipment; held: string[] }> {
	const result = (["pass", "fail"] as const).find((r) => r === input.result);
	if (!result) throw new EquipmentError("invalid", "A calibration passed or failed.");
	const performedOn = calendarDay("The calibration date", input.performedOn);
	if (performedOn > today) throw new EquipmentError("invalid", "The calibration date can't be after today.");
	const certificate = tidy(input.certificate, 200);
	if (!certificate)
		throw new EquipmentError(
			"invalid",
			"Enter the certificate number, or the reference standard it was checked against. A calibration is never recorded without one.",
		);
	const performedBy = tidy(input.performedBy, 160);
	if (!performedBy)
		throw new EquipmentError("invalid", "Say who carried it out: the person or the service company.");
	const explicitDue = tidy(input.dueOn, 10) ? calendarDay("The next-due date", input.dueOn) : null;
	if (explicitDue && explicitDue <= performedOn)
		throw new EquipmentError("invalid", "The next-due date must be after the calibration date.");

	const done = await sql.transaction(async (tx) => {
		const found = await tx.query(`select ${EQUIPMENT_COLUMNS} from wai_equipment where id = $1 for update`, [
			tidy(input.equipmentId, 60),
		]);
		if (!found.rows[0]) throw new EquipmentError("not_found", "That equipment doesn't exist.");
		let equipment = toEquipment(found.rows[0]);
		const before = newestFirst(await calibrationsOf(tx, [equipment.id]));
		const dueOn =
			result === "fail"
				? null
				: (explicitDue ??
					(equipment.calibrationIntervalDays === null
						? null
						: addDays(performedOn, equipment.calibrationIntervalDays)));
		const { rows } = await tx.query(
			`insert into wai_calibrations (equipment_id, performed_on, result, certificate, performed_by, due_on, notes, recorded_by)
			 values ($1,$2::date,$3,$4,$5,$6::date,$7,$8) returning ${CALIBRATION_COLUMNS}`,
			[
				equipment.id,
				performedOn,
				result,
				certificate,
				performedBy,
				dueOn,
				tidy(input.notes, 1000) || null,
				actorKey(actor),
			],
		);
		const calibration = toCalibration(rows[0]);
		const held: string[] = [];
		// Only a failure that is now the newest calibration says anything about the equipment as it stands.
		const isNewest = newestFirst([calibration, ...before])[0].id === calibration.id;
		if (result === "fail" && isNewest) {
			const reason = `Failed calibration on ${performedOn} (${certificate}).`;
			if (equipment.status === "in_service") {
				const updated = await tx.query(
					`update wai_equipment set status = 'out_of_service', status_reason = $2, status_changed_by = $3, status_changed_at = now()
					 where id = $1 returning ${EQUIPMENT_COLUMNS}`,
					[equipment.id, reason, actorKey(actor)],
				);
				equipment = toEquipment(updated.rows[0]);
			}
			// Every batch measured since the last calibration that passed. With none on record, every batch it was used on.
			const lastPass = before.find((c) => c.result === "pass" && c.performedOn <= performedOn);
			const affected = await tx.query<{ batch_id: string; code: string }>(
				`select distinct u.batch_id, b.code from wai_equipment_use u join wai_batches b on b.id = u.batch_id
				 where u.equipment_id = $1 and b.quality_status <> 'rejected' and ($2::date is null or u.used_on >= $2::date)
				 order by b.code`,
				[equipment.id, lastPass?.performedOn ?? null],
			);
			for (const batch of affected.rows) {
				await insertHold(
					tx,
					actor,
					batch.batch_id,
					`${equipment.code} (${equipment.name}) failed calibration on ${performedOn} (${certificate}). This batch was measured with it ${
						lastPass
							? `since its last passing calibration on ${lastPass.performedOn}`
							: "and no passing calibration is on record before that"
					}.`,
				);
				held.push(batch.code);
			}
		}
		return { calibration, equipment, held };
	});
	await audit(sql, {
		actor,
		action: "equipment.calibration",
		subject: done.equipment.id,
		outcome: "allowed",
		detail: { code: done.equipment.code, result, certificate, held: done.held },
	});
	return done;
}

// ---- Cleaning and line clearance ----------------------------------------------------------------------

export const CLEANING_KINDS = { cleaning: "Cleaning", line_clearance: "Line clearance" } as const;
export type CleaningKind = keyof typeof CLEANING_KINDS;

export type CleaningRecord = {
	id: string;
	equipmentId: string | null;
	equipmentCode: string | null;
	area: string | null;
	kind: CleaningKind;
	procedure: string;
	detail: string;
	doneBy: string;
	doneAt: string;
	verifiedBy: string | null;
	verifiedAt: string | null;
};

const CLEANING_COLUMNS = `c.id, c.equipment_id, e.code as equipment_code, c.area, c.kind, c.procedure, c.detail, c.done_by, c.done_at,
	c.verified_by, c.verified_at`;
const CLEANING_FROM = `wai_cleaning_records c left join wai_equipment e on e.id = c.equipment_id`;

const toCleaning = (r: Row): CleaningRecord => ({
	id: r.id as string,
	equipmentId: (r.equipment_id as string | null) ?? null,
	equipmentCode: (r.equipment_code as string | null) ?? null,
	area: (r.area as string | null) ?? null,
	kind: r.kind as CleaningKind,
	procedure: r.procedure as string,
	detail: r.detail as string,
	doneBy: r.done_by as string,
	doneAt: iso(r.done_at) as string,
	verifiedBy: (r.verified_by as string | null) ?? null,
	verifiedAt: iso(r.verified_at),
});

export async function listCleaning(
	sql: Sql,
	filter: { equipmentId?: string } = {},
): Promise<CleaningRecord[]> {
	const { rows } = await sql.query(
		`select ${CLEANING_COLUMNS} from ${CLEANING_FROM} ${filter.equipmentId ? "where c.equipment_id = $1" : ""}
		 order by c.done_at desc limit 300`,
		filter.equipmentId ? [filter.equipmentId] : [],
	);
	return rows.map(toCleaning);
}

/** Records a cleaning or a line clearance the person recording it carried out, under the procedure they name. */
export async function recordCleaning(
	sql: Sql,
	actor: OperatorActor,
	input: { equipmentId?: string; area?: string; kind: string; procedure: string; detail: string },
): Promise<CleaningRecord> {
	const kind = (Object.keys(CLEANING_KINDS) as CleaningKind[]).find((k) => k === input.kind);
	if (!kind) throw new EquipmentError("invalid", "Choose a cleaning or a line clearance.");
	const equipmentId = tidy(input.equipmentId, 60) || null;
	const area = tidy(input.area, 160) || null;
	if (!equipmentId && !area)
		throw new EquipmentError(
			"invalid",
			"Say what was cleaned or cleared: choose the equipment, or name the area.",
		);
	const procedure = tidy(input.procedure, 200);
	if (!procedure)
		throw new EquipmentError(
			"invalid",
			"Name the procedure it was done under, with its version if it has one.",
		);
	const detail = tidy(input.detail, 1000);
	if (!detail) throw new EquipmentError("invalid", "Say what was done and what was checked.");
	if (equipmentId) {
		const found = await sql.query(`select 1 from wai_equipment where id = $1`, [equipmentId]);
		if (!found.rows[0]) throw new EquipmentError("invalid", "That equipment doesn't exist.");
	}
	const inserted = await sql.query<{ id: string }>(
		`insert into wai_cleaning_records (equipment_id, area, kind, procedure, detail, done_by) values ($1,$2,$3,$4,$5,$6) returning id`,
		[equipmentId, area, kind, procedure, detail, actorKey(actor)],
	);
	const { rows } = await sql.query(`select ${CLEANING_COLUMNS} from ${CLEANING_FROM} where c.id = $1`, [
		inserted.rows[0].id,
	]);
	const record = toCleaning(rows[0]);
	await audit(sql, {
		actor,
		action: `cleaning.${kind}`,
		subject: record.id,
		outcome: "allowed",
		detail: { equipment: record.equipmentCode, area, procedure },
	});
	return record;
}

/** A second person confirms a cleaning or clearance. The person who did it can't verify their own. */
export async function verifyCleaning(sql: Sql, actor: OperatorActor, id: string): Promise<CleaningRecord> {
	const found = await sql.query<{ done_by: string; verified_at: unknown }>(
		`select done_by, verified_at from wai_cleaning_records where id = $1`,
		[tidy(id, 60)],
	);
	if (!found.rows[0]) throw new EquipmentError("not_found", "That record doesn't exist.");
	if (found.rows[0].verified_at)
		throw new EquipmentError("conflict", "That record has already been verified.");
	if (found.rows[0].done_by === actorKey(actor)) {
		await audit(sql, {
			actor,
			action: "cleaning.verify",
			subject: id,
			outcome: "denied",
			detail: { reason: "own record" },
		});
		throw new EquipmentError(
			"forbidden",
			"You recorded this one, so someone else has to verify it. A verification is a second person's.",
		);
	}
	await sql.query(
		`update wai_cleaning_records set verified_by = $2, verified_at = now() where id = $1 and verified_at is null`,
		[id, actorKey(actor)],
	);
	const { rows } = await sql.query(`select ${CLEANING_COLUMNS} from ${CLEANING_FROM} where c.id = $1`, [id]);
	const record = toCleaning(rows[0]);
	await audit(sql, {
		actor,
		action: "cleaning.verify",
		subject: record.id,
		outcome: "allowed",
		detail: { equipment: record.equipmentCode, area: record.area },
	});
	return record;
}

/** One piece of equipment with everything recorded about it. */
export async function getEquipment(
	sql: Sql,
	id: string,
	today: string,
): Promise<{
	equipment: Equipment;
	standing: Standing;
	calibrations: Calibration[];
	uses: EquipmentUse[];
	cleaning: CleaningRecord[];
} | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const { rows } = await sql.query(`select ${EQUIPMENT_COLUMNS} from wai_equipment where id = $1`, [id]);
	if (!rows[0]) return null;
	const equipment = toEquipment(rows[0]);
	const [calibrations, uses, cleaning] = await Promise.all([
		calibrationsOf(sql, [id]),
		listEquipmentUse(sql, { equipmentId: id }),
		listCleaning(sql, { equipmentId: id }),
	]);
	return {
		equipment,
		standing: equipmentStanding(equipment, calibrations, today),
		calibrations: newestFirst(calibrations),
		uses,
		cleaning,
	};
}
