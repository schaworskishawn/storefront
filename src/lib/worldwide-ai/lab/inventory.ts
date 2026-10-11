import { audit } from "../audit";
import {
	ZERO,
	add,
	cmp,
	dec,
	div,
	eq,
	gt,
	isNegative,
	isZero,
	lt,
	mul,
	round,
	sub,
	toText,
	tryDec,
	type Dec,
} from "../decimal";
import { iso, type Row, type Sql } from "../db/sql";
import { isIsoDay } from "../functions/table";
import { actorKey, type OperatorActor } from "../types";
import { WorkflowError } from "../workflows/types";

/**
 * The E-Liquid Lab's ingredient inventory: ingredients, the lots they arrive in, and an append-only ledger of every movement.
 *
 * How the balances work, because it matters:
 *   on hand      what is physically in the lot, in the lot's own unit
 *   reserved     the part of that promised to a batch
 *   quarantined  all of what is on hand, while the lot is in quarantine
 *   usable       on hand less reserved, and nothing at all while the lot is quarantined or past its expiry date
 *
 * A lot is counted in one unit. Volume and weight are never two balances: the other unit is shown only when the lot has a
 * documented density, and is otherwise unavailable. One millilitre is never assumed to weigh one gram.
 *
 * Every change is one transaction that locks the lot, checks the rule for that kind of movement, updates the balances and
 * writes the ledger line. The same request arriving twice is one movement. The database's own constraints refuse a negative
 * balance or an over-reservation whatever this code does. Only a person moves stock: agents prepare proposals.
 */

export type Unit = "mL" | "g" | "each";
export const UNITS: readonly Unit[] = ["mL", "g", "each"];

export const CATEGORIES = [
	{ id: "nicotine_base", label: "Nicotine base" },
	{ id: "flavour", label: "Flavour concentrate" },
	{ id: "pg", label: "PG" },
	{ id: "vg", label: "VG" },
	{ id: "additive", label: "Additive" },
	{ id: "packaging", label: "Packaging" },
	{ id: "other", label: "Other" },
] as const;
export type IngredientCategory = (typeof CATEGORIES)[number]["id"];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const MOVEMENT_KINDS = [
	"receipt",
	"reservation",
	"reservation_release",
	"consumption",
	"return",
	"waste",
	"transfer",
	"correction",
	"quarantine",
	"quarantine_release",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_LABELS: Record<MovementKind, string> = {
	receipt: "Received",
	reservation: "Reserved",
	reservation_release: "Reservation released",
	consumption: "Consumed",
	return: "Returned to stock",
	waste: "Waste",
	transfer: "Moved",
	correction: "Correction",
	quarantine: "Put in quarantine",
	quarantine_release: "Released from quarantine",
};

/** Corrections rewrite the books and lifting a quarantine makes stock usable again, so those are the owner's. */
export const OWNER_ONLY: readonly MovementKind[] = ["correction", "quarantine_release"];

/** A second measurement further than this from what the documented density predicts is flagged. */
export const DENSITY_TOLERANCE_PERCENT = "2";
export const EXPIRING_WITHIN_DAYS = 30;

export class InventoryError extends WorkflowError {
	constructor(code: "invalid" | "not_found" | "conflict" | "forbidden", message: string) {
		super(code, message);
		this.name = "InventoryError";
	}
}

export type Ingredient = {
	id: string;
	name: string;
	supplier: string | null;
	sku: string | null;
	category: IngredientCategory;
	nicotineMgPerMl: string | null;
	nicotineType: string | null;
	pgPercent: string | null;
	vgPercent: string | null;
	carrierSource: string | null;
	minStock: string | null;
	minStockUnit: Unit | null;
	status: "active" | "retired";
	notes: string | null;
	createdAt: string;
};

export type Lot = {
	id: string;
	ingredientId: string;
	lotCode: string;
	unit: Unit;
	receivedOn: string | null;
	openedOn: string | null;
	expiresOn: string | null;
	reviewOn: string | null;
	location: string | null;
	densityGPerMl: string | null;
	densityTempC: string | null;
	densitySource: string | null;
	costPerUnit: string | null;
	currency: string | null;
	status: "available" | "quarantined" | "retired";
	onHand: string;
	reserved: string;
	createdAt: string;
};

export type LotView = Lot & {
	usable: string;
	quarantined: string;
	expired: boolean;
	/** The same balances in the other unit, when the lot has a documented density. Null when it doesn't. */
	other: { unit: "mL" | "g"; onHand: string; usable: string } | null;
};

export type Movement = {
	id: string;
	lotId: string;
	kind: MovementKind;
	quantity: string;
	unit: Unit;
	deltaOnHand: string;
	deltaReserved: string;
	onHandAfter: string;
	reservedAfter: string;
	basis: "measured" | "calculated" | "estimate";
	otherQuantity: string | null;
	otherUnit: "mL" | "g" | null;
	reason: string | null;
	reference: string | null;
	fromLocation: string | null;
	toLocation: string | null;
	actor: string;
	at: string;
};

// ---- Reading rows -------------------------------------------------------------------------------------

const day = (value: unknown): string | null => {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return String(value).slice(0, 10);
};
/** A stored number as plain decimal text with no trailing zeros ("120.500000" is "120.5"). */
const num = (value: unknown): string | null =>
	value === null || value === undefined ? null : toText(dec(String(value)));
const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const INGREDIENT_COLUMNS = `id, name, supplier, sku, category, nicotine_mg_per_ml::text as nicotine_mg_per_ml, nicotine_type,
	pg_percent::text as pg_percent, vg_percent::text as vg_percent, carrier_source, min_stock::text as min_stock, min_stock_unit,
	status, notes, created_at`;

const toIngredient = (r: Row): Ingredient => ({
	id: r.id as string,
	name: r.name as string,
	supplier: str(r.supplier),
	sku: str(r.sku),
	category: r.category as IngredientCategory,
	nicotineMgPerMl: num(r.nicotine_mg_per_ml),
	nicotineType: str(r.nicotine_type),
	pgPercent: num(r.pg_percent),
	vgPercent: num(r.vg_percent),
	carrierSource: str(r.carrier_source),
	minStock: num(r.min_stock),
	minStockUnit: (r.min_stock_unit as Unit | null) ?? null,
	status: r.status as Ingredient["status"],
	notes: str(r.notes),
	createdAt: iso(r.created_at) as string,
});

const LOT_COLUMNS = `id, ingredient_id, lot_code, unit, received_on::text as received_on, opened_on::text as opened_on,
	expires_on::text as expires_on, review_on::text as review_on, location, density_g_per_ml::text as density_g_per_ml,
	density_temp_c::text as density_temp_c, density_source, cost_per_unit::text as cost_per_unit, currency, status,
	on_hand::text as on_hand, reserved::text as reserved, created_at`;

const toLot = (r: Row): Lot => ({
	id: r.id as string,
	ingredientId: r.ingredient_id as string,
	lotCode: r.lot_code as string,
	unit: r.unit as Unit,
	receivedOn: day(r.received_on),
	openedOn: day(r.opened_on),
	expiresOn: day(r.expires_on),
	reviewOn: day(r.review_on),
	location: str(r.location),
	densityGPerMl: num(r.density_g_per_ml),
	densityTempC: num(r.density_temp_c),
	densitySource: str(r.density_source),
	costPerUnit: num(r.cost_per_unit),
	currency: str(r.currency),
	status: r.status as Lot["status"],
	onHand: num(r.on_hand) as string,
	reserved: num(r.reserved) as string,
	createdAt: iso(r.created_at) as string,
});

const MOVEMENT_COLUMNS = `id, lot_id, kind, quantity::text as quantity, unit, delta_on_hand::text as delta_on_hand,
	delta_reserved::text as delta_reserved, on_hand_after::text as on_hand_after, reserved_after::text as reserved_after,
	basis, other_quantity::text as other_quantity, other_unit, reason, reference, from_location, to_location, actor, at`;

const toMovement = (r: Row): Movement => ({
	id: r.id as string,
	lotId: r.lot_id as string,
	kind: r.kind as MovementKind,
	quantity: num(r.quantity) as string,
	unit: r.unit as Unit,
	deltaOnHand: num(r.delta_on_hand) as string,
	deltaReserved: num(r.delta_reserved) as string,
	onHandAfter: num(r.on_hand_after) as string,
	reservedAfter: num(r.reserved_after) as string,
	basis: r.basis as Movement["basis"],
	otherQuantity: num(r.other_quantity),
	otherUnit: (r.other_unit as Movement["otherUnit"]) ?? null,
	reason: str(r.reason),
	reference: str(r.reference),
	fromLocation: str(r.from_location),
	toLocation: str(r.to_location),
	actor: r.actor as string,
	at: iso(r.at) as string,
});

// ---- Balances -----------------------------------------------------------------------------------------

/** Converts a quantity between millilitres and grams with a documented density. Exact decimals, six places. */
export function convertWithDensity(quantity: Dec, from: "mL" | "g", density: Dec): Dec {
	return round(from === "mL" ? mul(quantity, density) : div(quantity, density), 6);
}

/** A lot with the balances a person needs: usable, quarantined, whether it has expired, and the other unit if known. */
export function viewLot(lot: Lot, today: string): LotView {
	const onHand = dec(lot.onHand);
	const expired = lot.expiresOn !== null && lot.expiresOn < today;
	const free = sub(onHand, dec(lot.reserved));
	const usable = lot.status === "available" && !expired && !isNegative(free) ? free : ZERO;
	const density = lot.densityGPerMl ? dec(lot.densityGPerMl) : null;
	const other =
		density && lot.unit !== "each"
			? {
					unit: lot.unit === "mL" ? ("g" as const) : ("mL" as const),
					onHand: toText(convertWithDensity(onHand, lot.unit, density)),
					usable: toText(convertWithDensity(usable, lot.unit, density)),
				}
			: null;
	return {
		...lot,
		usable: toText(usable),
		quarantined: lot.status === "quarantined" ? lot.onHand : "0",
		expired,
		other,
	};
}

// ---- Validation ---------------------------------------------------------------------------------------

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

/** A number a person typed, as an exact decimal with at most six places. Null when it was left blank. */
function decimalField(
	label: string,
	value: unknown,
	options: { min?: "zero" | "positive"; max?: string } = {},
): Dec | null {
	const text = tidy(value, 40);
	if (!text) return null;
	const parsed = tryDec(text);
	if (!parsed) throw new InventoryError("invalid", `${label} must be a number, like 120 or 120.5.`);
	if (!eq(round(parsed, 6), parsed))
		throw new InventoryError("invalid", `${label} can have at most six decimal places.`);
	if (options.min === "positive" && !gt(parsed, ZERO))
		throw new InventoryError("invalid", `${label} must be more than zero.`);
	if (options.min === "zero" && isNegative(parsed))
		throw new InventoryError("invalid", `${label} can't be negative.`);
	if (options.max && gt(parsed, dec(options.max)))
		throw new InventoryError("invalid", `${label} can't be more than ${options.max}.`);
	return parsed;
}

function dayField(label: string, value: unknown): string | null {
	const text = tidy(value, 20);
	if (!text) return null;
	if (!isIsoDay(text)) throw new InventoryError("invalid", `${label} must be a date like 2026-10-31.`);
	return text;
}

const unitField = (value: unknown): Unit => {
	const text = tidy(value, 10);
	const unit = UNITS.find((u) => u.toLowerCase() === text.toLowerCase());
	if (!unit) throw new InventoryError("invalid", "The unit must be mL, g or each.");
	return unit;
};

const text = (d: Dec | null) => (d === null ? null : toText(d));

// ---- Ingredients --------------------------------------------------------------------------------------

export type NewIngredient = {
	name: string;
	category: string;
	supplier?: string;
	sku?: string;
	nicotineMgPerMl?: string;
	nicotineType?: string;
	pgPercent?: string;
	vgPercent?: string;
	carrierSource?: string;
	minStock?: string;
	minStockUnit?: string;
	notes?: string;
};

export async function createIngredient(
	sql: Sql,
	actor: OperatorActor,
	input: NewIngredient,
): Promise<Ingredient> {
	const name = tidy(input.name, 160);
	if (name.length < 2) throw new InventoryError("invalid", "Give the ingredient a name.");
	const category = CATEGORIES.find((c) => c.id === input.category)?.id;
	if (!category) throw new InventoryError("invalid", "Choose what kind of ingredient it is.");
	const nicotine = decimalField("Nicotine strength", input.nicotineMgPerMl, { min: "zero", max: "1000" });
	if (nicotine && category !== "nicotine_base")
		throw new InventoryError("invalid", "Only a nicotine base has a nicotine strength.");
	if (category === "nicotine_base" && (!nicotine || isZero(nicotine)))
		throw new InventoryError(
			"invalid",
			"A nicotine base needs its strength in mg/mL, from the supplier's documents.",
		);
	const pg = decimalField("PG percent", input.pgPercent, { min: "zero", max: "100" });
	const vg = decimalField("VG percent", input.vgPercent, { min: "zero", max: "100" });
	if (gt(add(pg ?? ZERO, vg ?? ZERO), dec("100")))
		throw new InventoryError("invalid", "PG and VG together can't be more than 100 percent.");
	const minStock = decimalField("Minimum stock", input.minStock, { min: "zero" });
	const minStockUnit = minStock ? unitField(input.minStockUnit) : null;
	const sku = tidy(input.sku, 80) || null;
	try {
		const { rows } = await sql.query(
			`insert into wai_ingredients (name, supplier, sku, category, nicotine_mg_per_ml, nicotine_type, pg_percent, vg_percent,
				carrier_source, min_stock, min_stock_unit, notes, created_by)
			 values ($1,$2,$3,$4,$5::numeric,$6,$7::numeric,$8::numeric,$9,$10::numeric,$11,$12,$13) returning ${INGREDIENT_COLUMNS}`,
			[
				name,
				tidy(input.supplier, 160) || null,
				sku,
				category,
				text(nicotine),
				tidy(input.nicotineType, 60) || null,
				text(pg),
				text(vg),
				tidy(input.carrierSource, 200) || null,
				text(minStock),
				minStockUnit,
				tidy(input.notes, 1000) || null,
				actorKey(actor),
			],
		);
		await audit(sql, {
			actor,
			action: "inventory.ingredient.create",
			subject: rows[0].id as string,
			outcome: "allowed",
			detail: { name, category },
		});
		return toIngredient(rows[0]);
	} catch (error) {
		if (error instanceof Error && /wai_ingredients_sku/.test(error.message))
			throw new InventoryError("conflict", `Another ingredient already has the SKU ${sku}.`);
		throw error;
	}
}

export async function getIngredient(sql: Sql, id: string): Promise<Ingredient | null> {
	const { rows } = await sql.query(`select ${INGREDIENT_COLUMNS} from wai_ingredients where id = $1`, [id]);
	return rows[0] ? toIngredient(rows[0]) : null;
}

export type UnitTotals = {
	unit: Unit;
	onHand: string;
	reserved: string;
	usable: string;
	quarantined: string;
};

export type IngredientSummary = {
	ingredient: Ingredient;
	lots: LotView[];
	/** One line per unit its lots are counted in. Lots in different units are never added together. */
	totals: UnitTotals[];
	flags: string[];
};

function summarize(ingredient: Ingredient, lots: readonly Lot[], today: string): IngredientSummary {
	const views = lots.filter((lot) => lot.status !== "retired").map((lot) => viewLot(lot, today));
	const totals: UnitTotals[] = [];
	for (const unit of UNITS) {
		const inUnit = views.filter((lot) => lot.unit === unit);
		if (!inUnit.length) continue;
		const total = (pick: (lot: LotView) => string) =>
			toText(inUnit.reduce((sum, lot) => add(sum, dec(pick(lot))), ZERO));
		totals.push({
			unit,
			onHand: total((l) => l.onHand),
			reserved: total((l) => l.reserved),
			usable: total((l) => l.usable),
			quarantined: total((l) => l.quarantined),
		});
	}
	const flags: string[] = [];
	const liquid = ingredient.category !== "packaging";
	if (ingredient.minStock && ingredient.minStockUnit) {
		const usable = dec(totals.find((t) => t.unit === ingredient.minStockUnit)?.usable ?? "0");
		if (lt(usable, dec(ingredient.minStock)))
			flags.push(
				`Low stock: ${toText(usable)} ${ingredient.minStockUnit} usable, below the minimum of ${ingredient.minStock}.`,
			);
	}
	if (
		(ingredient.category === "nicotine_base" || ingredient.category === "flavour") &&
		!ingredient.pgPercent &&
		!ingredient.vgPercent
	)
		flags.push(
			"Carrier not documented: what it is carried in (PG, VG) hasn't been recorded, so a recipe can't account for it.",
		);
	for (const lot of views) {
		const held = gt(dec(lot.onHand), ZERO);
		if (lot.expired && held)
			flags.push(
				`Lot ${lot.lotCode} expired on ${lot.expiresOn} with ${lot.onHand} ${lot.unit} still on hand.`,
			);
		else if (held && lot.expiresOn && daysFrom(today, lot.expiresOn) <= EXPIRING_WITHIN_DAYS)
			flags.push(`Lot ${lot.lotCode} expires on ${lot.expiresOn}.`);
		if (lot.status === "quarantined" && held)
			flags.push(`Lot ${lot.lotCode} is in quarantine: ${lot.onHand} ${lot.unit} can't be used.`);
		if (liquid && lot.unit !== "each" && !lot.densityGPerMl && held)
			flags.push(
				`Lot ${lot.lotCode} has no documented density, so its ${lot.unit === "mL" ? "weight" : "volume"} is unavailable.`,
			);
	}
	return { ingredient, lots: views, totals, flags };
}

/** Whole days from one calendar day to another. */
function daysFrom(from: string, to: string): number {
	const at = (key: string) =>
		Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
	return Math.round((at(to) - at(from)) / 86_400_000);
}

export async function listInventory(
	sql: Sql,
	today: string,
	filter: { search?: string; category?: string; includeRetired?: boolean } = {},
): Promise<IngredientSummary[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (!filter.includeRetired) where.push(`i.status = 'active'`);
	if (filter.category && CATEGORIES.some((c) => c.id === filter.category)) {
		params.push(filter.category);
		where.push(`i.category = $${params.length}`);
	}
	const search = tidy(filter.search, 80);
	if (search) {
		params.push(`%${search.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`);
		const p = `$${params.length}`;
		where.push(
			`(lower(i.name) like ${p} or lower(coalesce(i.supplier, '')) like ${p} or lower(coalesce(i.sku, '')) like ${p}
			  or exists (select 1 from wai_ingredient_lots l where l.ingredient_id = i.id
			    and (lower(l.lot_code) like ${p} or lower(coalesce(l.location, '')) like ${p})))`,
		);
	}
	const ingredients = await sql.query(
		`select ${INGREDIENT_COLUMNS} from wai_ingredients i ${where.length ? `where ${where.join(" and ")}` : ""}
		 order by lower(i.name) limit 500`,
		params,
	);
	const ids = ingredients.rows.map((r) => r.id as string);
	const lots = ids.length
		? await sql.query(
				`select ${LOT_COLUMNS} from wai_ingredient_lots where ingredient_id = any($1::uuid[])
				 order by expires_on nulls last, created_at`,
				[ids],
			)
		: { rows: [] as Row[] };
	const byIngredient = new Map<string, Lot[]>();
	for (const row of lots.rows) {
		const lot = toLot(row);
		byIngredient.set(lot.ingredientId, [...(byIngredient.get(lot.ingredientId) ?? []), lot]);
	}
	return ingredients.rows.map((row) => {
		const ingredient = toIngredient(row);
		return summarize(ingredient, byIngredient.get(ingredient.id) ?? [], today);
	});
}

export async function getInventoryItem(
	sql: Sql,
	id: string,
	today: string,
): Promise<IngredientSummary | null> {
	const ingredient = await getIngredient(sql, id);
	if (!ingredient) return null;
	const { rows } = await sql.query(
		`select ${LOT_COLUMNS} from wai_ingredient_lots where ingredient_id = $1 order by expires_on nulls last, created_at`,
		[id],
	);
	return summarize(ingredient, rows.map(toLot), today);
}

// ---- Lots ---------------------------------------------------------------------------------------------

export type NewLot = {
	ingredientId: string;
	lotCode: string;
	unit: string;
	receivedOn?: string;
	expiresOn?: string;
	reviewOn?: string;
	location?: string;
	densityGPerMl?: string;
	densityTempC?: string;
	densitySource?: string;
	costPerUnit?: string;
	currency?: string;
};

/** Records a new lot with nothing in it. Stock arrives through a receipt, which is a ledger line of its own. */
export async function createLot(sql: Sql, actor: OperatorActor, input: NewLot): Promise<Lot> {
	const ingredient = await getIngredient(sql, input.ingredientId);
	if (!ingredient || ingredient.status !== "active")
		throw new InventoryError("not_found", "That ingredient doesn't exist.");
	const lotCode = tidy(input.lotCode, 80);
	if (!lotCode) throw new InventoryError("invalid", "Enter the supplier's lot or batch number.");
	const unit = unitField(input.unit);
	const density = decimalField("Density", input.densityGPerMl, { min: "positive", max: "30" });
	if (density && unit === "each")
		throw new InventoryError("invalid", "Something counted in pieces has no density.");
	if (density && !tidy(input.densitySource, 200))
		throw new InventoryError(
			"invalid",
			"Say where the density comes from (a specification sheet, a certificate of analysis).",
		);
	const cost = decimalField("Cost", input.costPerUnit, { min: "zero" });
	const currency = tidy(input.currency, 3).toUpperCase() || null;
	if (cost && !currency) throw new InventoryError("invalid", "A cost needs its currency, like CAD or USD.");
	if (currency && !/^[A-Z]{3}$/.test(currency))
		throw new InventoryError("invalid", "The currency is three letters, like CAD.");
	try {
		const { rows } = await sql.query(
			`insert into wai_ingredient_lots (ingredient_id, lot_code, unit, received_on, expires_on, review_on, location,
				density_g_per_ml, density_temp_c, density_source, cost_per_unit, currency, created_by)
			 values ($1,$2,$3,$4::date,$5::date,$6::date,$7,$8::numeric,$9::numeric,$10,$11::numeric,$12,$13) returning ${LOT_COLUMNS}`,
			[
				ingredient.id,
				lotCode,
				unit,
				dayField("Received date", input.receivedOn),
				dayField("Expiry date", input.expiresOn),
				dayField("Review date", input.reviewOn),
				tidy(input.location, 120) || null,
				text(density),
				text(decimalField("Density temperature", input.densityTempC)),
				tidy(input.densitySource, 200) || null,
				text(cost),
				cost ? currency : null,
				actorKey(actor),
			],
		);
		await audit(sql, {
			actor,
			action: "inventory.lot.create",
			subject: rows[0].id as string,
			outcome: "allowed",
			detail: { ingredient: ingredient.name, lotCode, unit },
		});
		return toLot(rows[0]);
	} catch (error) {
		if (error instanceof Error && /wai_lots_one_per_code/.test(error.message))
			throw new InventoryError("conflict", `${ingredient.name} already has a lot numbered ${lotCode}.`);
		throw error;
	}
}

export async function getLot(sql: Sql, id: string): Promise<Lot | null> {
	const { rows } = await sql.query(`select ${LOT_COLUMNS} from wai_ingredient_lots where id = $1`, [id]);
	return rows[0] ? toLot(rows[0]) : null;
}

// ---- The ledger ---------------------------------------------------------------------------------------

export type MovementRequest = {
	lotId: string;
	kind: string;
	/** The size of the movement in the lot's unit. For a correction, the signed change to what is on hand. */
	quantity?: string;
	reason?: string;
	reference?: string;
	toLocation?: string;
	basis?: string;
	otherQuantity?: string;
	/** Supplied by the form that made the request, so sending it twice moves stock once. */
	idempotencyKey: string;
};

export type MovementOutcome = { movement: Movement; lot: Lot; duplicate: boolean };

/**
 * Posts one movement to the ledger. The whole thing is one transaction with the lot locked, so two people reserving the last
 * of a lot at the same moment can't both succeed.
 */
export async function postMovement(
	sql: Sql,
	actor: OperatorActor,
	request: MovementRequest,
	today: string,
): Promise<MovementOutcome> {
	const kind = MOVEMENT_KINDS.find((k) => k === request.kind);
	// A refused attempt is logged here, outside the transaction, so the record of it isn't rolled back with the refusal.
	if (kind && OWNER_ONLY.includes(kind) && actor.role !== "owner")
		await audit(sql, {
			actor,
			action: `inventory.${kind}`,
			subject: request.lotId,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
	const outcome = await sql.transaction((tx) => applyMovement(tx, actor, request, today));
	if (!outcome.duplicate)
		await audit(sql, {
			actor,
			action: `inventory.${outcome.movement.kind}`,
			subject: outcome.lot.id,
			outcome: "allowed",
			detail: { lot: outcome.lot.lotCode, quantity: outcome.movement.quantity, unit: outcome.movement.unit },
		});
	return outcome;
}

/**
 * The work of one movement, inside a transaction the caller already holds. A batch uses this to reserve from several lots
 * at once, so that either every lot is reserved or none is.
 */
export async function applyMovement(
	tx: Sql,
	actor: OperatorActor,
	request: MovementRequest,
	today: string,
): Promise<MovementOutcome> {
	const kind = MOVEMENT_KINDS.find((k) => k === request.kind);
	if (!kind) throw new InventoryError("invalid", "That isn't a kind of stock movement.");
	const key = tidy(request.idempotencyKey, 120);
	if (key.length < 8)
		throw new InventoryError("invalid", "The request is missing its key. Reload the page and try again.");
	if (OWNER_ONLY.includes(kind) && actor.role !== "owner") {
		throw new InventoryError(
			"forbidden",
			`Only the owner can ${kind === "correction" ? "correct a balance" : "release a lot from quarantine"}.`,
		);
	}
	const reason = tidy(request.reason, 500) || null;
	const needsReason =
		kind === "correction" || kind === "waste" || kind === "quarantine" || kind === "quarantine_release";
	if (needsReason && !reason)
		throw new InventoryError("invalid", "Say why. The reason is kept with the ledger line.");
	const basis =
		(["measured", "calculated", "estimate"] as const).find((b) => b === request.basis) ?? "measured";

	{
		const existing = await tx.query(
			`select ${MOVEMENT_COLUMNS} from wai_stock_movements where idempotency_key = $1`,
			[key],
		);
		if (existing.rows[0]) {
			const movement = toMovement(existing.rows[0]);
			const lot = await getLot(tx, movement.lotId);
			return { movement, lot: lot as Lot, duplicate: true };
		}
		const locked = await tx.query(`select ${LOT_COLUMNS} from wai_ingredient_lots where id = $1 for update`, [
			request.lotId,
		]);
		if (!locked.rows[0]) throw new InventoryError("not_found", "That lot doesn't exist.");
		const lot = toLot(locked.rows[0]);
		if (lot.status === "retired") throw new InventoryError("conflict", "That lot has been retired.");
		const view = viewLot(lot, today);
		const onHand = dec(lot.onHand);
		const reserved = dec(lot.reserved);
		const free = sub(onHand, reserved);
		const amount = (label = "Quantity") => {
			const parsed = decimalField(label, request.quantity, { min: "positive" });
			if (!parsed) throw new InventoryError("invalid", `Enter the quantity in ${lot.unit}.`);
			if (lot.unit === "each" && !eq(round(parsed, 0), parsed))
				throw new InventoryError("invalid", "Something counted in pieces can't be moved in fractions.");
			return parsed;
		};
		const unusable = () =>
			lot.status === "quarantined"
				? `Lot ${lot.lotCode} is in quarantine, so none of it can be used.`
				: `Lot ${lot.lotCode} expired on ${lot.expiresOn}, so none of it can be used.`;

		let quantity: Dec = ZERO;
		let deltaOnHand: Dec = ZERO;
		let deltaReserved: Dec = ZERO;
		let status = lot.status;
		let toLocation: string | null = null;
		switch (kind) {
			case "receipt":
			case "return":
				quantity = amount();
				deltaOnHand = quantity;
				break;
			case "reservation":
				quantity = amount();
				if (lot.status !== "available" || view.expired) throw new InventoryError("conflict", unusable());
				if (gt(quantity, dec(view.usable)))
					throw new InventoryError(
						"conflict",
						`Only ${view.usable} ${lot.unit} of lot ${lot.lotCode} is usable. ${toText(quantity)} can't be reserved.`,
					);
				deltaReserved = quantity;
				break;
			case "reservation_release":
				quantity = amount();
				if (gt(quantity, reserved))
					throw new InventoryError(
						"conflict",
						`Only ${lot.reserved} ${lot.unit} of lot ${lot.lotCode} is reserved.`,
					);
				deltaReserved = sub(ZERO, quantity);
				break;
			case "consumption":
				quantity = amount();
				if (lot.status !== "available" || view.expired) throw new InventoryError("conflict", unusable());
				// Stock is reserved before it is used. Consumption takes from what was reserved, never from free stock.
				if (gt(quantity, reserved))
					throw new InventoryError(
						"conflict",
						`Only ${lot.reserved} ${lot.unit} of lot ${lot.lotCode} is reserved. Reserve it before recording that it was used.`,
					);
				deltaOnHand = sub(ZERO, quantity);
				deltaReserved = sub(ZERO, quantity);
				break;
			case "waste":
				quantity = amount();
				if (gt(quantity, free))
					throw new InventoryError(
						"conflict",
						`Only ${toText(free)} ${lot.unit} of lot ${lot.lotCode} isn't reserved. Release a reservation first if reserved stock was lost.`,
					);
				deltaOnHand = sub(ZERO, quantity);
				break;
			case "correction": {
				const change = decimalField("The change", request.quantity);
				if (!change || isZero(change))
					throw new InventoryError("invalid", "Enter the change to what is on hand, like 2.5 or -2.5.");
				const after = add(onHand, change);
				if (isNegative(after))
					throw new InventoryError(
						"conflict",
						`That would leave ${toText(after)} ${lot.unit} on hand. Stock can't be negative.`,
					);
				if (lt(after, reserved))
					throw new InventoryError(
						"conflict",
						`That would leave less on hand than the ${lot.reserved} ${lot.unit} reserved. Release a reservation first.`,
					);
				quantity = isNegative(change) ? sub(ZERO, change) : change;
				deltaOnHand = change;
				break;
			}
			case "transfer":
				toLocation = tidy(request.toLocation, 120);
				if (!toLocation) throw new InventoryError("invalid", "Say where the lot was moved to.");
				if (toLocation === (lot.location ?? ""))
					throw new InventoryError("conflict", "The lot is already there.");
				break;
			case "quarantine":
				if (lot.status === "quarantined")
					throw new InventoryError("conflict", "That lot is already in quarantine.");
				// A batch must not go on to use quarantined stock it had reserved.
				if (gt(reserved, ZERO))
					throw new InventoryError(
						"conflict",
						`${lot.reserved} ${lot.unit} of this lot is reserved. Release the reservations before putting it in quarantine.`,
					);
				status = "quarantined";
				break;
			case "quarantine_release":
				if (lot.status !== "quarantined")
					throw new InventoryError("conflict", "That lot isn't in quarantine.");
				status = "available";
				break;
		}

		const other = decimalField("The second measurement", request.otherQuantity, { min: "positive" });
		if (other && (kind !== "receipt" || lot.unit === "each"))
			throw new InventoryError(
				"invalid",
				"A second measurement is recorded only when a liquid lot is received.",
			);
		const onHandAfter = add(onHand, deltaOnHand);
		const reservedAfter = add(reserved, deltaReserved);
		const updated = await tx.query(
			`update wai_ingredient_lots set on_hand = $2::numeric, reserved = $3::numeric, status = $4,
				location = coalesce($5, location), updated_at = now() where id = $1 returning ${LOT_COLUMNS}`,
			[lot.id, toText(onHandAfter), toText(reservedAfter), status, toLocation],
		);
		const inserted = await tx.query(
			`insert into wai_stock_movements (lot_id, kind, quantity, unit, delta_on_hand, delta_reserved, on_hand_after,
				reserved_after, basis, other_quantity, other_unit, reason, reference, from_location, to_location, idempotency_key, actor)
			 values ($1,$2,$3::numeric,$4,$5::numeric,$6::numeric,$7::numeric,$8::numeric,$9,$10::numeric,$11,$12,$13,$14,$15,$16,$17)
			 returning ${MOVEMENT_COLUMNS}`,
			[
				lot.id,
				kind,
				toText(quantity),
				lot.unit,
				toText(deltaOnHand),
				toText(deltaReserved),
				toText(onHandAfter),
				toText(reservedAfter),
				basis,
				text(other),
				other ? (lot.unit === "mL" ? "g" : "mL") : null,
				reason,
				tidy(request.reference, 120) || null,
				kind === "transfer" ? lot.location : null,
				toLocation,
				key,
				actorKey(actor),
			],
		);
		return { movement: toMovement(inserted.rows[0]), lot: toLot(updated.rows[0]), duplicate: false };
	}
}

export type MovementView = Movement & {
	lotCode: string;
	ingredientId: string;
	ingredientName: string;
	/** Set when a receipt carried a second measurement that disagrees with the lot's documented density. */
	discrepancy: string | null;
};

/** Whether a receipt's two direct measurements agree with the lot's documented density, within the tolerance. */
export function densityDiscrepancy(movement: Movement, densityGPerMl: string | null): string | null {
	if (!movement.otherQuantity || !movement.otherUnit || !densityGPerMl || isZero(dec(movement.quantity)))
		return null;
	const density = dec(densityGPerMl);
	const millilitres = movement.unit === "mL" ? dec(movement.quantity) : dec(movement.otherQuantity);
	const grams = movement.unit === "g" ? dec(movement.quantity) : dec(movement.otherQuantity);
	if (isZero(millilitres)) return null;
	const implied = div(grams, millilitres);
	const difference = sub(implied, density);
	const percent = mul(div(isNegative(difference) ? sub(ZERO, difference) : difference, density), dec("100"));
	if (cmp(percent, dec(DENSITY_TOLERANCE_PERCENT)) <= 0) return null;
	return `The two measurements imply ${toText(round(implied, 4))} g/mL, ${toText(round(percent, 1))}% away from the documented ${densityGPerMl} g/mL.`;
}

export async function listMovements(
	sql: Sql,
	filter: { lotId?: string; ingredientId?: string; limit?: number } = {},
): Promise<MovementView[]> {
	const where: string[] = [];
	const params: unknown[] = [];
	if (filter.lotId) {
		params.push(filter.lotId);
		where.push(`m.lot_id = $${params.length}`);
	}
	if (filter.ingredientId) {
		params.push(filter.ingredientId);
		where.push(`l.ingredient_id = $${params.length}`);
	}
	params.push(Math.min(Math.max(filter.limit ?? 100, 1), 500));
	const columns = MOVEMENT_COLUMNS.split(",")
		.map((column) => `m.${column.trim()}`)
		.join(", ");
	const { rows } = await sql.query(
		`select ${columns}, l.lot_code, l.ingredient_id, l.density_g_per_ml::text as lot_density, i.name as ingredient_name
		 from wai_stock_movements m join wai_ingredient_lots l on l.id = m.lot_id join wai_ingredients i on i.id = l.ingredient_id
		 ${where.length ? `where ${where.join(" and ")}` : ""} order by m.at desc, m.id desc limit $${params.length}`,
		params,
	);
	return rows.map((r) => {
		const movement = toMovement(r);
		return {
			...movement,
			lotCode: r.lot_code as string,
			ingredientId: r.ingredient_id as string,
			ingredientName: r.ingredient_name as string,
			discrepancy: densityDiscrepancy(movement, num(r.lot_density)),
		};
	});
}

/**
 * Adds up the ledger for every lot and compares it with the balances kept on the lot. They are written together, so they
 * should always agree; this is the check that they do. Returns the lots that don't.
 */
export async function verifyLedger(
	sql: Sql,
): Promise<Array<{ lotId: string; lotCode: string; problem: string }>> {
	const { rows } = await sql.query(
		`select l.id, l.lot_code, l.on_hand::text as on_hand, l.reserved::text as reserved,
			coalesce(sum(m.delta_on_hand), 0)::text as ledger_on_hand, coalesce(sum(m.delta_reserved), 0)::text as ledger_reserved
		 from wai_ingredient_lots l left join wai_stock_movements m on m.lot_id = l.id group by l.id order by l.lot_code`,
	);
	return rows.flatMap((r) => {
		const problems: string[] = [];
		if (!eq(dec(String(r.on_hand)), dec(String(r.ledger_on_hand))))
			problems.push(`on hand is ${num(r.on_hand)} but the ledger adds up to ${num(r.ledger_on_hand)}`);
		if (!eq(dec(String(r.reserved)), dec(String(r.ledger_reserved))))
			problems.push(`reserved is ${num(r.reserved)} but the ledger adds up to ${num(r.ledger_reserved)}`);
		return problems.length
			? [{ lotId: r.id as string, lotCode: r.lot_code as string, problem: problems.join("; ") }]
			: [];
	});
}

// ---- For Stock and for the daily report ---------------------------------------------------------------

/**
 * The stored stock as the table Stock's replenishment function reads: one line per lot. Demand and lead time aren't stored
 * anywhere yet, so those columns are left for the person to fill in, and Stock leaves a line with no demand unplanned.
 */
export function stockSnapshot(items: readonly IngredientSummary[]): string {
	const lines = ["sku,on_hand,on_hold,reserved,unit,lot,expiry,daily_demand,min_stock,lead_time_days"];
	const cell = (value: string | null) =>
		value === null ? "" : /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
	for (const item of items)
		for (const lot of item.lots)
			lines.push(
				[
					cell(item.ingredient.sku ?? item.ingredient.name),
					lot.onHand,
					lot.quarantined,
					lot.reserved,
					lot.unit,
					cell(lot.lotCode),
					lot.expiresOn ?? "",
					"",
					item.ingredient.minStockUnit === lot.unit ? (item.ingredient.minStock ?? "") : "",
					"",
				].join(","),
			);
	return lines.join("\n");
}

export type InventoryFinding = {
	ingredientId: string;
	ingredient: string;
	kind: "low" | "expired" | "expiring" | "quarantine" | "density" | "carrier";
	text: string;
};

/** What in the inventory needs a person: the flags on every ingredient, sorted so the pressing ones come first. */
export function inventoryFindings(items: readonly IngredientSummary[]): InventoryFinding[] {
	const kindOf = (flag: string): InventoryFinding["kind"] =>
		flag.startsWith("Low stock")
			? "low"
			: flag.includes("expired on")
				? "expired"
				: flag.includes("expires on")
					? "expiring"
					: flag.includes("quarantine")
						? "quarantine"
						: flag.startsWith("Carrier")
							? "carrier"
							: "density";
	const order: Record<InventoryFinding["kind"], number> = {
		expired: 0,
		low: 1,
		quarantine: 2,
		expiring: 3,
		density: 4,
		carrier: 5,
	};
	return items
		.flatMap((item) =>
			item.flags.map((flag) => ({
				ingredientId: item.ingredient.id,
				ingredient: item.ingredient.name,
				kind: kindOf(flag),
				text: flag,
			})),
		)
		.sort((a, b) => order[a.kind] - order[b.kind]);
}
