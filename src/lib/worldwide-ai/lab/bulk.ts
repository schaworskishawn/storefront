import { ZERO, add, dec, isNegative, sub, toText, type Dec } from "../decimal";
import { iso, type Row, type Sql } from "../db/sql";
import { actorKey, type OperatorActor } from "../types";
import { getBatch, type Batch } from "./batches";
import { InventoryError } from "./inventory";

/**
 * The two things everything about a made batch rests on: the ledger of its bulk liquid, and its holds. They live here, apart
 * from packaging and release and apart from the quality records, because both of those draw on the bulk and place holds.
 *
 * Each function takes the caller's transaction, so a sample and the liquid it removed, or a failed result and the hold it
 * causes, are recorded together or not at all.
 */

export class FinishedError extends InventoryError {}

/** Locks a batch for the rest of the transaction and reads it as it stands. */
export async function lockBatch(tx: Sql, id: string): Promise<Batch> {
	const locked = await tx.query(`select id from wai_batches where id = $1 for update`, [id]);
	if (!locked.rows[0]) throw new FinishedError("not_found", "That batch doesn't exist.");
	return (await getBatch(tx, id)) as Batch;
}

export type BulkMovement = {
	id: string;
	kind: "produced" | "packaged" | "sample" | "waste" | "correction";
	quantityMl: string;
	deltaMl: string;
	remainingAfterMl: string;
	reason: string | null;
	reference: string | null;
	actor: string;
	at: string;
};

/** Draws on (or corrects) a locked batch's bulk and writes the ledger line. The caller holds the transaction. */
export async function moveBulk(
	tx: Sql,
	actor: OperatorActor,
	batch: Batch,
	input: {
		kind: BulkMovement["kind"];
		delta: Dec;
		reason?: string | null;
		reference?: string | null;
		key: string;
	},
): Promise<Dec> {
	if (batch.bulkRemainingMl === null)
		throw new FinishedError("conflict", `Batch ${batch.code} hasn't been made, so it has no bulk liquid.`);
	const remaining = add(dec(batch.bulkRemainingMl), input.delta);
	if (isNegative(remaining))
		throw new FinishedError(
			"conflict",
			`Only ${batch.bulkRemainingMl} mL of batch ${batch.code} is left in bulk. ${toText(sub(ZERO, input.delta))} mL can't be taken from it.`,
		);
	await tx.query(`update wai_batches set bulk_remaining_ml = $2::numeric where id = $1`, [
		batch.id,
		toText(remaining),
	]);
	await tx.query(
		`insert into wai_bulk_movements (batch_id, kind, quantity_ml, delta_ml, remaining_after_ml, reason, reference, idempotency_key, actor)
		 values ($1,$2,$3::numeric,$4::numeric,$5::numeric,$6,$7,$8,$9)`,
		[
			batch.id,
			input.kind,
			toText(isNegative(input.delta) ? sub(ZERO, input.delta) : input.delta),
			toText(input.delta),
			toText(remaining),
			input.reason ?? null,
			input.reference ?? null,
			input.key,
			actorKey(actor),
		],
	);
	return remaining;
}

export type QualityHold = {
	id: string;
	batchId: string;
	reason: string;
	placedBy: string;
	placedAt: string;
	liftedBy: string | null;
	liftedAt: string | null;
	liftReason: string | null;
};

export const HOLD_COLUMNS = `id, batch_id, reason, placed_by, placed_at, lifted_by, lifted_at, lift_reason`;

export const toHold = (r: Row): QualityHold => ({
	id: r.id as string,
	batchId: r.batch_id as string,
	reason: r.reason as string,
	placedBy: r.placed_by as string,
	placedAt: iso(r.placed_at) as string,
	liftedBy: (r.lifted_by as string | null) ?? null,
	liftedAt: iso(r.lifted_at),
	liftReason: (r.lift_reason as string | null) ?? null,
});

/** Writes a hold on a batch. The caller has checked the batch exists and holds the transaction, if there is one. */
export async function insertHold(
	tx: Sql,
	actor: OperatorActor,
	batchId: string,
	reason: string,
): Promise<QualityHold> {
	const { rows } = await tx.query(
		`insert into wai_quality_holds (batch_id, reason, placed_by) values ($1,$2,$3) returning ${HOLD_COLUMNS}`,
		[batchId, reason, actorKey(actor)],
	);
	return toHold(rows[0]);
}
