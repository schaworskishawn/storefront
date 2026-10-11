import { audit } from "../audit";
import {
	ZERO,
	add,
	dec,
	div,
	eq,
	gt,
	isNegative,
	isZero,
	lt,
	minDec,
	mul,
	round,
	sub,
	toText,
	tryDec,
	type Dec,
} from "../decimal";
import { iso, json, type Row, type Sql } from "../db/sql";
import { hashOf } from "../functions/products";
import { actorKey, type OperatorActor } from "../types";
import {
	InventoryError,
	applyMovement,
	convertWithDensity,
	getIngredient,
	viewLot,
	type Ingredient,
	type Lot,
	type Unit,
} from "./inventory";
import { assertQualified } from "./training";
import { RecipeError, calculateRecipe, type RecipeInput, type RecipeResult } from "./recipe";

/**
 * Stored recipes and batch records.
 *
 * A recipe version is the formula exactly as it was written: which ingredients, their documented strength and carrier at the
 * time, the percentages, and the version of the calculation it was checked with. It is never changed afterwards; a change
 * is a new version, and only a version the owner approved can be made.
 *
 * A batch is planned from an approved version. Reserving it takes the lots that expire first, through the stock ledger, in
 * one transaction: either every ingredient is reserved or nothing is, and a shortage is reported instead of a part
 * reservation. Completing it records what was actually used from each lot (use is taken from the reservation, and whatever
 * was reserved but not used goes back) and the measured yield, which is entered by a person and never calculated.
 *
 * Nothing here releases a batch. That is a qualified person's decision and stays "awaiting review".
 */

/** Bumped when the calculation in recipe.ts changes in a way that could change a result. Kept with every version and plan. */
export const RECIPE_CALC_VERSION = 1;

export type FormulaIngredient = { ingredientId: string; name: string };

export type Formula = {
	batchMl: string;
	targetNicotineMgPerMl: string;
	targetPgPercent: string;
	base: (FormulaIngredient & { strengthMgPerMl: string; pgPercent: string; vgPercent: string }) | null;
	flavours: Array<FormulaIngredient & { percent: string; pgPercent: string; vgPercent: string }>;
	pg: FormulaIngredient;
	vg: FormulaIngredient;
};

export type PlanLine = {
	key: string;
	ingredientId: string;
	name: string;
	requiredMl: string;
	percentOfBatch: string;
};

export type BatchPlan = {
	lines: PlanLine[];
	totals: RecipeResult["totals"];
	notes: string[];
	calcVersion: number;
};

export type Recipe = {
	id: string;
	name: string;
	product: string | null;
	status: "active" | "retired";
	createdAt: string;
};

export type RecipeVersion = {
	id: string;
	recipeId: string;
	version: number;
	formula: Formula;
	formulaSha256: string;
	/** Whether the stored formula still matches the checksum recorded when it was written. */
	intact: boolean;
	calcVersion: number;
	state: "draft" | "approved" | "retired";
	createdBy: string;
	createdAt: string;
	approvedBy: string | null;
	approvedAt: string | null;
};

export type BatchStatus = "planned" | "reserved" | "completed" | "cancelled";

export type Batch = {
	id: string;
	code: string;
	recipeVersionId: string;
	recipeName: string;
	recipeVersion: number;
	plannedMl: string;
	status: BatchStatus;
	plan: BatchPlan;
	expectedYieldMl: string;
	actualYieldMl: string | null;
	wasteMl: string | null;
	samplesMl: string | null;
	notes: string | null;
	/** Whether a person has decided the batch may be released. Making a batch never changes this. */
	qualityStatus: "awaiting_review" | "released" | "rejected";
	/** What is left of the batch's bulk liquid. Null until the batch has been made. */
	bulkRemainingMl: string | null;
	/** Whether the stored plan still matches the checksum recorded when the batch was planned. */
	planIntact: boolean;
	decidedAt: string | null;
	decisionNote: string | null;
	decisionRecord: unknown;
	plannedAt: string;
	reservedAt: string | null;
	completedAt: string | null;
	cancelledAt: string | null;
	cancelReason: string | null;
};

export type Allocation = {
	id: string;
	batchId: string;
	lineKey: string;
	ingredientId: string;
	ingredientName: string;
	lotId: string;
	lotCode: string;
	requiredMl: string;
	reservedQuantity: string;
	unit: "mL" | "g";
	basis: "measured" | "calculated";
	usedQuantity: string | null;
};

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";
const num = (value: unknown): string | null =>
	value === null || value === undefined ? null : toText(dec(String(value)));
const parsed = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;

function quantity(
	label: string,
	value: unknown,
	options: { positive?: boolean; optional?: boolean } = {},
): Dec | null {
	const text = tidy(value, 40);
	if (!text) {
		if (options.optional) return null;
		throw new InventoryError("invalid", `Enter ${label.toLowerCase()}.`);
	}
	const amount = tryDec(text);
	if (!amount) throw new InventoryError("invalid", `${label} must be a number, like 120 or 120.5.`);
	if (!eq(round(amount, 6), amount))
		throw new InventoryError("invalid", `${label} can have at most six decimal places.`);
	if (isNegative(amount)) throw new InventoryError("invalid", `${label} can't be negative.`);
	if (options.positive && isZero(amount))
		throw new InventoryError("invalid", `${label} must be more than zero.`);
	return amount;
}

// ---- Recipes ------------------------------------------------------------------------------------------

const toRecipe = (r: Row): Recipe => ({
	id: r.id as string,
	name: r.name as string,
	product: (r.product as string | null) ?? null,
	status: r.status as Recipe["status"],
	createdAt: iso(r.created_at) as string,
});

const VERSION_COLUMNS = `id, recipe_id, version, formula, formula_sha256, calc_version, state, created_by, created_at, approved_by, approved_at`;

function toVersion(r: Row): RecipeVersion {
	const formula = parsed<Formula>(r.formula);
	return {
		id: r.id as string,
		recipeId: r.recipe_id as string,
		version: Number(r.version),
		formula,
		formulaSha256: r.formula_sha256 as string,
		intact: hashOf(formula) === r.formula_sha256,
		calcVersion: Number(r.calc_version),
		state: r.state as RecipeVersion["state"],
		createdBy: r.created_by as string,
		createdAt: iso(r.created_at) as string,
		approvedBy: (r.approved_by as string | null) ?? null,
		approvedAt: iso(r.approved_at),
	};
}

export async function createRecipe(
	sql: Sql,
	actor: OperatorActor,
	input: { name: string; product?: string },
): Promise<Recipe> {
	const name = tidy(input.name, 160);
	if (name.length < 2) throw new InventoryError("invalid", "Give the recipe a name.");
	try {
		const { rows } = await sql.query(
			`insert into wai_recipes (name, product, created_by) values ($1,$2,$3) returning id, name, product, status, created_at`,
			[name, tidy(input.product, 160) || null, actorKey(actor)],
		);
		await audit(sql, {
			actor,
			action: "recipe.create",
			subject: rows[0].id as string,
			outcome: "allowed",
			detail: { name },
		});
		return toRecipe(rows[0]);
	} catch (error) {
		if (error instanceof Error && /wai_recipes_name/.test(error.message))
			throw new InventoryError("conflict", `There is already a recipe called ${name}.`);
		throw error;
	}
}

export async function listRecipes(
	sql: Sql,
): Promise<Array<Recipe & { versions: number; approved: number | null }>> {
	const { rows } = await sql.query(
		`select r.id, r.name, r.product, r.status, r.created_at, count(v.id)::int as versions,
			max(v.version) filter (where v.state = 'approved') as approved
		 from wai_recipes r left join wai_recipe_versions v on v.recipe_id = r.id
		 group by r.id order by lower(r.name)`,
	);
	return rows.map((r) => ({
		...toRecipe(r),
		versions: Number(r.versions),
		approved: r.approved === null ? null : Number(r.approved),
	}));
}

export async function getRecipe(
	sql: Sql,
	id: string,
): Promise<{ recipe: Recipe; versions: RecipeVersion[] } | null> {
	const found = await sql.query(
		`select id, name, product, status, created_at from wai_recipes where id = $1`,
		[id],
	);
	if (!found.rows[0]) return null;
	const versions = await sql.query(
		`select ${VERSION_COLUMNS} from wai_recipe_versions where recipe_id = $1 order by version desc`,
		[id],
	);
	return { recipe: toRecipe(found.rows[0]), versions: versions.rows.map(toVersion) };
}

/** What the calculator needs, built from a stored formula for a batch of a given size. */
export function recipeInputOf(formula: Formula, batchMl: string): RecipeInput {
	return {
		batchMl,
		targetNicotineMgPerMl: formula.targetNicotineMgPerMl,
		targetPgPercent: formula.targetPgPercent,
		nicotineBase: formula.base
			? {
					strengthMgPerMl: formula.base.strengthMgPerMl,
					pgPercent: formula.base.pgPercent,
					vgPercent: formula.base.vgPercent,
				}
			: { strengthMgPerMl: "", pgPercent: "", vgPercent: "" },
		flavours: formula.flavours.map((flavour) => ({
			name: flavour.name,
			percent: flavour.percent,
			pgPercent: flavour.pgPercent,
			vgPercent: flavour.vgPercent,
		})),
	};
}

/** Runs the calculation for a formula and ties each line of the result back to the ingredient it is made of. */
export function planFor(formula: Formula, batchMl: string): BatchPlan {
	let result: RecipeResult;
	try {
		result = calculateRecipe(recipeInputOf(formula, batchMl));
	} catch (error) {
		if (error instanceof RecipeError) throw new InventoryError("invalid", error.message);
		throw error;
	}
	const lines: PlanLine[] = [];
	for (const line of result.lines) {
		if (isZero(dec(line.millilitres))) continue;
		const flavour = formula.flavours.find((f) => f.name === line.ingredient);
		const target = line.ingredient.startsWith("Nicotine base")
			? formula.base && { key: "base", ...formula.base }
			: line.ingredient === "PG to add"
				? { key: "pg", ...formula.pg }
				: line.ingredient === "VG to add"
					? { key: "vg", ...formula.vg }
					: flavour && { key: `flavour:${flavour.ingredientId}`, ...flavour };
		if (!target)
			throw new InventoryError(
				"invalid",
				`The calculation produced a line with no ingredient behind it (${line.ingredient}).`,
			);
		lines.push({
			key: target.key,
			ingredientId: target.ingredientId,
			name: target.name,
			requiredMl: toText(dec(line.millilitres)),
			percentOfBatch: line.percentOfBatch,
		});
	}
	return { lines, totals: result.totals, notes: result.notes, calcVersion: RECIPE_CALC_VERSION };
}

export type NewVersion = {
	recipeId: string;
	batchMl: string;
	targetNicotineMgPerMl: string;
	targetPgPercent: string;
	baseIngredientId?: string;
	pgIngredientId: string;
	vgIngredientId: string;
	flavours: Array<{ ingredientId: string; percent: string }>;
};

/**
 * Writes a new version of a recipe from the ingredient records as they stand now. An ingredient whose carrier isn't
 * documented can't be used: the calculation would have to guess what it brings with it.
 */
export async function addRecipeVersion(
	sql: Sql,
	actor: OperatorActor,
	input: NewVersion,
): Promise<RecipeVersion> {
	const found = await sql.query(`select id, name from wai_recipes where id = $1 and status = 'active'`, [
		input.recipeId,
	]);
	if (!found.rows[0]) throw new InventoryError("not_found", "That recipe doesn't exist.");
	const need = async (
		id: string | undefined,
		label: string,
		category: Ingredient["category"],
	): Promise<Ingredient> => {
		const ingredient = id ? await getIngredient(sql, id) : null;
		if (!ingredient || ingredient.status !== "active")
			throw new InventoryError("invalid", `Choose the ${label}.`);
		if (ingredient.category !== category)
			throw new InventoryError(
				"invalid",
				`${ingredient.name} isn't recorded as ${label.replace(/^the /, "")}.`,
			);
		return ingredient;
	};
	const carrier = (ingredient: Ingredient) => {
		if (ingredient.pgPercent === null && ingredient.vgPercent === null)
			throw new InventoryError(
				"invalid",
				`${ingredient.name} has no documented carrier. Record what it is carried in before using it in a recipe: it is never assumed to be all PG.`,
			);
		return { pgPercent: ingredient.pgPercent ?? "0", vgPercent: ingredient.vgPercent ?? "0" };
	};
	const nicotine = quantity("The target nicotine strength", input.targetNicotineMgPerMl) as Dec;
	const pg = await need(input.pgIngredientId, "PG", "pg");
	const vg = await need(input.vgIngredientId, "VG", "vg");
	let base: Formula["base"] = null;
	if (gt(nicotine, ZERO)) {
		const ingredient = await need(input.baseIngredientId, "nicotine base", "nicotine_base");
		base = {
			ingredientId: ingredient.id,
			name: ingredient.name,
			strengthMgPerMl: ingredient.nicotineMgPerMl as string,
			...carrier(ingredient),
		};
	}
	const seen = new Set<string>();
	const flavours: Formula["flavours"] = [];
	for (const entry of input.flavours) {
		const ingredient = await need(entry.ingredientId, "flavour", "flavour");
		if (seen.has(ingredient.id)) throw new InventoryError("invalid", `${ingredient.name} is listed twice.`);
		seen.add(ingredient.id);
		const percent = quantity(`${ingredient.name} percent`, entry.percent, { positive: true }) as Dec;
		flavours.push({
			ingredientId: ingredient.id,
			name: ingredient.name,
			percent: toText(percent),
			...carrier(ingredient),
		});
	}
	const formula: Formula = {
		batchMl: toText(quantity("The batch size", input.batchMl, { positive: true }) as Dec),
		targetNicotineMgPerMl: toText(nicotine),
		targetPgPercent: toText(quantity("The target PG percent", input.targetPgPercent) as Dec),
		base,
		flavours,
		pg: { ingredientId: pg.id, name: pg.name },
		vg: { ingredientId: vg.id, name: vg.name },
	};
	// The formula has to be one that can actually be made at its own batch size.
	planFor(formula, formula.batchMl);
	const { rows } = await sql.query(
		`insert into wai_recipe_versions (recipe_id, version, formula, formula_sha256, calc_version, created_by)
		 values ($1, (select coalesce(max(version), 0) + 1 from wai_recipe_versions where recipe_id = $1), $2::json, $3, $4, $5)
		 returning ${VERSION_COLUMNS}`,
		[input.recipeId, json(formula), hashOf(formula), RECIPE_CALC_VERSION, actorKey(actor)],
	);
	const version = toVersion(rows[0]);
	await audit(sql, {
		actor,
		action: "recipe.version.add",
		subject: input.recipeId,
		outcome: "allowed",
		detail: { version: version.version },
	});
	return version;
}

/** The owner's approval of one version. Only an approved version can be made into a batch. */
export async function approveRecipeVersion(
	sql: Sql,
	actor: OperatorActor,
	versionId: string,
): Promise<RecipeVersion> {
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "recipe.version.approve",
			subject: versionId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new InventoryError("forbidden", "Only the owner can approve a recipe version.");
	}
	const existing = await sql.query(`select ${VERSION_COLUMNS} from wai_recipe_versions where id = $1`, [
		versionId,
	]);
	if (!existing.rows[0]) throw new InventoryError("not_found", "That recipe version doesn't exist.");
	const version = toVersion(existing.rows[0]);
	if (!version.intact)
		throw new InventoryError(
			"conflict",
			"The stored formula no longer matches its checksum, so it can't be approved.",
		);
	if (version.state === "approved") return version;
	const { rows } = await sql.query(
		`update wai_recipe_versions set state = 'approved', approved_by = $2, approved_at = now() where id = $1 and state = 'draft'
		 returning ${VERSION_COLUMNS}`,
		[versionId, actorKey(actor)],
	);
	if (!rows[0]) throw new InventoryError("conflict", "That version has been retired.");
	await audit(sql, {
		actor,
		action: "recipe.version.approve",
		subject: version.recipeId,
		outcome: "allowed",
		detail: { version: version.version },
	});
	return toVersion(rows[0]);
}

// ---- Batches ------------------------------------------------------------------------------------------

const BATCH_COLUMNS = `b.id, b.code, b.recipe_version_id, b.planned_ml::text as planned_ml, b.status, b.plan,
	b.expected_yield_ml::text as expected_yield_ml, b.actual_yield_ml::text as actual_yield_ml, b.waste_ml::text as waste_ml,
	b.samples_ml::text as samples_ml, b.notes, b.quality_status, b.planned_at, b.reserved_at, b.completed_at, b.cancelled_at,
	b.cancel_reason, r.name as recipe_name, v.version as recipe_version, b.plan_sha256,
	b.bulk_remaining_ml::text as bulk_remaining_ml, b.decided_at, b.decision_note, b.decision_record`;
const BATCH_FROM = `wai_batches b join wai_recipe_versions v on v.id = b.recipe_version_id join wai_recipes r on r.id = v.recipe_id`;

const toBatch = (r: Row): Batch => toBatchWith(r, parsed<BatchPlan>(r.plan));

const toBatchWith = (r: Row, plan: BatchPlan): Batch => ({
	id: r.id as string,
	code: r.code as string,
	recipeVersionId: r.recipe_version_id as string,
	recipeName: r.recipe_name as string,
	recipeVersion: Number(r.recipe_version),
	plannedMl: num(r.planned_ml) as string,
	status: r.status as BatchStatus,
	plan,
	expectedYieldMl: num(r.expected_yield_ml) as string,
	actualYieldMl: num(r.actual_yield_ml),
	wasteMl: num(r.waste_ml),
	samplesMl: num(r.samples_ml),
	notes: (r.notes as string | null) ?? null,
	qualityStatus: r.quality_status as Batch["qualityStatus"],
	bulkRemainingMl: num(r.bulk_remaining_ml),
	planIntact: hashOf(plan) === r.plan_sha256,
	decidedAt: iso(r.decided_at),
	decisionNote: (r.decision_note as string | null) ?? null,
	decisionRecord: r.decision_record ?? null,
	plannedAt: iso(r.planned_at) as string,
	reservedAt: iso(r.reserved_at),
	completedAt: iso(r.completed_at),
	cancelledAt: iso(r.cancelled_at),
	cancelReason: (r.cancel_reason as string | null) ?? null,
});

export async function getBatch(sql: Sql, id: string): Promise<Batch | null> {
	const { rows } = await sql.query(`select ${BATCH_COLUMNS} from ${BATCH_FROM} where b.id = $1`, [id]);
	return rows[0] ? toBatch(rows[0]) : null;
}

export async function listBatches(sql: Sql, limit = 100): Promise<Batch[]> {
	const { rows } = await sql.query(
		`select ${BATCH_COLUMNS} from ${BATCH_FROM} order by b.planned_at desc, b.code desc limit $1`,
		[limit],
	);
	return rows.map(toBatch);
}

export async function listAllocations(sql: Sql, batchId: string): Promise<Allocation[]> {
	const { rows } = await sql.query(
		`select a.id, a.batch_id, a.line_key, a.ingredient_id, i.name as ingredient_name, a.lot_id, l.lot_code,
			a.required_ml::text as required_ml, a.reserved_quantity::text as reserved_quantity, a.unit, a.basis,
			a.used_quantity::text as used_quantity
		 from wai_batch_allocations a join wai_ingredient_lots l on l.id = a.lot_id join wai_ingredients i on i.id = a.ingredient_id
		 where a.batch_id = $1 order by a.line_key, l.expires_on nulls last, l.lot_code`,
		[batchId],
	);
	return rows.map((r) => ({
		id: r.id as string,
		batchId: r.batch_id as string,
		lineKey: r.line_key as string,
		ingredientId: r.ingredient_id as string,
		ingredientName: r.ingredient_name as string,
		lotId: r.lot_id as string,
		lotCode: r.lot_code as string,
		requiredMl: num(r.required_ml) as string,
		reservedQuantity: num(r.reserved_quantity) as string,
		unit: r.unit as Allocation["unit"],
		basis: r.basis as Allocation["basis"],
		usedQuantity: num(r.used_quantity),
	}));
}

/** Plans a batch of a given size from an approved recipe version. Nothing is reserved yet. */
export async function planBatch(
	sql: Sql,
	actor: OperatorActor,
	input: { recipeVersionId: string; batchMl: string },
	today: string,
): Promise<Batch> {
	const found = await sql.query(`select ${VERSION_COLUMNS} from wai_recipe_versions where id = $1`, [
		input.recipeVersionId,
	]);
	if (!found.rows[0]) throw new InventoryError("not_found", "That recipe version doesn't exist.");
	const version = toVersion(found.rows[0]);
	if (version.state !== "approved")
		throw new InventoryError(
			"conflict",
			"Only a recipe version the owner has approved can be made into a batch.",
		);
	if (!version.intact)
		throw new InventoryError(
			"conflict",
			"The stored formula no longer matches its checksum, so it can't be used.",
		);
	const batchMl = toText(quantity("The batch size", input.batchMl, { positive: true }) as Dec);
	const plan = planFor(version.formula, batchMl);
	const stamp = today.replace(/-/g, "");
	for (let attempt = 0; attempt < 5; attempt++) {
		const count = await sql.query<{ n: number }>(
			`select count(*)::int as n from wai_batches where code like $1`,
			[`B-${stamp}-%`],
		);
		const code = `B-${stamp}-${String(Number(count.rows[0].n) + 1 + attempt).padStart(3, "0")}`;
		try {
			const { rows } = await sql.query<{ id: string }>(
				`insert into wai_batches (code, recipe_version_id, planned_ml, plan, plan_sha256, expected_yield_ml, planned_by)
				 values ($1,$2,$3::numeric,$4::json,$5,$6::numeric,$7) returning id`,
				[
					code,
					version.id,
					batchMl,
					json(plan),
					hashOf(plan),
					toText(dec(plan.totals.nominalMl)),
					actorKey(actor),
				],
			);
			await audit(sql, {
				actor,
				action: "batch.plan",
				subject: rows[0].id,
				outcome: "allowed",
				detail: { code, batchMl },
			});
			return (await getBatch(sql, rows[0].id)) as Batch;
		} catch (error) {
			// Someone planned a batch at the same moment and took the number: take the next one.
			if (!(error instanceof Error) || !/wai_batches_code_key|unique/i.test(error.message)) throw error;
		}
	}
	throw new InventoryError("conflict", "A batch number couldn't be assigned. Try again.");
}

export type LineAvailability = {
	line: PlanLine;
	availableMl: string;
	shortMl: string;
	picks: Array<{ lot: Lot; takeMl: Dec; quantity: Dec; basis: "measured" | "calculated" }>;
	notes: string[];
};

/**
 * Works out which lots a plan would take from: the ones that expire first, only what is usable, never a lot in quarantine or
 * past its date. A lot counted in grams is used only when it has a documented density to convert with. Changes nothing.
 */
export function allocate(
	plan: BatchPlan,
	lotsByIngredient: ReadonlyMap<string, readonly Lot[]>,
	today: string,
): LineAvailability[] {
	return plan.lines.map((line) => {
		let remaining = dec(line.requiredMl);
		let available = ZERO;
		const picks: LineAvailability["picks"] = [];
		const notes: string[] = [];
		for (const lot of lotsByIngredient.get(line.ingredientId) ?? []) {
			if (lot.unit === "each") continue;
			const view = viewLot(lot, today);
			const usable = dec(view.usable);
			if (isZero(usable)) continue;
			let usableMl = usable;
			if (lot.unit === "g") {
				if (!lot.densityGPerMl) {
					notes.push(
						`Lot ${lot.lotCode} is counted in grams and has no documented density, so it can't be measured out in mL.`,
					);
					continue;
				}
				// Rounded down, so a conversion can never promise a drop more than the lot holds.
				usableMl = convertWithDensity(usable, "g", dec(lot.densityGPerMl));
				if (gt(convertWithDensity(usableMl, "mL", dec(lot.densityGPerMl)), usable))
					usableMl = sub(usableMl, dec("0.000001"));
			}
			available = add(available, usableMl);
			if (isZero(remaining)) continue;
			const takeMl = minDec(remaining, usableMl);
			if (!gt(takeMl, ZERO)) continue;
			const inLotUnit =
				lot.unit === "mL"
					? takeMl
					: minDec(convertWithDensity(takeMl, "mL", dec(lot.densityGPerMl as string)), usable);
			picks.push({ lot, takeMl, quantity: inLotUnit, basis: lot.unit === "mL" ? "measured" : "calculated" });
			remaining = sub(remaining, takeMl);
		}
		return { line, availableMl: toText(available), shortMl: toText(remaining), picks, notes };
	});
}

const lotColumns = `id, ingredient_id, lot_code, unit, received_on::text as received_on, opened_on::text as opened_on,
	expires_on::text as expires_on, review_on::text as review_on, location, density_g_per_ml::text as density_g_per_ml,
	density_temp_c::text as density_temp_c, density_source, cost_per_unit::text as cost_per_unit, currency, status,
	on_hand::text as on_hand, reserved::text as reserved, created_at`;

async function lotsFor(sql: Sql, plan: BatchPlan, lock: boolean): Promise<Map<string, Lot[]>> {
	const ids = [...new Set(plan.lines.map((line) => line.ingredientId))];
	const { rows } = await sql.query(
		`select ${lotColumns} from wai_ingredient_lots where ingredient_id = any($1::uuid[]) and status = 'available'
		 order by expires_on nulls last, created_at, id ${lock ? "for update" : ""}`,
		[ids],
	);
	const map = new Map<string, Lot[]>();
	for (const r of rows) {
		const lot: Lot = {
			id: r.id as string,
			ingredientId: r.ingredient_id as string,
			lotCode: r.lot_code as string,
			unit: r.unit as Unit,
			receivedOn: (r.received_on as string | null) ?? null,
			openedOn: (r.opened_on as string | null) ?? null,
			expiresOn: (r.expires_on as string | null) ?? null,
			reviewOn: (r.review_on as string | null) ?? null,
			location: (r.location as string | null) ?? null,
			densityGPerMl: num(r.density_g_per_ml),
			densityTempC: num(r.density_temp_c),
			densitySource: (r.density_source as string | null) ?? null,
			costPerUnit: num(r.cost_per_unit),
			currency: (r.currency as string | null) ?? null,
			status: r.status as Lot["status"],
			onHand: num(r.on_hand) as string,
			reserved: num(r.reserved) as string,
			createdAt: iso(r.created_at) as string,
		};
		map.set(lot.ingredientId, [...(map.get(lot.ingredientId) ?? []), lot]);
	}
	return map;
}

/** What a planned batch would take and what it is short of, as things stand. Reads only. */
export async function batchAvailability(sql: Sql, batch: Batch, today: string): Promise<LineAvailability[]> {
	return allocate(batch.plan, await lotsFor(sql, batch.plan, false), today);
}

const shortageText = (lines: readonly LineAvailability[]) =>
	lines
		.filter((entry) => gt(dec(entry.shortMl), ZERO))
		.map(
			(entry) =>
				`${entry.line.name} is short by ${entry.shortMl} mL (needs ${entry.line.requiredMl}, ${entry.availableMl} usable)`,
		)
		.join("; ");

async function lockBatch(tx: Sql, id: string): Promise<Batch> {
	const locked = await tx.query(`select id from wai_batches where id = $1 for update`, [id]);
	if (!locked.rows[0]) throw new InventoryError("not_found", "That batch doesn't exist.");
	return (await getBatch(tx, id)) as Batch;
}

/**
 * Reserves everything a planned batch needs, lot by lot, earliest expiry first. All of it or none of it: if any ingredient
 * is short, nothing is reserved and the shortage is reported.
 */
export async function reserveBatch(
	sql: Sql,
	actor: OperatorActor,
	batchId: string,
	today: string,
): Promise<Batch> {
	const batch = await sql.transaction(async (tx) => {
		const current = await lockBatch(tx, batchId);
		if (current.status !== "planned")
			throw new InventoryError(
				"conflict",
				`Batch ${current.code} is ${current.status}, so it can't be reserved.`,
			);
		const lines = allocate(current.plan, await lotsFor(tx, current.plan, true), today);
		const short = shortageText(lines);
		if (short)
			throw new InventoryError("conflict", `Not enough usable stock, so nothing was reserved: ${short}.`);
		for (const entry of lines)
			for (const pick of entry.picks) {
				const { movement } = await applyMovement(
					tx,
					actor,
					{
						lotId: pick.lot.id,
						kind: "reservation",
						quantity: toText(pick.quantity),
						reference: current.code,
						basis: pick.basis,
						idempotencyKey: `batch:${current.id}:reserve:${entry.line.key}:${pick.lot.id}`,
					},
					today,
				);
				await tx.query(
					`insert into wai_batch_allocations (batch_id, line_key, ingredient_id, lot_id, required_ml, reserved_quantity, unit,
						basis, reservation_movement_id)
					 values ($1,$2,$3,$4,$5::numeric,$6::numeric,$7,$8,$9)`,
					[
						current.id,
						entry.line.key,
						entry.line.ingredientId,
						pick.lot.id,
						toText(pick.takeMl),
						toText(pick.quantity),
						pick.lot.unit,
						pick.basis,
						movement.id,
					],
				);
			}
		await tx.query(
			`update wai_batches set status = 'reserved', reserved_by = $2, reserved_at = now() where id = $1`,
			[current.id, actorKey(actor)],
		);
		return (await getBatch(tx, current.id)) as Batch;
	});
	await audit(sql, {
		actor,
		action: "batch.reserve",
		subject: batch.id,
		outcome: "allowed",
		detail: { code: batch.code },
	});
	return batch;
}

export type Completion = {
	actualYieldMl: string;
	wasteMl?: string;
	samplesMl?: string;
	notes?: string;
	/** What was actually used from each allocation, in that lot's unit. Left out means all of what was reserved. */
	used?: Record<string, string>;
};

/**
 * Records that a reserved batch was made: what was actually used from each lot, and what was measured coming out. Use is
 * taken from the reservation and whatever was reserved but not used goes back to free stock. The yield is what a person
 * measured; nothing here calculates it.
 */
export async function completeBatch(
	sql: Sql,
	actor: OperatorActor,
	batchId: string,
	input: Completion,
	today: string,
): Promise<Batch> {
	const actualYield = quantity("The measured yield", input.actualYieldMl) as Dec;
	const waste = quantity("Waste", input.wasteMl, { optional: true });
	const samples = quantity("Samples", input.samplesMl, { optional: true });
	// Where the owner requires training for this step, a person without it is refused here, before anything is touched.
	await assertQualified(sql, actor, "make_batch", today);
	const batch = await sql.transaction(async (tx) => {
		const current = await lockBatch(tx, batchId);
		if (current.status !== "reserved")
			throw new InventoryError(
				"conflict",
				`Batch ${current.code} is ${current.status}. Reserve its ingredients before recording that it was made.`,
			);
		for (const allocation of await listAllocations(tx, current.id)) {
			const reserved = dec(allocation.reservedQuantity);
			const used =
				quantity(`What was used from lot ${allocation.lotCode}`, input.used?.[allocation.id], {
					optional: true,
				}) ?? reserved;
			if (gt(used, reserved))
				throw new InventoryError(
					"conflict",
					`Lot ${allocation.lotCode}: ${toText(used)} ${allocation.unit} is more than the ${allocation.reservedQuantity} ${allocation.unit} reserved for this batch. Reserve and record the extra on the ingredient's page, quoting ${current.code}.`,
				);
			let consumption: string | null = null;
			let release: string | null = null;
			if (gt(used, ZERO))
				consumption = (
					await applyMovement(
						tx,
						actor,
						{
							lotId: allocation.lotId,
							kind: "consumption",
							quantity: toText(used),
							reference: current.code,
							idempotencyKey: `batch:${current.id}:consume:${allocation.id}`,
						},
						today,
					)
				).movement.id;
			if (lt(used, reserved))
				release = (
					await applyMovement(
						tx,
						actor,
						{
							lotId: allocation.lotId,
							kind: "reservation_release",
							quantity: toText(sub(reserved, used)),
							reference: current.code,
							idempotencyKey: `batch:${current.id}:release:${allocation.id}`,
						},
						today,
					)
				).movement.id;
			await tx.query(
				`update wai_batch_allocations set used_quantity = $2::numeric, consumption_movement_id = $3, release_movement_id = $4 where id = $1`,
				[allocation.id, toText(used), consumption, release],
			);
		}
		await tx.query(
			`update wai_batches set status = 'completed', actual_yield_ml = $2::numeric, waste_ml = $3::numeric, samples_ml = $4::numeric,
				notes = $5, completed_by = $6, completed_at = now() where id = $1`,
			[
				current.id,
				toText(actualYield),
				waste ? toText(waste) : null,
				samples ? toText(samples) : null,
				tidy(input.notes, 1000) || null,
				actorKey(actor),
			],
		);
		// What was measured coming out is the batch's bulk liquid from here on. It is drawn down only through its own ledger.
		await tx.query(`update wai_batches set bulk_remaining_ml = $2::numeric where id = $1`, [
			current.id,
			toText(actualYield),
		]);
		if (gt(actualYield, ZERO))
			await tx.query(
				`insert into wai_bulk_movements (batch_id, kind, quantity_ml, delta_ml, remaining_after_ml, reference, idempotency_key, actor)
				 values ($1, 'produced', $2::numeric, $2::numeric, $2::numeric, $3, $4, $5)`,
				[current.id, toText(actualYield), current.code, `batch:${current.id}:produced`, actorKey(actor)],
			);
		return (await getBatch(tx, current.id)) as Batch;
	});
	await audit(sql, {
		actor,
		action: "batch.complete",
		subject: batch.id,
		outcome: "allowed",
		detail: { code: batch.code, actualYieldMl: batch.actualYieldMl },
	});
	return batch;
}

/** Calls a batch off before it is made. Anything it had reserved goes back to free stock. */
export async function cancelBatch(
	sql: Sql,
	actor: OperatorActor,
	batchId: string,
	reasonText: string,
	today: string,
): Promise<Batch> {
	const reason = tidy(reasonText, 500);
	if (!reason) throw new InventoryError("invalid", "Say why the batch is being cancelled.");
	const batch = await sql.transaction(async (tx) => {
		const current = await lockBatch(tx, batchId);
		if (current.status !== "planned" && current.status !== "reserved")
			throw new InventoryError(
				"conflict",
				`Batch ${current.code} is ${current.status}, so it can't be cancelled.`,
			);
		if (current.status === "reserved")
			for (const allocation of await listAllocations(tx, current.id)) {
				const { movement } = await applyMovement(
					tx,
					actor,
					{
						lotId: allocation.lotId,
						kind: "reservation_release",
						quantity: allocation.reservedQuantity,
						reference: current.code,
						reason: `Batch cancelled: ${reason}`,
						idempotencyKey: `batch:${current.id}:release:${allocation.id}`,
					},
					today,
				);
				await tx.query(
					`update wai_batch_allocations set used_quantity = 0, release_movement_id = $2 where id = $1`,
					[allocation.id, movement.id],
				);
			}
		await tx.query(
			`update wai_batches set status = 'cancelled', cancelled_by = $2, cancelled_at = now(), cancel_reason = $3 where id = $1`,
			[current.id, actorKey(actor), reason],
		);
		return (await getBatch(tx, current.id)) as Batch;
	});
	await audit(sql, {
		actor,
		action: "batch.cancel",
		subject: batch.id,
		outcome: "allowed",
		detail: { code: batch.code, reason },
	});
	return batch;
}

/** The difference between what came out and what the ingredients added up to, for the batch page. Null until completed. */
export function yieldDifference(batch: Batch): { ml: string; percent: string } | null {
	if (batch.actualYieldMl === null) return null;
	const expected = dec(batch.expectedYieldMl);
	const difference = sub(dec(batch.actualYieldMl), expected);
	return {
		ml: toText(difference),
		percent: isZero(expected) ? "0" : toText(round(mul(div(difference, expected), dec("100")), 2)),
	};
}
