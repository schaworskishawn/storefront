import {
	ZERO,
	add,
	dec,
	div,
	gt,
	isNegative,
	isZero,
	mul,
	sub,
	sum,
	toText,
	tryDec,
	type Dec,
} from "../decimal";

/**
 * The e-liquid recipe calculation, in exact decimals. Pure: it reads what it is given and returns quantities. Nothing here
 * is a measurement or a batch record.
 *
 * The rules it keeps:
 *  - Volume and weight are only related through a documented density: grams = mL × density. 1 mL is never assumed to be
 *    1 gram. Where no density is given, the weight is "unavailable", not estimated.
 *  - A nicotine base or a flavour concentrate is not assumed to be all PG. Each states how much of it is PG and VG, and that
 *    carrier counts toward the batch's PG and VG.
 *  - The target PG:VG ratio is the ratio of all the PG to all the VG in the batch, carriers included.
 *  - Summed ingredient volume is nominal. Mixed liquids need not add up exactly, so this is not a prediction of yield.
 */

export class RecipeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RecipeError";
	}
}

export type CarrierInput = {
	/** Percent of this liquid that is PG, and VG. Together at most 100; the rest is nicotine, flavouring or anything else. */
	pgPercent: string;
	vgPercent: string;
	/** Documented density in g/mL, if there is one. */
	density?: string;
};

export type RecipeInput = {
	batchMl: string;
	targetNicotineMgPerMl: string;
	/** Target share of PG among all PG and VG in the batch (0 to 100). VG is the rest. */
	targetPgPercent: string;
	nicotineBase: CarrierInput & { strengthMgPerMl: string };
	flavours: Array<CarrierInput & { name: string; percent: string }>;
	pgDensity?: string;
	vgDensity?: string;
};

export type RecipeLine = {
	ingredient: string;
	millilitres: string;
	/** Null when no density was documented: the weight is unavailable, not assumed. */
	grams: string | null;
	basis: string;
	percentOfBatch: string;
};

export type RecipeResult = {
	lines: RecipeLine[];
	totals: {
		nominalMl: string;
		/** Null unless every ingredient has a documented density. */
		grams: string | null;
		flavourPercent: string;
		calculatedNicotineMgPerMl: string;
		pgMl: string;
		vgMl: string;
		otherMl: string;
		pgShareOfPgVg: string;
	};
	notes: string[];
};

const HUNDRED = dec(100);

function number(
	label: string,
	value: string | undefined,
	options: { min?: Dec; max?: Dec; positive?: boolean } = {},
): Dec {
	const parsed = tryDec(value);
	if (!parsed) throw new RecipeError(`${label} must be a number.`);
	if (options.positive && !gt(parsed, ZERO)) throw new RecipeError(`${label} must be more than zero.`);
	if (isNegative(parsed)) throw new RecipeError(`${label} can't be negative.`);
	if (options.max && gt(parsed, options.max))
		throw new RecipeError(`${label} can't be more than ${toText(options.max)}.`);
	return parsed;
}

function carrier(label: string, input: CarrierInput): { pg: Dec; vg: Dec; density: Dec | null } {
	const pg = number(`${label}: PG percent`, input.pgPercent, { max: HUNDRED });
	const vg = number(`${label}: VG percent`, input.vgPercent, { max: HUNDRED });
	if (gt(add(pg, vg), HUNDRED))
		throw new RecipeError(`${label}: PG and VG together can't be more than 100 percent.`);
	const density = input.density?.trim()
		? number(`${label}: density`, input.density, { positive: true })
		: null;
	return { pg, vg, density };
}

const share = (volume: Dec, percent: Dec) => div(mul(volume, percent), HUNDRED);

export function calculateRecipe(input: RecipeInput): RecipeResult {
	const batch = number("Batch size", input.batchMl, { positive: true });
	const target = number("Target nicotine", input.targetNicotineMgPerMl);
	const targetPg = number("Target PG percent", input.targetPgPercent, { max: HUNDRED });
	const notes: string[] = [];

	// Nicotine base: base mL = target mg/mL × batch mL ÷ base mg/mL. A zero target needs no base at all.
	let baseMl = ZERO;
	let base = { pg: ZERO, vg: ZERO, density: null as Dec | null };
	if (!isZero(target)) {
		const strength = number("Nicotine base strength", input.nicotineBase.strengthMgPerMl, { positive: true });
		if (gt(target, strength))
			throw new RecipeError(
				"The target nicotine strength is higher than the base's, so no amount of base can reach it.",
			);
		base = carrier("Nicotine base", input.nicotineBase);
		baseMl = div(mul(target, batch), strength);
	}

	const flavours = input.flavours
		.filter((f) => f.name.trim() !== "" || f.percent.trim() !== "")
		.map((f, index) => {
			const name = f.name.trim() || `Flavour ${index + 1}`;
			const percent = number(`${name}: percent`, f.percent, { max: HUNDRED });
			return { name, percent, ml: share(batch, percent), ...carrier(name, f) };
		});
	const flavourPercent = sum(flavours.map((f) => f.percent));
	const flavourMl = sum(flavours.map((f) => f.ml));
	if (gt(add(baseMl, flavourMl), batch))
		throw new RecipeError("The nicotine base and the flavours together are more than the batch.");

	// PG and VG already brought in by the base and the flavours, and what in them is neither.
	const carried = [
		{ ml: baseMl, pg: base.pg, vg: base.vg },
		...flavours.map((f) => ({ ml: f.ml, pg: f.pg, vg: f.vg })),
	];
	const carriedPg = sum(carried.map((c) => share(c.ml, c.pg)));
	const carriedVg = sum(carried.map((c) => share(c.ml, c.vg)));
	const other = sub(add(baseMl, flavourMl), add(carriedPg, carriedVg));

	// Everything that isn't "other" is PG or VG, split at the target ratio.
	const pgVgTotal = sub(batch, other);
	const pgTotal = share(pgVgTotal, targetPg);
	const vgTotal = sub(pgVgTotal, pgTotal);
	const addPg = sub(pgTotal, carriedPg);
	const addVg = sub(vgTotal, carriedVg);
	if (isNegative(addPg))
		throw new RecipeError(
			`The base and flavours already bring ${toText(carriedPg, 2)} mL of PG, more than the ${toText(pgTotal, 2)} mL this ratio allows. Raise the PG share or change the ingredients.`,
		);
	if (isNegative(addVg))
		throw new RecipeError(
			`The base and flavours already bring ${toText(carriedVg, 2)} mL of VG, more than the ${toText(vgTotal, 2)} mL this ratio allows. Lower the PG share or change the ingredients.`,
		);

	const pgDensity = input.pgDensity?.trim()
		? number("PG density", input.pgDensity, { positive: true })
		: null;
	const vgDensity = input.vgDensity?.trim()
		? number("VG density", input.vgDensity, { positive: true })
		: null;

	const line = (ingredient: string, ml: Dec, density: Dec | null): RecipeLine & { rawGrams: Dec | null } => {
		const grams = density ? mul(ml, density) : null;
		return {
			ingredient,
			millilitres: toText(ml, 2),
			grams: grams ? toText(grams, 2) : null,
			rawGrams: grams,
			basis: density
				? `Weight calculated at ${toText(density)} g/mL`
				: "No documented density: weight unavailable",
			percentOfBatch: toText(div(mul(ml, HUNDRED), batch), 2),
		};
	};
	const built = [
		...(isZero(baseMl)
			? []
			: [
					line(
						`Nicotine base (${toText(dec(input.nicotineBase.strengthMgPerMl))} mg/mL)`,
						baseMl,
						base.density,
					),
				]),
		...flavours.map((f) => line(f.name, f.ml, f.density)),
		line("PG to add", addPg, pgDensity),
		line("VG to add", addVg, vgDensity),
	];
	const used = built.filter(
		(l) => l.millilitres !== "0.00" || l.ingredient.startsWith("PG") || l.ingredient.startsWith("VG"),
	);
	const everyWeightKnown = used.every((l) => l.rawGrams !== null || l.millilitres === "0.00");
	const missing = used
		.filter((l) => l.rawGrams === null && l.millilitres !== "0.00")
		.map((l) => l.ingredient);
	if (missing.length)
		notes.push(
			`No density was given for: ${missing.join(", ")}. Their weights, and the batch's total weight, are unavailable. Weigh by volume, or enter the documented density.`,
		);
	if (isZero(target)) notes.push("Zero-nicotine batch: no nicotine base is used.");
	if (!isZero(other))
		notes.push(
			`${toText(other, 2)} mL of the batch is neither PG nor VG (nicotine, flavouring and other parts of the concentrates). The PG:VG ratio is of the rest.`,
		);
	notes.push(
		"The total volume is nominal: it adds ingredient volumes, and mixed liquids need not add up exactly. Measure the finished batch.",
	);
	notes.push("These are calculated quantities, not measurements, and not a laboratory result.");

	return {
		lines: used.map(({ rawGrams: _raw, ...rest }) => rest),
		totals: {
			nominalMl: toText(sum([baseMl, flavourMl, addPg, addVg]), 2),
			grams: everyWeightKnown ? toText(sum(used.map((l) => l.rawGrams ?? ZERO)), 2) : null,
			flavourPercent: toText(flavourPercent, 2),
			calculatedNicotineMgPerMl: isZero(target)
				? "0.00"
				: toText(div(mul(baseMl, dec(input.nicotineBase.strengthMgPerMl)), batch), 2),
			pgMl: toText(pgTotal, 2),
			vgMl: toText(vgTotal, 2),
			otherMl: toText(other, 2),
			pgShareOfPgVg: isZero(pgVgTotal) ? "0.00" : toText(div(mul(pgTotal, HUNDRED), pgVgTotal), 2),
		},
		notes,
	};
}

/** grams = mL × density, and the other way round. Returns null without a density: nothing is assumed. */
export function convert(
	quantity: string,
	from: "mL" | "g",
	density: string | undefined,
): { millilitres: string | null; grams: string | null; basis: string } {
	const value = number("Quantity", quantity);
	const d = density?.trim() ? number("Density", density, { positive: true }) : null;
	if (from === "mL")
		return {
			millilitres: toText(value, 3),
			grams: d ? toText(mul(value, d), 3) : null,
			basis: d ? `Calculated at ${toText(d)} g/mL` : "No density: the weight is unavailable",
		};
	return {
		millilitres: d ? toText(div(value, d), 3) : null,
		grams: toText(value, 3),
		basis: d ? `Calculated at ${toText(d)} g/mL` : "No density: the volume is unavailable",
	};
}
