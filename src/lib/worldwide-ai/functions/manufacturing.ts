import { z } from "zod";
import {
	ZERO,
	add,
	dec,
	div,
	gt,
	gte,
	isZero,
	lt,
	lte,
	maxDec,
	mul,
	percentOf,
	sub,
	sum,
	type Dec,
} from "../decimal";
import { daysBetween } from "../time";
import {
	block,
	count,
	fixed,
	lower,
	nullableText,
	num,
	numOrNull,
	plain,
	plural,
	text,
	texts,
} from "./helpers";
import { groupBy, type Row } from "./table";
import { defineFunction } from "./types";

/**
 * Batch, Tempo, Qualify, Assay, Assure, Gauge, Clean, Coach, Comply and Safeguard. These work only from what staff recorded
 * and supplied. None of them observes anything physical: a missing reading stays missing, a prepared checklist is not a
 * cleaned line, and nothing here approves a supplier, accepts a test, lifts a hold or releases a batch.
 */

const yes = (value: string | undefined) => /^(yes|y|true|1)$/i.test((value ?? "").trim());
const isOpen = (value: string | undefined) =>
	!/^(closed|resolved|done|complete|completed)$/i.test((value ?? "").trim());

// ---- Batch ------------------------------------------------------------------------------------------

export const batchRecordReconciliation = defineFunction({
	id: "batch.record-reconciliation",
	version: 1,
	agent: "batch",
	action: "Reconcile batch records",
	outputType: "BatchReconciliation",
	purpose:
		"Reconciles a batch from the quantities staff recorded: what went in by lot, against finished output, samples, waste and remaining bulk, converting between mL and grams only where a documented density exists.",
	expectedResult:
		"A batch reconciliation is stored with input and output balances on a volume basis, yield, the unexplained difference, each input's variance from plan, and every quantity that couldn't be converted.",
	notThis:
		"Nothing is inferred: summed ingredient volume is nominal, 1 mL is never assumed to be 1 gram, and a missing observation stays missing. It does not release the batch.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "batch", label: "Batch", kind: "text", required: true, max: 80 },
		{ key: "formula", label: "Approved formula and version", kind: "text", required: true, max: 120 },
		{
			key: "tolerancePercent",
			label: "Unexplained difference you would investigate (%)",
			kind: "decimal",
			help: "From your approved procedure. Leave blank to report the figure without judging it.",
		},
		{
			key: "inputs",
			label: "Ingredients used (as recorded)",
			kind: "table",
			required: true,
			columns: [
				{ key: "material", label: "Material", required: true, aliases: ["ingredient"] },
				{ key: "lot", label: "Lot", required: true },
				{ key: "quantity", label: "Quantity", required: true, kind: "decimal", aliases: ["actual"] },
				{ key: "unit", label: "Unit", required: true },
				{ key: "planned", label: "Planned (mL)", kind: "decimal", aliases: ["planned"] },
			],
		},
		{
			key: "outputs",
			label: "Output, samples, waste and remaining bulk",
			kind: "table",
			required: true,
			columns: [
				{ key: "kind", label: "Kind", required: true, aliases: ["type"] },
				{ key: "quantity", label: "Quantity", required: true, kind: "decimal" },
				{ key: "unit", label: "Unit", required: true },
				{ key: "note", label: "Note" },
			],
		},
		{
			key: "densities",
			label: "Documented densities",
			kind: "table",
			columns: [
				{ key: "material", label: "Material", required: true },
				{
					key: "density",
					label: "Density (g/mL)",
					required: true,
					kind: "decimal",
					aliases: ["density g per ml", "g/ml"],
				},
				{ key: "source", label: "Source", required: true, aliases: ["reference"] },
			],
		},
	],
	output: z.object({
		batch: text,
		formula: text,
		inputs: z.array(
			z.object({
				material: text,
				lot: text,
				recorded: text,
				millilitres: nullableText,
				basis: text,
				planned: nullableText,
				variance: nullableText,
			}),
		),
		outputs: z.array(z.object({ kind: text, recorded: text, millilitres: nullableText, basis: text })),
		balance: z.object({
			inputMl: text,
			finishedMl: text,
			samplesMl: text,
			wasteMl: text,
			remainingMl: text,
			outputMl: text,
			unexplainedMl: text,
			unexplainedPercent: nullableText,
			yieldPercent: nullableText,
		}),
		complete: z.boolean(),
		exceptions: texts,
	}),
	sample: () => ({
		batch: "[DEMO] B-2026-041",
		formula: "[DEMO] Mango Ice 12 mg, version 4",
		tolerancePercent: "2",
		inputs:
			"material,lot,quantity,unit,planned\nPG base,L-100,2400,mL,2400\nVG base,L-200,3050,g,2400\nNicotine 100 mg/mL,L-310,600,mL,600\nFlavour A,L-300,600,mL,600",
		outputs:
			"kind,quantity,unit,note\nfinished,5820,mL,Measured into holding tank\nsample,30,mL,Retained sample\nwaste,45,mL,Line flush\nremaining_bulk,0,mL,",
		densities:
			"material,density,source\nVG base,1.261,Supplier specification sheet rev 3 (demonstration value)",
	}),
	async handler(ctx) {
		const densities = new Map(
			ctx.rows("densities").map((d) => [lower(d.material), { value: num(d, "density"), source: d.source }]),
		);
		for (const [material, density] of densities)
			if (!gt(density.value, ZERO)) block(`The density for ${material} must be more than zero.`);
		const exceptions: string[] = [];
		const toMl = (material: string, quantity: Dec, unit: string): { ml: Dec | null; basis: string } => {
			const u = lower(unit);
			if (u === "ml") return { ml: quantity, basis: "Measured in mL" };
			if (u === "l") return { ml: mul(quantity, dec(1000)), basis: "Measured in litres" };
			if (u === "g" || u === "kg") {
				const density = densities.get(lower(material));
				if (!density)
					return { ml: null, basis: `Recorded in ${unit}; no documented density, so not converted` };
				const grams = u === "kg" ? mul(quantity, dec(1000)) : quantity;
				return {
					ml: div(grams, density.value),
					basis: `Calculated from ${unit} at ${plain(density.value)} g/mL (${density.source})`,
				};
			}
			return { ml: null, basis: `Unit "${unit}" isn't mL, L, g or kg` };
		};
		const inputs = ctx.rows("inputs").map((row) => {
			const quantity = num(row, "quantity");
			const converted = toMl(row.material, quantity, row.unit);
			const planned = numOrNull(row, "planned");
			if (!converted.ml) exceptions.push(`${row.material} (lot ${row.lot}): ${converted.basis}.`);
			return {
				material: row.material,
				lot: row.lot,
				recorded: `${plain(quantity)} ${row.unit}`,
				millilitres: converted.ml ? fixed(converted.ml, 2) : null,
				ml: converted.ml,
				basis: converted.basis,
				planned: planned ? `${plain(planned)} mL` : null,
				variance: planned && converted.ml ? fixed(sub(converted.ml, planned), 2) : null,
			};
		});
		const kinds = {
			finished: "finished",
			sample: "samples",
			samples: "samples",
			waste: "waste",
			spill: "waste",
			remaining_bulk: "remaining",
			remaining: "remaining",
			returned: "remaining",
		} as const;
		const outputs = ctx.rows("outputs").map((row) => {
			const bucket = kinds[lower(row.kind).replace(/\s+/g, "_") as keyof typeof kinds];
			if (!bucket)
				block(`Output kind "${row.kind}" isn't one of: finished, sample, waste, remaining_bulk, returned.`);
			const quantity = num(row, "quantity");
			const converted = toMl("finished liquid", quantity, row.unit);
			if (!converted.ml)
				exceptions.push(
					`${row.kind}: ${converted.basis}. Give the finished liquid's documented density to convert it.`,
				);
			return {
				kind: lower(row.kind),
				bucket,
				recorded: `${plain(quantity)} ${row.unit}`,
				millilitres: converted.ml ? fixed(converted.ml, 2) : null,
				ml: converted.ml,
				basis: converted.basis,
			};
		});
		const complete = inputs.every((i) => i.ml) && outputs.every((o) => o.ml);
		const total = (values: Array<Dec | null>) => sum(values.filter((v): v is Dec => v !== null));
		const inputMl = total(inputs.map((i) => i.ml));
		const of = (bucket: string) => total(outputs.filter((o) => o.bucket === bucket).map((o) => o.ml));
		const outputMl = total(outputs.map((o) => o.ml));
		const unexplained = sub(inputMl, outputMl);
		const unexplainedPercent = complete ? percentOf(unexplained, inputMl) : null;
		if (!outputs.some((o) => o.bucket === "finished")) exceptions.push("No finished output was recorded.");
		const tolerance = ctx.text("tolerancePercent");
		if (
			complete &&
			tolerance &&
			unexplainedPercent &&
			gt(dec(unexplainedPercent.replace("-", "")), dec(tolerance))
		)
			exceptions.push(
				`The unexplained difference is ${unexplainedPercent}% of input, beyond the ${tolerance}% you set. It needs an investigation, not an adjustment.`,
			);
		for (const input of inputs)
			if (input.variance && !isZero(dec(input.variance)))
				exceptions.push(`${input.material} (lot ${input.lot}) differs from plan by ${input.variance} mL.`);
		return {
			output: {
				batch: ctx.text("batch"),
				formula: ctx.text("formula"),
				inputs: inputs.map(({ ml: _ml, ...rest }) => rest),
				outputs: outputs.map(({ ml: _ml, bucket: _bucket, ...rest }) => rest),
				balance: {
					inputMl: fixed(inputMl, 2),
					finishedMl: fixed(of("finished"), 2),
					samplesMl: fixed(of("samples"), 2),
					wasteMl: fixed(of("waste"), 2),
					remainingMl: fixed(of("remaining"), 2),
					outputMl: fixed(outputMl, 2),
					unexplainedMl: fixed(unexplained, 2),
					unexplainedPercent,
					yieldPercent: complete ? percentOf(of("finished"), inputMl) : null,
				},
				complete,
				exceptions,
			},
			summary: complete
				? `Batch ${ctx.text("batch")}: ${fixed(inputMl, 2)} mL in, ${fixed(outputMl, 2)} mL accounted for, ${fixed(unexplained, 2)} mL unexplained (${unexplainedPercent ?? "n/a"}%).`
				: `Batch ${ctx.text("batch")}: the balance is incomplete because ${plural(inputs.filter((i) => !i.ml).length + outputs.filter((o) => !o.ml).length, "quantity", "quantities")} couldn't be converted.`,
			missing: [
				...inputs.filter((i) => !i.ml).map((i) => `A documented density for ${i.material}.`),
				...(outputs.some((o) => !o.ml) ? ["A documented density for the finished liquid."] : []),
			],
			assumptions: [
				"The volume balance adds ingredient volumes, which is nominal: mixed liquids need not add up exactly, so a small difference is not by itself a loss.",
				"Quantities are the ones staff recorded; none was read from an instrument here.",
			],
			coverage: { "Ingredient lots": inputs.length, "Output lines": outputs.length },
			warnings: complete
				? []
				: [
						"Totals leave out the quantities that couldn't be converted. Do not rely on the balance until they are resolved.",
					],
		};
	},
});

// ---- Tempo ------------------------------------------------------------------------------------------

export const tempoProductionPlan = defineFunction({
	id: "tempo.production-plan",
	version: 1,
	agent: "tempo",
	action: "Draft production schedule",
	outputType: "ProductionPlan",
	purpose:
		"Checks reviewed demand against eligible material stock and equipment hours, and proposes manufacturing orders in due-date order with their run and changeover time.",
	expectedResult:
		"A production plan is stored with proposed manufacturing orders, the material each needs against eligible stock, the hours used against hours available, every shortage, and the constraints it did not check.",
	notThis:
		"A plan is a proposal. It checks materials and equipment hours only, says which constraints it didn't check, and never starts a machine, consumes stock or authorizes production.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "plan", label: "Plan name", kind: "text", required: true, max: 120 },
		{
			key: "availableHours",
			label: "Equipment hours available in the period",
			kind: "decimal",
			required: true,
		},
		{ key: "ratePerHour", label: "Output rate (mL per hour)", kind: "decimal", required: true },
		{
			key: "changeoverHours",
			label: "Cleaning and changeover between products (hours)",
			kind: "decimal",
			required: true,
		},
		{
			key: "demand",
			label: "Reviewed demand",
			kind: "table",
			required: true,
			maxRows: 100,
			columns: [
				{ key: "product", label: "Product", required: true },
				{
					key: "quantity_ml",
					label: "Quantity (mL)",
					required: true,
					kind: "decimal",
					aliases: ["quantity", "ml"],
				},
				{ key: "due", label: "Due", kind: "date" },
				{ key: "formula", label: "Formula version", required: true, aliases: ["formula version"] },
			],
		},
		{
			key: "usage",
			label: "Material per litre of product (from the approved formula)",
			kind: "table",
			required: true,
			columns: [
				{ key: "product", label: "Product", required: true },
				{ key: "material", label: "Material", required: true },
				{
					key: "ml_per_litre",
					label: "mL per litre",
					required: true,
					kind: "decimal",
					aliases: ["ml per l"],
				},
			],
		},
		{
			key: "stock",
			label: "Eligible material stock",
			kind: "table",
			required: true,
			columns: [
				{ key: "material", label: "Material", required: true },
				{
					key: "eligible_ml",
					label: "Eligible (mL)",
					required: true,
					kind: "decimal",
					aliases: ["usable", "available"],
				},
			],
		},
	],
	output: z.object({
		plan: text,
		orders: z.array(
			z.object({
				sequence: count,
				product: text,
				formula: text,
				quantityMl: text,
				due: nullableText,
				runHours: text,
				changeoverHours: text,
				startsAtHour: text,
				endsAtHour: text,
				fits: z.boolean(),
				materialsCovered: z.boolean(),
			}),
		),
		materials: z.array(z.object({ material: text, required: text, eligible: text, shortBy: text })),
		capacity: z.object({ hoursNeeded: text, hoursAvailable: text, shortByHours: text }),
		feasibility: z.enum(["feasible_on_checked_constraints", "not_feasible"]),
		checked: texts,
		notChecked: texts,
		blockers: texts,
	}),
	sample: () => ({
		plan: "[DEMO] Week 42",
		availableHours: "30",
		ratePerHour: "4000",
		changeoverHours: "1.5",
		demand:
			"product,quantity_ml,due,formula\nMango Ice 12mg,60000,2026-10-16,v4\nBerry 6mg,40000,2026-10-14,v2",
		usage:
			"product,material,ml_per_litre\nMango Ice 12mg,PG base,400\nMango Ice 12mg,VG base,400\nMango Ice 12mg,Flavour A,100\nBerry 6mg,PG base,450\nBerry 6mg,VG base,450\nBerry 6mg,Flavour B,60",
		stock: "material,eligible_ml\nPG base,50000\nVG base,38000\nFlavour A,9000\nFlavour B,1000",
	}),
	async handler(ctx) {
		const rate = dec(ctx.text("ratePerHour"));
		const available = dec(ctx.text("availableHours"));
		const changeover = dec(ctx.text("changeoverHours"));
		if (!gt(rate, ZERO)) block("The output rate must be more than zero.");
		const usage = ctx.rows("usage");
		const remaining = new Map(ctx.rows("stock").map((s) => [lower(s.material), num(s, "eligible_ml")]));
		const required = new Map<string, Dec>();
		const blockers: string[] = [];
		const demand = [...ctx.rows("demand")].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
		let clock = ZERO;
		const orders = demand.map((row, index) => {
			const quantity = num(row, "quantity_ml");
			const needs = usage.filter((u) => lower(u.product) === lower(row.product));
			if (needs.length === 0)
				blockers.push(
					`${row.product}: no material usage was supplied for it, so its materials weren't checked.`,
				);
			let covered = needs.length > 0;
			for (const need of needs) {
				const amount = div(mul(quantity, num(need, "ml_per_litre")), dec(1000));
				const key = lower(need.material);
				required.set(key, add(required.get(key) ?? ZERO, amount));
				const left = remaining.get(key);
				if (left === undefined) {
					covered = false;
					blockers.push(`${row.product}: ${need.material} isn't in the eligible stock supplied.`);
				} else {
					if (lt(left, amount)) covered = false;
					remaining.set(key, sub(left, amount));
				}
			}
			const turn = index === 0 ? ZERO : changeover;
			const run = div(quantity, rate);
			const start = add(clock, turn);
			clock = add(start, run);
			return {
				sequence: index + 1,
				product: row.product,
				formula: row.formula,
				quantityMl: plain(quantity),
				due: row.due || null,
				runHours: fixed(run, 2),
				changeoverHours: fixed(turn, 2),
				startsAtHour: fixed(start, 2),
				endsAtHour: fixed(clock, 2),
				fits: lte(clock, available),
				materialsCovered: covered,
			};
		});
		const stockNames = new Map(ctx.rows("stock").map((s) => [lower(s.material), s.material]));
		const eligible = new Map(ctx.rows("stock").map((s) => [lower(s.material), num(s, "eligible_ml")]));
		const materials = [...required].map(([key, amount]) => {
			const have = eligible.get(key) ?? ZERO;
			const short = maxDec(ZERO, sub(amount, have));
			if (gt(short, ZERO))
				blockers.push(
					`${stockNames.get(key) ?? key}: ${fixed(amount, 0)} mL needed, ${fixed(have, 0)} mL eligible (short ${fixed(short, 0)} mL).`,
				);
			return {
				material: stockNames.get(key) ?? key,
				required: fixed(amount, 2),
				eligible: fixed(have, 2),
				shortBy: fixed(short, 2),
			};
		});
		const shortHours = maxDec(ZERO, sub(clock, available));
		if (gt(shortHours, ZERO))
			blockers.push(
				`The schedule needs ${fixed(clock, 2)} hours and ${fixed(available, 2)} are available (short ${fixed(shortHours, 2)}).`,
			);
		for (const row of demand.filter((r) => !r.due))
			blockers.push(`${row.product} has no due date, so it was scheduled last.`);
		const feasible = orders.every((o) => o.fits && o.materialsCovered);
		return {
			output: {
				plan: ctx.text("plan"),
				orders,
				materials,
				capacity: {
					hoursNeeded: fixed(clock, 2),
					hoursAvailable: fixed(available, 2),
					shortByHours: fixed(shortHours, 2),
				},
				feasibility: feasible ? "feasible_on_checked_constraints" : "not_feasible",
				checked: ["Eligible material stock", "Equipment run hours", "Changeover time between products"],
				notChecked: [
					"Staff qualifications and availability",
					"Calibration and maintenance status of the equipment",
					"Line clearance records",
					"Packaging materials",
				],
				blockers,
			},
			summary: feasible
				? `${plural(orders.length, "order")} fit in ${fixed(clock, 2)} of ${fixed(available, 2)} hours with materials covered. Staffing, calibration and clearance were not checked.`
				: `Not feasible as supplied: ${plural(blockers.length, "blocker")}.`,
			missing: [
				"Staff qualifications, equipment calibration status and line clearance weren't supplied, so this plan can't be called authorized or fully feasible.",
			],
			assumptions: [
				"Orders run one after another on one line, in due-date order.",
				"Stock is allocated in that same order; an earlier order is supplied first.",
			],
			coverage: { "Demand lines": orders.length, "Materials checked": materials.length },
		};
	},
});

// ---- Qualify ----------------------------------------------------------------------------------------

export const qualifySupplierPackage = defineFunction({
	id: "qualify.supplier-package",
	version: 1,
	agent: "qualify",
	action: "Review supplier qualification",
	outputType: "SupplierQualificationPackage",
	purpose:
		"Assembles a supplier's qualification evidence for one material: which required documents are on file with their versions and expiry, what is missing or expired, and which quality issues are still open.",
	expectedResult:
		"A supplier qualification package is stored with each required document's status, version and expiry, the gaps, open quality issues and rejected lots, for an authorized person's decision.",
	notThis:
		"It assembles evidence. It does not approve the supplier, substitute a material, or release anything from quarantine.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "supplier", label: "Supplier", kind: "text", required: true, max: 120 },
		{ key: "site", label: "Site", kind: "text", max: 120 },
		{ key: "material", label: "Material", kind: "text", required: true, max: 120 },
		{ key: "asOf", label: "As of", kind: "date" },
		{
			key: "requiredDocuments",
			label: "Documents required for qualification",
			kind: "list",
			required: true,
			maxItems: 20,
		},
		{
			key: "documents",
			label: "Documents on file",
			kind: "table",
			columns: [
				{ key: "document", label: "Document", required: true, aliases: ["type"] },
				{ key: "version", label: "Version" },
				{ key: "issued", label: "Issued", kind: "date" },
				{ key: "expires", label: "Expires", kind: "date", aliases: ["expiry", "valid until"] },
				{ key: "reference", label: "Reference" },
			],
		},
		{
			key: "issues",
			label: "Quality issues and rejected lots",
			kind: "table",
			columns: [
				{ key: "issue", label: "Issue", required: true },
				{ key: "status", label: "Status", required: true },
				{ key: "lot", label: "Lot" },
				{ key: "opened", label: "Opened", kind: "date" },
				{ key: "rejected", label: "Lot rejected" },
			],
		},
	],
	output: z.object({
		supplier: text,
		site: text,
		material: text,
		asOf: text,
		documents: z.array(
			z.object({
				document: text,
				status: z.enum(["current", "expiring", "expired", "missing", "no_expiry_recorded"]),
				version: text,
				expires: nullableText,
				reference: text,
			}),
		),
		openIssues: z.array(z.object({ issue: text, lot: text, opened: text })),
		rejectedLots: texts,
		evidenceComplete: z.boolean(),
		gaps: texts,
	}),
	sample: () => ({
		supplier: "[DEMO] Demo Supply",
		site: "Winnipeg plant",
		material: "VG base",
		asOf: "2026-10-09",
		requiredDocuments: "Specification\nSafety data sheet\nCertificate of analysis\nQuality agreement",
		documents:
			"document,version,issued,expires,reference\nSpecification,rev 3,2026-01-10,,SPEC-VG-3\nSafety data sheet,2024,2024-03-01,2026-09-01,SDS-VG\nCertificate of analysis,lot L-200,2026-08-12,2026-11-01,COA-L200",
		issues:
			"issue,status,lot,opened,rejected\nCloudy appearance on receipt,open,L-190,2026-07-02,yes\nLate delivery,closed,,2026-05-11,no",
	}),
	async handler(ctx) {
		const asOf = ctx.text("asOf") || ctx.today;
		const onFile = groupBy(ctx.rows("documents"), (d) => lower(d.document));
		const gaps: string[] = [];
		const documents = ctx.list("requiredDocuments").map((name) => {
			const versions = onFile.get(lower(name)) ?? [];
			const latest = [...versions].sort((a, b) => (b.issued || "").localeCompare(a.issued || ""))[0];
			if (!latest) {
				gaps.push(`${name} is not on file.`);
				return { document: name, status: "missing" as const, version: "", expires: null, reference: "" };
			}
			const days = latest.expires ? daysBetween(asOf, latest.expires) : null;
			const status =
				days === null
					? ("no_expiry_recorded" as const)
					: days < 0
						? ("expired" as const)
						: days <= 60
							? ("expiring" as const)
							: ("current" as const);
			if (status === "expired")
				gaps.push(`${name} (${latest.version || "no version"}) expired on ${latest.expires}.`);
			if (status === "expiring")
				gaps.push(`${name} expires on ${latest.expires}, in ${plural(days ?? 0, "day")}.`);
			return {
				document: name,
				status,
				version: latest.version || "",
				expires: latest.expires || null,
				reference: latest.reference || "",
			};
		});
		const issues = ctx.rows("issues");
		const openIssues = issues
			.filter((i) => isOpen(i.status))
			.map((i) => ({ issue: i.issue, lot: i.lot || "", opened: i.opened || "" }));
		for (const open of openIssues)
			gaps.push(`Open quality issue: ${open.issue}${open.lot ? ` (lot ${open.lot})` : ""}.`);
		const evidenceComplete =
			documents.every((d) => d.status === "current" || d.status === "no_expiry_recorded") &&
			openIssues.length === 0;
		return {
			output: {
				supplier: ctx.text("supplier"),
				site: ctx.text("site"),
				material: ctx.text("material"),
				asOf,
				documents,
				openIssues,
				rejectedLots: [...new Set(issues.filter((i) => yes(i.rejected) && i.lot).map((i) => i.lot))],
				evidenceComplete,
				gaps,
			},
			summary: evidenceComplete
				? `${ctx.text("supplier")} / ${ctx.text("material")}: every required document is on file and current, with no open issue. Approval is still a person's decision.`
				: `${ctx.text("supplier")} / ${ctx.text("material")}: ${plural(gaps.length, "gap")} in the qualification evidence.`,
			missing: documents.filter((d) => d.status === "missing").map((d) => d.document),
			assumptions: [
				"A document within 60 days of expiry is shown as expiring.",
				"Documents are matched to requirements by name.",
			],
			coverage: { "Required documents": documents.length, "Issues on record": issues.length },
		};
	},
});

// ---- Assay ------------------------------------------------------------------------------------------

export const assayLabReview = defineFunction({
	id: "assay.lab-review",
	version: 1,
	agent: "assay",
	action: "Review laboratory evidence",
	outputType: "LaboratoryEvidenceReview",
	purpose:
		"Reconciles a lot's planned tests with the verified laboratory results on file and compares each result to its approved specification, in the same unit and method.",
	expectedResult:
		"A laboratory evidence review is stored with each planned test's verified result, its comparison to the approved limits, results that couldn't be compared, and the tests still outstanding.",
	notThis:
		"It performs no analysis and accepts no test. A result inside its limits is a specification match, not a declaration that anything is safe, and an unverified transcription is not used.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "lot", label: "Lot", kind: "text", required: true, max: 80 },
		{
			key: "samplingPlan",
			label: "Approved sampling plan and version",
			kind: "text",
			required: true,
			max: 160,
		},
		{
			key: "tests",
			label: "Planned tests and approved limits",
			kind: "table",
			required: true,
			columns: [
				{ key: "test", label: "Test", required: true },
				{ key: "unit", label: "Unit", required: true },
				{ key: "min", label: "Minimum", kind: "decimal", aliases: ["lower limit"] },
				{ key: "max", label: "Maximum", kind: "decimal", aliases: ["upper limit"] },
				{
					key: "spec_version",
					label: "Specification version",
					required: true,
					aliases: ["specification", "spec"],
				},
				{ key: "method", label: "Method" },
			],
		},
		{
			key: "results",
			label: "Laboratory results on file",
			kind: "table",
			columns: [
				{ key: "test", label: "Test", required: true },
				{ key: "value", label: "Value", required: true, kind: "decimal", aliases: ["result"] },
				{ key: "unit", label: "Unit", required: true },
				{ key: "sample_id", label: "Sample id", required: true, aliases: ["sample"] },
				{ key: "report_ref", label: "Report reference", required: true, aliases: ["report"] },
				{ key: "verified", label: "Transcription verified", required: true },
				{ key: "method", label: "Method" },
				{ key: "lab", label: "Laboratory" },
			],
		},
	],
	output: z.object({
		lot: text,
		samplingPlan: text,
		comparisons: z.array(
			z.object({
				test: text,
				sampleId: text,
				value: text,
				limits: text,
				result: z.enum(["within_specification", "outside_specification", "unresolved"]),
				detail: text,
				reportRef: text,
				specVersion: text,
			}),
		),
		outstanding: z.array(z.object({ test: text, reason: text })),
		notUsed: z.array(z.object({ test: text, sampleId: text, reason: text })),
		counts: z.object({
			planned: count,
			within: count,
			outside: count,
			unresolved: count,
			outstanding: count,
		}),
		statement: text,
	}),
	sample: () => ({
		lot: "[DEMO] FL-2026-041",
		samplingPlan: "[DEMO] Finished liquid sampling plan, version 2",
		tests:
			"test,unit,min,max,spec_version,method\nNicotine concentration,mg/mL,11.4,12.6,SPEC-FL v4,HPLC\nDiacetyl,ppm,,5,SPEC-FL v4,GC-MS\nAppearance,grade,,,SPEC-FL v4,Visual",
		results:
			"test,value,unit,sample_id,report_ref,verified,method,lab\nNicotine concentration,12.1,mg/mL,S-041-1,Demo Lab report 9917 (demonstration),yes,HPLC,Demo Lab\nDiacetyl,0.004,mg/mL,S-041-1,Demo Lab report 9917 (demonstration),yes,GC-MS,Demo Lab\nNicotine concentration,12.4,mg/mL,S-041-2,Scanned PDF,no,HPLC,Demo Lab",
	}),
	async handler(ctx) {
		const results = ctx.rows("results");
		const notUsed = results
			.filter((r) => !yes(r.verified))
			.map((r) => ({
				test: r.test,
				sampleId: r.sample_id,
				reason: "The transcription hasn't been verified against the original report, so it is a draft.",
			}));
		const verified = results.filter((r) => yes(r.verified));
		const comparisons: Array<{
			test: string;
			sampleId: string;
			value: string;
			limits: string;
			result: "within_specification" | "outside_specification" | "unresolved";
			detail: string;
			reportRef: string;
			specVersion: string;
		}> = [];
		const outstanding: Array<{ test: string; reason: string }> = [];
		for (const planned of ctx.rows("tests")) {
			const found = verified.filter((r) => lower(r.test) === lower(planned.test));
			if (found.length === 0) {
				const draft = notUsed.some((n) => lower(n.test) === lower(planned.test));
				outstanding.push({
					test: planned.test,
					reason: draft ? "Only an unverified transcription is on file." : "No result is on file.",
				});
				continue;
			}
			const min = numOrNull(planned, "min");
			const max = numOrNull(planned, "max");
			const limits =
				min && max
					? `${plain(min)} to ${plain(max)} ${planned.unit}`
					: max
						? `at most ${plain(max)} ${planned.unit}`
						: min
							? `at least ${plain(min)} ${planned.unit}`
							: "no numeric limit";
			for (const r of found) {
				const value = num(r, "value");
				const base = {
					test: planned.test,
					sampleId: r.sample_id,
					value: `${plain(value)} ${r.unit}`,
					limits,
					reportRef: r.report_ref,
					specVersion: planned.spec_version,
				};
				if (!min && !max)
					comparisons.push({
						...base,
						result: "unresolved",
						detail:
							"The specification has no numeric limit for this test, so there is nothing to compare against.",
					});
				else if (r.unit.trim() !== planned.unit.trim())
					comparisons.push({
						...base,
						result: "unresolved",
						detail: `Reported in ${r.unit}; the specification is in ${planned.unit}. Not converted.`,
					});
				else if (planned.method && r.method && lower(planned.method) !== lower(r.method))
					comparisons.push({
						...base,
						result: "unresolved",
						detail: `Tested by ${r.method}; the specification calls for ${planned.method}.`,
					});
				else {
					const inside = (!min || gte(value, min)) && (!max || lte(value, max));
					comparisons.push({
						...base,
						result: inside ? "within_specification" : "outside_specification",
						detail: inside ? "Inside the approved limits." : "Outside the approved limits.",
					});
				}
			}
		}
		const tally = (result: string) => comparisons.filter((c) => c.result === result).length;
		const counts = {
			planned: ctx.rows("tests").length,
			within: tally("within_specification"),
			outside: tally("outside_specification"),
			unresolved: tally("unresolved"),
			outstanding: outstanding.length,
		};
		return {
			output: {
				lot: ctx.text("lot"),
				samplingPlan: ctx.text("samplingPlan"),
				comparisons,
				outstanding,
				notUsed,
				counts,
				statement:
					"This compares verified results with approved specification limits. It is not an analysis, an acceptance of any test, or a statement that the lot is safe.",
			},
			summary: `Lot ${ctx.text("lot")}: ${counts.within} within specification, ${counts.outside} outside, ${counts.unresolved} unresolved, ${counts.outstanding} outstanding of ${plural(counts.planned, "planned test")}.`,
			missing: [
				...outstanding.map((o) => `${o.test}: ${o.reason}`),
				...comparisons.filter((c) => c.result === "unresolved").map((c) => `${c.test}: ${c.detail}`),
			],
			coverage: {
				"Planned tests": counts.planned,
				"Verified results used": verified.length,
				"Unverified results set aside": notUsed.length,
			},
			warnings: counts.outside
				? [
						"A verified result is outside its approved limits. This needs a quality decision; nothing here makes one.",
					]
				: [],
		};
	},
});

// ---- Assure -----------------------------------------------------------------------------------------

export const assureReleasePackage = defineFunction({
	id: "assure.release-package",
	version: 1,
	agent: "assure",
	action: "Assemble quality review",
	outputType: "QualityReleasePackage",
	purpose:
		"Assembles a batch's release evidence: every required item with whether it is present, referenced and signed, every open hold and deviation, and what must be resolved before a release decision can be made.",
	expectedResult:
		"A quality release package is stored listing each required evidence item and its status, open holds and deviations, and proposed actions, for a qualified, authorized person to decide.",
	notThis:
		"It never releases a batch, lifts a hold or closes a deviation. 'Ready for a decision' means the evidence is complete, not that the batch is approved.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "batch", label: "Batch", kind: "text", required: true, max: 80 },
		{ key: "product", label: "Product", kind: "text", required: true, max: 120 },
		{
			key: "requirements",
			label: "Required evidence",
			kind: "table",
			required: true,
			columns: [
				{ key: "requirement", label: "Requirement", required: true },
				{ key: "status", label: "Status", required: true },
				{ key: "evidence_ref", label: "Evidence reference", aliases: ["reference", "evidence"] },
				{ key: "signed_by", label: "Signed by" },
				{ key: "needs_signature", label: "Needs a signature" },
			],
		},
		{
			key: "holds",
			label: "Holds",
			kind: "table",
			columns: [
				{ key: "hold", label: "Hold", required: true },
				{ key: "status", label: "Status", required: true },
				{ key: "reason", label: "Reason" },
			],
		},
		{
			key: "deviations",
			label: "Deviations and actions",
			kind: "table",
			columns: [
				{ key: "deviation", label: "Deviation", required: true },
				{ key: "status", label: "Status", required: true },
				{ key: "action", label: "Action" },
			],
		},
	],
	output: z.object({
		batch: text,
		product: text,
		evidence: z.array(
			z.object({
				requirement: text,
				complete: z.boolean(),
				status: text,
				reference: text,
				signedBy: text,
				problem: text,
			}),
		),
		openHolds: z.array(z.object({ hold: text, reason: text })),
		openDeviations: z.array(z.object({ deviation: text, action: text })),
		readyForDecision: z.boolean(),
		decision: text,
		proposedActions: texts,
	}),
	sample: () => ({
		batch: "[DEMO] B-2026-041",
		product: "[DEMO] Mango Ice 12 mg, 30 mL",
		requirements:
			"requirement,status,evidence_ref,signed_by,needs_signature\nBatch record complete,present,EBR-041,Operator A,yes\nLaboratory results reviewed,present,LAB-REVIEW-041,,yes\nLine clearance,present,LC-0412,Supervisor B,yes\nLabel version approved,pending,,,no\nEquipment calibration current,present,CAL-SCALE-2,,no",
		holds: "hold,status,reason\nAwaiting lab review sign-off,open,Second sample result pending",
		deviations: "deviation,status,action\nFill volume low on 12 bottles,open,Investigate filler nozzle 3",
	}),
	async handler(ctx) {
		const evidence = ctx.rows("requirements").map((row) => {
			const status = lower(row.status);
			const present = /^(present|complete|completed|done|yes)$/.test(status);
			const problem = !present
				? `Status is "${row.status}".`
				: !row.evidence_ref
					? "Marked present, but no evidence reference is given."
					: yes(row.needs_signature) && !row.signed_by
						? "Needs a signature and none is recorded."
						: "";
			return {
				requirement: row.requirement,
				complete: problem === "",
				status: row.status,
				reference: row.evidence_ref || "",
				signedBy: row.signed_by || "",
				problem,
			};
		});
		const openHolds = ctx
			.rows("holds")
			.filter((h) => isOpen(h.status))
			.map((h) => ({ hold: h.hold, reason: h.reason || "" }));
		const openDeviations = ctx
			.rows("deviations")
			.filter((d) => isOpen(d.status))
			.map((d) => ({ deviation: d.deviation, action: d.action || "" }));
		const incomplete = evidence.filter((e) => !e.complete);
		const ready = incomplete.length === 0 && openHolds.length === 0 && openDeviations.length === 0;
		const proposedActions = [
			...incomplete.map((e) => `Complete "${e.requirement}": ${e.problem}`),
			...openHolds.map(
				(h) =>
					`Resolve hold "${h.hold}"${h.reason ? ` (${h.reason})` : ""}. Only an authorized person can lift it.`,
			),
			...openDeviations.map(
				(d) => `Close deviation "${d.deviation}" with its evidence${d.action ? `: ${d.action}` : ""}.`,
			),
		];
		return {
			output: {
				batch: ctx.text("batch"),
				product: ctx.text("product"),
				evidence,
				openHolds,
				openDeviations,
				readyForDecision: ready,
				decision:
					"Not made here. A qualified, authorized person decides release after reviewing this package.",
				proposedActions,
			},
			summary: ready
				? `Batch ${ctx.text("batch")}: the evidence is complete and nothing is open. It is ready for a person's release decision.`
				: `Batch ${ctx.text("batch")}: not ready for a release decision (${incomplete.length} incomplete, ${openHolds.length} open holds, ${openDeviations.length} open deviations).`,
			missing: incomplete.map((e) => `${e.requirement}: ${e.problem}`),
			assumptions: [
				"The list of required evidence is the one supplied; it is not checked against an approved release procedure here.",
			],
			coverage: {
				"Evidence items": evidence.length,
				"Holds on record": ctx.rows("holds").length,
				"Deviations on record": ctx.rows("deviations").length,
			},
		};
	},
});

// ---- Gauge ------------------------------------------------------------------------------------------

export const gaugeEquipmentReview = defineFunction({
	id: "gauge.equipment-review",
	version: 1,
	agent: "gauge",
	action: "Assess equipment eligibility",
	outputType: "EquipmentEligibilityReview",
	purpose:
		"Works out from the equipment register which assets are eligible for use today (calibration and service dates, recorded status) and, for a failed instrument, which batches were measured on it since it was last verified.",
	expectedResult:
		"An equipment eligibility review is stored with each asset's eligibility and the reason, days to its next calibration and service, the batches affected by each recorded failure, and drafted service tasks.",
	notThis:
		"It reads records. It does not calibrate, repair or operate anything, and never treats a missing calibration record as if one existed.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "asOf", label: "As of", kind: "date" },
		{
			key: "equipment",
			label: "Equipment register",
			kind: "table",
			required: true,
			columns: [
				{ key: "asset", label: "Asset", required: true, aliases: ["asset id", "equipment"] },
				{ key: "name", label: "Name" },
				{ key: "status", label: "Status" },
				{ key: "needs_calibration", label: "Needs calibration" },
				{ key: "calibration_due", label: "Calibration due", kind: "date" },
				{ key: "calibration_ref", label: "Calibration reference", aliases: ["certificate"] },
				{ key: "service_due", label: "Service due", kind: "date" },
			],
		},
		{
			key: "usage",
			label: "Batches measured on each asset",
			kind: "table",
			columns: [
				{ key: "asset", label: "Asset", required: true },
				{ key: "batch", label: "Batch", required: true },
				{ key: "date", label: "Date", required: true, kind: "date" },
			],
		},
		{
			key: "failures",
			label: "Recorded failures",
			kind: "table",
			columns: [
				{ key: "asset", label: "Asset", required: true },
				{ key: "failed_on", label: "Failed on", required: true, kind: "date" },
				{ key: "last_verified", label: "Last verified", kind: "date" },
				{ key: "note", label: "Note" },
			],
		},
	],
	output: z.object({
		asOf: text,
		assets: z.array(
			z.object({
				asset: text,
				name: text,
				eligibility: z.enum(["eligible", "not_eligible", "undetermined"]),
				reasons: texts,
				daysToCalibration: z.number().int().nullable(),
				daysToService: z.number().int().nullable(),
				calibrationRef: text,
			}),
		),
		failures: z.array(
			z.object({
				asset: text,
				failedOn: text,
				lastVerified: nullableText,
				affectedBatches: texts,
				note: text,
			}),
		),
		serviceTasks: texts,
		counts: z.object({ eligible: count, notEligible: count, undetermined: count }),
	}),
	sample: () => ({
		asOf: "2026-10-09",
		equipment:
			"asset,name,status,needs_calibration,calibration_due,calibration_ref,service_due\nSCALE-1,Bench scale 6 kg,in service,yes,2026-12-01,CAL-2026-118,2027-01-15\nSCALE-2,Floor scale 60 kg,in service,yes,2026-09-20,CAL-2025-301,\nMIXER-1,Overhead mixer,in service,no,,,2026-10-20\nPIP-4,Pipette 10 mL,failed,yes,2027-02-01,CAL-2026-044,\nTHERM-2,Thermometer,in service,yes,,,",
		usage:
			"asset,batch,date\nPIP-4,B-2026-038,2026-09-18\nPIP-4,B-2026-040,2026-09-29\nPIP-4,B-2026-041,2026-10-06\nSCALE-1,B-2026-041,2026-10-06",
		failures: "asset,failed_on,last_verified,note\nPIP-4,2026-10-07,2026-09-25,Failed gravimetric check",
	}),
	async handler(ctx) {
		const asOf = ctx.text("asOf") || ctx.today;
		const serviceTasks: string[] = [];
		const assets = ctx.rows("equipment").map((row) => {
			const reasons: string[] = [];
			let eligibility: "eligible" | "not_eligible" | "undetermined" = "eligible";
			const worse = (level: "not_eligible" | "undetermined", reason: string) => {
				reasons.push(reason);
				if (level === "not_eligible" || eligibility === "eligible") eligibility = level;
			};
			const status = lower(row.status);
			if (/fail|out of service|retired|quarantine/.test(status))
				worse("not_eligible", `Recorded status is "${row.status}".`);
			const daysToCalibration = row.calibration_due ? daysBetween(asOf, row.calibration_due) : null;
			if (yes(row.needs_calibration)) {
				if (daysToCalibration === null)
					worse("undetermined", "It needs calibration but no due date is recorded.");
				else if (daysToCalibration < 0)
					worse(
						"not_eligible",
						`Calibration was due ${row.calibration_due}, ${plural(-daysToCalibration, "day")} ago.`,
					);
				if (!row.calibration_ref) worse("undetermined", "No calibration certificate reference is recorded.");
			} else if (row.needs_calibration === "")
				worse("undetermined", "Whether it needs calibration isn't recorded.");
			const daysToService = row.service_due ? daysBetween(asOf, row.service_due) : null;
			if (daysToService !== null && daysToService < 0) reasons.push(`Service was due ${row.service_due}.`);
			if (daysToCalibration !== null && daysToCalibration <= 30)
				serviceTasks.push(
					`${row.asset}: ${daysToCalibration < 0 ? "calibration overdue" : `calibration due in ${plural(daysToCalibration, "day")}`} (${row.calibration_due}).`,
				);
			if (daysToService !== null && daysToService <= 30)
				serviceTasks.push(
					`${row.asset}: ${daysToService < 0 ? "service overdue" : `service due in ${plural(daysToService, "day")}`} (${row.service_due}).`,
				);
			return {
				asset: row.asset,
				name: row.name || "",
				eligibility: eligibility as "eligible" | "not_eligible" | "undetermined",
				reasons,
				daysToCalibration,
				daysToService,
				calibrationRef: row.calibration_ref || "",
			};
		});
		const usage = ctx.rows("usage");
		const failures = ctx.rows("failures").map((f) => {
			const window = usage.filter(
				(u) => u.asset === f.asset && u.date <= f.failed_on && (!f.last_verified || u.date > f.last_verified),
			);
			serviceTasks.push(
				`${f.asset}: impact review for ${plural(window.length, "batch", "batches")} measured since ${f.last_verified || "an unknown verified point"}.`,
			);
			return {
				asset: f.asset,
				failedOn: f.failed_on,
				lastVerified: f.last_verified || null,
				affectedBatches: [...new Set(window.map((u) => u.batch))],
				note: f.note || "",
			};
		});
		const tally = (e: string) => assets.filter((a) => a.eligibility === e).length;
		const counts = {
			eligible: tally("eligible"),
			notEligible: tally("not_eligible"),
			undetermined: tally("undetermined"),
		};
		return {
			output: { asOf, assets, failures, serviceTasks, counts },
			summary: `${counts.eligible} eligible, ${counts.notEligible} not eligible, ${counts.undetermined} undetermined of ${plural(assets.length, "asset")}; ${plural(failures.length, "failure")} reviewed.`,
			missing: [
				...assets
					.filter((a) => a.eligibility === "undetermined")
					.map((a) => `${a.asset}: ${a.reasons.join(" ")}`),
				...failures
					.filter((f) => !f.lastVerified)
					.map(
						(f) => `${f.asset}: no last-verified date, so every batch on record up to the failure is listed.`,
					),
			],
			assumptions: [
				"A batch is treated as affected if it was measured on the asset after its last verified point, up to and including the day it failed.",
			],
			coverage: { "Assets reviewed": assets.length, "Usage records read": usage.length },
		};
	},
});

// ---- Clean ------------------------------------------------------------------------------------------

export const cleanClearanceReview = defineFunction({
	id: "clean.clearance-review",
	version: 1,
	agent: "clean",
	action: "Prepare line-clearance review",
	outputType: "ClearanceReview",
	purpose:
		"Compares an approved cleaning or changeover procedure, step by step, with what staff recorded: who did each step, who verified it, and when.",
	expectedResult:
		"A clearance review is stored with each procedure step's recorded performer and verifier, the steps still outstanding, and steps whose verification isn't independent.",
	notThis:
		"It compares records to the procedure. It does not attest that any physical cleaning or clearance happened: only a recorded observation by an authorized person does that.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "line", label: "Line or equipment", kind: "text", required: true, max: 120 },
		{ key: "procedure", label: "Approved procedure and version", kind: "text", required: true, max: 160 },
		{ key: "previousProduct", label: "Previous product and label", kind: "text", required: true, max: 160 },
		{ key: "nextProduct", label: "Next product and label", kind: "text", required: true, max: 160 },
		{
			key: "steps",
			label: "Procedure steps",
			kind: "table",
			required: true,
			columns: [
				{ key: "step", label: "Step", required: true },
				{
					key: "needs_verification",
					label: "Needs verification",
					aliases: ["verify", "requires verification"],
				},
			],
		},
		{
			key: "records",
			label: "Recorded observations",
			kind: "table",
			columns: [
				{ key: "step", label: "Step", required: true },
				{ key: "performed_by", label: "Performed by" },
				{ key: "performed_at", label: "Performed at", kind: "datetime" },
				{ key: "verified_by", label: "Verified by" },
				{ key: "verified_at", label: "Verified at", kind: "datetime" },
			],
		},
	],
	output: z.object({
		line: text,
		procedure: text,
		changeover: text,
		steps: z.array(
			z.object({
				step: text,
				status: z.enum([
					"recorded",
					"outstanding",
					"verification_outstanding",
					"verification_not_independent",
				]),
				performedBy: text,
				performedAt: text,
				verifiedBy: text,
				verifiedAt: text,
			}),
		),
		outstanding: texts,
		evidenceComplete: z.boolean(),
		statement: text,
	}),
	sample: () => ({
		line: "[DEMO] Filling line 1",
		procedure: "[DEMO] SOP-CLN-07 version 3",
		previousProduct: "Mango Ice 12 mg / label MI-12 rev 2",
		nextProduct: "Berry 6 mg / label BR-06 rev 1",
		steps:
			"step,needs_verification\nRemove previous labels and count remainder,yes\nFlush lines with approved solvent,yes\nWipe filler nozzles,no\nInspect line for stray bottles and caps,yes",
		records:
			"step,performed_by,performed_at,verified_by,verified_at\nRemove previous labels and count remainder,Operator A,2026-10-09T13:05:00Z,Supervisor B,2026-10-09T13:20:00Z\nFlush lines with approved solvent,Operator A,2026-10-09T13:25:00Z,Operator A,2026-10-09T13:26:00Z\nWipe filler nozzles,Operator A,2026-10-09T13:40:00Z,,",
	}),
	async handler(ctx) {
		const records = new Map(ctx.rows("records").map((r) => [lower(r.step), r]));
		const steps = ctx.rows("steps").map((s) => {
			const record = records.get(lower(s.step));
			const base = {
				step: s.step,
				performedBy: record?.performed_by || "",
				performedAt: record?.performed_at || "",
				verifiedBy: record?.verified_by || "",
				verifiedAt: record?.verified_at || "",
			};
			if (!record || !record.performed_by || !record.performed_at)
				return { ...base, status: "outstanding" as const };
			if (yes(s.needs_verification)) {
				if (!record.verified_by || !record.verified_at)
					return { ...base, status: "verification_outstanding" as const };
				if (lower(record.verified_by) === lower(record.performed_by))
					return { ...base, status: "verification_not_independent" as const };
			}
			return { ...base, status: "recorded" as const };
		});
		const say = {
			outstanding: "no recorded observation",
			verification_outstanding: "performed, verification not recorded",
			verification_not_independent: "verified by the same person who performed it",
			recorded: "",
		};
		const outstanding = steps
			.filter((s) => s.status !== "recorded")
			.map((s) => `${s.step}: ${say[s.status]}.`);
		const unlisted = ctx
			.rows("records")
			.filter((r) => !ctx.rows("steps").some((s) => lower(s.step) === lower(r.step)));
		return {
			output: {
				line: ctx.text("line"),
				procedure: ctx.text("procedure"),
				changeover: `${ctx.text("previousProduct")} → ${ctx.text("nextProduct")}`,
				steps,
				outstanding,
				evidenceComplete: outstanding.length === 0,
				statement:
					"This compares what was recorded with the procedure. It is not an attestation that the line was cleaned or cleared.",
			},
			summary: outstanding.length
				? `${ctx.text("line")}: ${plural(outstanding.length, "step")} of ${steps.length} lack complete recorded evidence.`
				: `${ctx.text("line")}: every step of ${ctx.text("procedure")} has a recorded observation and, where required, independent verification.`,
			missing: outstanding,
			assumptions: [
				"Verification is treated as independent when the verifier's name differs from the performer's.",
			],
			coverage: { "Procedure steps": steps.length, "Recorded observations": ctx.rows("records").length },
			warnings: unlisted.length
				? [
						`${plural(unlisted.length, "recorded observation")} don't match any step of the procedure supplied: ${unlisted.map((r) => r.step).join("; ")}.`,
					]
				: [],
		};
	},
});

// ---- Coach ------------------------------------------------------------------------------------------

export const coachTrainingReview = defineFunction({
	id: "coach.training-review",
	version: 1,
	agent: "coach",
	action: "Check training eligibility",
	outputType: "TrainingEligibilityReview",
	purpose:
		"Checks, for the staff and task you name, whether each requirement is met by evidence on file: the right procedure version, not expired, and an assessment where one is required.",
	expectedResult:
		"A training eligibility review is stored with each person's status per requirement and the reason, who is documented as eligible, and the training or requalification proposed for each gap.",
	notThis:
		"It reports documented eligibility. It grants no qualification, and an acknowledgement that a document was read is never counted as a demonstrated assessment.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "task", label: "Task", kind: "text", required: true, max: 160 },
		{ key: "asOf", label: "As of", kind: "date" },
		{ key: "staff", label: "Staff to check", kind: "list", required: true, maxItems: 40 },
		{
			key: "requirements",
			label: "Requirements for the task",
			kind: "table",
			required: true,
			columns: [
				{ key: "requirement", label: "Requirement", required: true },
				{ key: "procedure_version", label: "Procedure version", aliases: ["version"] },
				{ key: "needs_assessment", label: "Needs an assessment", aliases: ["assessment required"] },
			],
		},
		{
			key: "records",
			label: "Training records on file",
			kind: "table",
			maxRows: 1000,
			columns: [
				{ key: "staff", label: "Staff", required: true, aliases: ["name", "person"] },
				{ key: "requirement", label: "Requirement", required: true },
				{ key: "type", label: "Type", required: true },
				{ key: "completed", label: "Completed", required: true, kind: "date" },
				{ key: "procedure_version", label: "Procedure version", aliases: ["version"] },
				{ key: "expires", label: "Expires", kind: "date" },
				{ key: "evidence_ref", label: "Evidence reference", aliases: ["evidence"] },
			],
		},
	],
	output: z.object({
		task: text,
		asOf: text,
		staff: z.array(
			z.object({
				person: text,
				eligible: z.boolean(),
				requirements: z.array(
					z.object({ requirement: text, status: z.enum(["met", "gap"]), reason: text, evidenceRef: text }),
				),
			}),
		),
		eligible: texts,
		proposals: texts,
	}),
	sample: () => ({
		task: "[DEMO] Operate filling line 1",
		asOf: "2026-10-09",
		staff: "Operator A\nOperator C",
		requirements:
			"requirement,procedure_version,needs_assessment\nSOP-FILL-02 Filling line operation,v5,yes\nSOP-CLN-07 Line clearance,v3,no\nNicotine handling safety,,yes",
		records:
			"staff,requirement,type,completed,procedure_version,expires,evidence_ref\nOperator A,SOP-FILL-02 Filling line operation,assessment,2026-06-10,v5,2027-06-10,TR-221\nOperator A,SOP-CLN-07 Line clearance,acknowledgement,2026-07-01,v3,,TR-230\nOperator A,Nicotine handling safety,assessment,2025-08-01,,2026-08-01,TR-140\nOperator C,SOP-FILL-02 Filling line operation,acknowledgement,2026-09-12,v5,,TR-260\nOperator C,SOP-CLN-07 Line clearance,acknowledgement,2025-11-20,v2,,TR-155",
	}),
	async handler(ctx) {
		const asOf = ctx.text("asOf") || ctx.today;
		const records = ctx.rows("records");
		const proposals: string[] = [];
		const staff = ctx.list("staff").map((person) => {
			const requirements = ctx.rows("requirements").map((req) => {
				const mine = records
					.filter((r) => lower(r.staff) === lower(person) && lower(r.requirement) === lower(req.requirement))
					.sort((a, b) => b.completed.localeCompare(a.completed));
				const gap = (reason: string, proposal: string) => {
					proposals.push(`${person}: ${proposal}`);
					return {
						requirement: req.requirement,
						status: "gap" as const,
						reason,
						evidenceRef: mine[0]?.evidence_ref || "",
					};
				};
				if (mine.length === 0) return gap("No record on file.", `train on ${req.requirement}.`);
				const usable = mine.filter((r) => !r.expires || r.expires >= asOf);
				if (usable.length === 0)
					return gap(
						`The latest record expired ${mine[0].expires}.`,
						`requalify on ${req.requirement} (expired ${mine[0].expires}).`,
					);
				const version = req.procedure_version;
				const current = version
					? usable.filter((r) => lower(r.procedure_version) === lower(version))
					: usable;
				if (current.length === 0)
					return gap(
						`On file for ${usable[0].procedure_version || "an unrecorded version"}; the current procedure is ${version}.`,
						`acknowledge and train on ${req.requirement} ${version}.`,
					);
				if (yes(req.needs_assessment) && !current.some((r) => /assess/i.test(r.type)))
					return gap(
						"Only an acknowledgement is on file; this requirement needs a demonstrated assessment.",
						`arrange an assessment for ${req.requirement}.`,
					);
				const best = current.find((r) => /assess/i.test(r.type)) ?? current[0];
				return {
					requirement: req.requirement,
					status: "met" as const,
					reason: `${best.type} completed ${best.completed}${best.expires ? `, valid to ${best.expires}` : ""}.`,
					evidenceRef: best.evidence_ref || "",
				};
			});
			return { person, eligible: requirements.every((r) => r.status === "met"), requirements };
		});
		const eligible = staff.filter((s) => s.eligible).map((s) => s.person);
		return {
			output: { task: ctx.text("task"), asOf, staff, eligible, proposals },
			summary: `${eligible.length} of ${plural(staff.length, "person", "people")} documented as eligible for "${ctx.text("task")}"; ${plural(proposals.length, "training gap")}.`,
			missing: staff.flatMap((s) =>
				s.requirements
					.filter((r) => r.status === "gap")
					.map((r) => `${s.person}, ${r.requirement}: ${r.reason}`),
			),
			assumptions: [
				"A record with no expiry date is treated as still valid.",
				"Eligibility here means the documents are in order. Competence is established by the assessment itself, not by this review.",
			],
			coverage: {
				"People checked": staff.length,
				"Requirements each": ctx.rows("requirements").length,
				"Records read": records.length,
			},
		};
	},
});

// ---- Comply -----------------------------------------------------------------------------------------

export const complyEvidenceReview = defineFunction({
	id: "comply.evidence-review",
	version: 1,
	agent: "comply",
	action: "Check requirement evidence",
	outputType: "ComplianceEvidenceReview",
	purpose:
		"Maps the reviewed requirements in effect on a date, for one jurisdiction and activity, to the evidence on file, and says for each whether it is evidenced, missing, expired or uncertain.",
	expectedResult:
		"A compliance evidence review is stored with each requirement's rule version, whether it applies, the evidence found and its validity, and a review request for everything uncertain.",
	notThis:
		"It maps evidence to the requirements you supply. It does not decide what the law requires, approve a rule, or certify compliance.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "jurisdiction", label: "Jurisdiction", kind: "text", required: true, max: 80 },
		{ key: "activity", label: "Activity or product", kind: "text", required: true, max: 160 },
		{ key: "asOf", label: "As of", kind: "date" },
		{
			key: "requirements",
			label: "Reviewed requirements",
			kind: "table",
			required: true,
			columns: [
				{ key: "id", label: "Id", required: true, aliases: ["requirement id"] },
				{ key: "requirement", label: "Requirement", required: true },
				{ key: "rule_version", label: "Rule version", required: true, aliases: ["version"] },
				{ key: "applies", label: "Applies", required: true },
				{ key: "effective_from", label: "Effective from", kind: "date" },
				{ key: "effective_to", label: "Effective to", kind: "date" },
				{ key: "source", label: "Source" },
			],
		},
		{
			key: "evidence",
			label: "Evidence on file",
			kind: "table",
			columns: [
				{ key: "requirement_id", label: "Requirement id", required: true, aliases: ["id"] },
				{ key: "evidence", label: "Evidence", required: true },
				{ key: "reference", label: "Reference" },
				{ key: "valid_until", label: "Valid until", kind: "date", aliases: ["expires"] },
			],
		},
	],
	output: z.object({
		jurisdiction: text,
		activity: text,
		asOf: text,
		requirements: z.array(
			z.object({
				id: text,
				requirement: text,
				ruleVersion: text,
				source: text,
				applicability: z.enum(["applies", "does_not_apply", "uncertain"]),
				status: z.enum(["evidenced", "missing", "expired", "uncertain", "not_applicable"]),
				evidence: texts,
			}),
		),
		notInEffect: z.array(z.object({ id: text, requirement: text, reason: text })),
		reviewRequests: texts,
		counts: z.object({ evidenced: count, missing: count, expired: count, uncertain: count }),
		statement: text,
	}),
	sample: () => ({
		jurisdiction: "[DEMO] Demoland",
		activity: "Packaging nicotine e-liquid for retail sale",
		asOf: "2026-10-09",
		requirements:
			"id,requirement,rule_version,applies,effective_from,effective_to,source\nR1,Child-resistant container,DEMO-REG v2,yes,2021-01-01,,Demonstration register\nR2,Nicotine concentration statement on label,DEMO-REG v2,yes,2021-01-01,,Demonstration register\nR3,Health warning in both official languages,DEMO-REG v2,unsure,2021-01-01,,Demonstration register\nR4,Legacy label format,DEMO-REG v1,yes,2018-01-01,2020-12-31,Demonstration register",
		evidence:
			"requirement_id,evidence,reference,valid_until\nR1,Container test certificate,CERT-CRC-88,2026-06-30\nR2,Approved label artwork rev 3,ART-MI-12-3,",
	}),
	async handler(ctx) {
		const asOf = ctx.text("asOf") || ctx.today;
		const evidence = groupBy(ctx.rows("evidence"), (e) => e.requirement_id);
		const notInEffect: Array<{ id: string; requirement: string; reason: string }> = [];
		const reviewRequests: string[] = [];
		const requirements = ctx.rows("requirements").flatMap((r) => {
			if ((r.effective_from && r.effective_from > asOf) || (r.effective_to && r.effective_to < asOf)) {
				notInEffect.push({
					id: r.id,
					requirement: r.requirement,
					reason:
						r.effective_to && r.effective_to < asOf
							? `Ended ${r.effective_to}.`
							: `Starts ${r.effective_from}.`,
				});
				return [];
			}
			const applies = lower(r.applies);
			const applicability = /^(yes|y|true)$/.test(applies)
				? ("applies" as const)
				: /^(no|n|false)$/.test(applies)
					? ("does_not_apply" as const)
					: ("uncertain" as const);
			const mine = evidence.get(r.id) ?? [];
			const valid = mine.filter((e) => !e.valid_until || e.valid_until >= asOf);
			const status =
				applicability === "does_not_apply"
					? ("not_applicable" as const)
					: applicability === "uncertain"
						? ("uncertain" as const)
						: valid.length
							? ("evidenced" as const)
							: mine.length
								? ("expired" as const)
								: ("missing" as const);
			if (applicability === "uncertain")
				reviewRequests.push(
					`${r.id}: decide whether "${r.requirement}" applies to ${ctx.text("activity")}. A reviewed applicability decision is needed.`,
				);
			if (status === "missing")
				reviewRequests.push(`${r.id}: no evidence is on file for "${r.requirement}".`);
			if (status === "expired")
				reviewRequests.push(
					`${r.id}: the evidence for "${r.requirement}" is no longer valid (${mine.map((e) => `${e.evidence} to ${e.valid_until}`).join("; ")}).`,
				);
			return [
				{
					id: r.id,
					requirement: r.requirement,
					ruleVersion: r.rule_version,
					source: r.source || "",
					applicability,
					status,
					evidence: mine.map(
						(e) =>
							`${e.evidence}${e.reference ? ` (${e.reference})` : ""}${e.valid_until ? `, valid to ${e.valid_until}` : ""}`,
					),
				},
			];
		});
		const tally = (status: string) => requirements.filter((r) => r.status === status).length;
		const counts = {
			evidenced: tally("evidenced"),
			missing: tally("missing"),
			expired: tally("expired"),
			uncertain: tally("uncertain"),
		};
		return {
			output: {
				jurisdiction: ctx.text("jurisdiction"),
				activity: ctx.text("activity"),
				asOf,
				requirements,
				notInEffect,
				reviewRequests,
				counts,
				statement:
					"This maps evidence on file to the requirements supplied. It is not legal advice and does not certify compliance.",
			},
			summary: `${ctx.text("jurisdiction")}: ${counts.evidenced} evidenced, ${counts.missing} missing, ${counts.expired} expired, ${counts.uncertain} uncertain of ${plural(requirements.length, "requirement")} in effect.`,
			missing: reviewRequests,
			assumptions: [
				"The requirements and their versions are the ones supplied; whether that register is complete is not checked here.",
				"Evidence with no validity date is treated as still valid.",
			],
			coverage: {
				"Requirements in effect": requirements.length,
				"Not in effect on this date": notInEffect.length,
				"Evidence items": ctx.rows("evidence").length,
			},
		};
	},
});

// ---- Safeguard --------------------------------------------------------------------------------------

export const safeguardRecordsReview = defineFunction({
	id: "safeguard.records-review",
	version: 1,
	agent: "safeguard",
	action: "Review workplace and waste records",
	outputType: "WorkplaceWasteReview",
	purpose:
		"Reviews a period's workplace and waste records: inspections recorded against the number required, incidents without a completed follow-up, and waste generated against waste collected and documented.",
	expectedResult:
		"A workplace and waste review is stored with inspection counts against requirements, incidents needing follow-up, a balance per waste stream, undocumented collections, and drafted follow-ups.",
	notThis:
		"It reviews records. It writes no emergency or spill response, certifies nothing as safe, and authorizes no disposal.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "period", label: "Period (YYYY-MM)", kind: "text", required: true, max: 7 },
		{
			key: "required",
			label: "Inspections required in the period",
			kind: "table",
			columns: [
				{ key: "inspection", label: "Inspection", required: true },
				{
					key: "times",
					label: "Times required",
					required: true,
					kind: "integer",
					aliases: ["required", "frequency"],
				},
			],
		},
		{
			key: "inspections",
			label: "Inspections recorded",
			kind: "table",
			columns: [
				{ key: "inspection", label: "Inspection", required: true },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "by", label: "By" },
			],
		},
		{
			key: "incidents",
			label: "Incidents and spills recorded",
			kind: "table",
			columns: [
				{ key: "incident", label: "Incident", required: true },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "follow_up", label: "Follow-up" },
				{ key: "follow_up_done", label: "Follow-up done", aliases: ["done", "closed"] },
				{ key: "responsible", label: "Responsible" },
			],
		},
		{
			key: "waste",
			label: "Waste movements",
			kind: "table",
			columns: [
				{ key: "stream", label: "Stream", required: true },
				{ key: "movement", label: "Movement", required: true },
				{ key: "quantity", label: "Quantity", required: true, kind: "decimal" },
				{ key: "unit", label: "Unit", required: true },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "document", label: "Document", aliases: ["manifest", "receipt"] },
				{ key: "contractor", label: "Contractor" },
			],
		},
	],
	output: z.object({
		period: text,
		inspections: z.array(z.object({ inspection: text, required: count, recorded: count, shortBy: count })),
		incidents: z.array(
			z.object({
				incident: text,
				date: text,
				status: z.enum(["follow_up_done", "follow_up_open", "no_follow_up_recorded"]),
				responsible: text,
			}),
		),
		waste: z.array(
			z.object({
				stream: text,
				unit: text,
				generated: text,
				collected: text,
				onSite: nullableText,
				note: text,
			}),
		),
		undocumentedCollections: z.array(z.object({ stream: text, date: text, quantity: text })),
		followUps: texts,
	}),
	sample: () => ({
		period: "2026-09",
		required: "inspection,times\nEyewash station check,4\nSpill kit check,1\nFire extinguisher check,1",
		inspections:
			"inspection,date,by\nEyewash station check,2026-09-04,Operator A\nEyewash station check,2026-09-18,Operator A\nSpill kit check,2026-09-02,Supervisor B",
		incidents:
			"incident,date,follow_up,follow_up_done,responsible\nNicotine base spill (approx 50 mL),2026-09-11,Review decanting procedure,no,Supervisor B\nCut finger on bottle,2026-09-20,,,",
		waste:
			"stream,movement,quantity,unit,date,document,contractor\nNicotine-contaminated waste,generated,12.5,kg,2026-09-15,,\nNicotine-contaminated waste,generated,8,kg,2026-09-28,,\nNicotine-contaminated waste,collected,15,kg,2026-09-29,MAN-5512,Demo Waste Co\nSolvent waste,generated,20,L,2026-09-10,,\nSolvent waste,collected,20,L,2026-09-22,,Demo Waste Co",
	}),
	async handler(ctx) {
		const period = ctx.text("period");
		if (!/^\d{4}-\d{2}$/.test(period)) block(`The period "${period}" must be a month written YYYY-MM.`);
		const within = (row: Row) => row.date.startsWith(period);
		const followUps: string[] = [];
		const done = ctx.rows("inspections").filter(within);
		const inspections = ctx.rows("required").map((r) => {
			const recorded = done.filter((d) => lower(d.inspection) === lower(r.inspection)).length;
			const shortBy = Math.max(0, Number(r.times) - recorded);
			if (shortBy)
				followUps.push(
					`${r.inspection}: ${recorded} of ${r.times} required inspections are recorded for ${period}.`,
				);
			return { inspection: r.inspection, required: Number(r.times), recorded, shortBy };
		});
		const incidents = ctx
			.rows("incidents")
			.filter(within)
			.map((i) => {
				const status = !i.follow_up
					? ("no_follow_up_recorded" as const)
					: yes(i.follow_up_done)
						? ("follow_up_done" as const)
						: ("follow_up_open" as const);
				if (status !== "follow_up_done")
					followUps.push(
						`${i.incident} (${i.date}): ${status === "follow_up_open" ? `follow-up "${i.follow_up}" is not recorded as done` : "no follow-up is recorded"}${i.responsible ? `. Responsible: ${i.responsible}` : ". No responsible person is recorded"}.`,
					);
				return { incident: i.incident, date: i.date, status, responsible: i.responsible || "" };
			});
		const movements = ctx.rows("waste").filter(within);
		const undocumentedCollections = movements
			.filter((m) => lower(m.movement) === "collected" && !m.document)
			.map((m) => ({ stream: m.stream, date: m.date, quantity: `${m.quantity} ${m.unit}` }));
		for (const u of undocumentedCollections)
			followUps.push(
				`${u.stream}: the collection of ${u.quantity} on ${u.date} has no manifest or receipt on file.`,
			);
		const waste = [...groupBy(movements, (m) => lower(m.stream))].map(([, rows]) => {
			const units = [...new Set(rows.map((r) => r.unit))];
			const total = (movement: string) =>
				sum(rows.filter((r) => lower(r.movement) === movement).map((r) => num(r, "quantity")));
			const generated = total("generated");
			const collected = total("collected");
			if (units.length > 1)
				return {
					stream: rows[0].stream,
					unit: units.join(" / "),
					generated: "",
					collected: "",
					onSite: null,
					note: "Recorded in more than one unit; not added together.",
				};
			const onSite = sub(generated, collected);
			const note = lt(onSite, ZERO)
				? "More was collected than was recorded as generated. Check the records."
				: gt(onSite, ZERO)
					? "Recorded as still on site at the end of the period."
					: "";
			if (lt(onSite, ZERO))
				followUps.push(
					`${rows[0].stream}: ${plain(collected)} ${units[0]} collected against ${plain(generated)} ${units[0]} generated.`,
				);
			return {
				stream: rows[0].stream,
				unit: units[0],
				generated: plain(generated),
				collected: plain(collected),
				onSite: plain(onSite),
				note,
			};
		});
		return {
			output: { period, inspections, incidents, waste, undocumentedCollections, followUps },
			summary: `${period}: ${plural(followUps.length, "follow-up")} drafted (${inspections.filter((i) => i.shortBy).length} inspection shortfalls, ${incidents.filter((i) => i.status !== "follow_up_done").length} open incidents, ${undocumentedCollections.length} undocumented collections).`,
			missing: [
				...(ctx.rows("required").length === 0
					? ["No list of required inspections was supplied, so inspection shortfalls weren't checked."]
					: []),
				...waste
					.filter((w) => w.onSite === null)
					.map((w) => `${w.stream}: quantities are in different units and were not reconciled.`),
			],
			assumptions: [
				"Waste on site is what was recorded as generated less what was recorded as collected in the period; an opening balance isn't included.",
				"Nothing here says a response to any incident was adequate.",
			],
			coverage: {
				"Inspections recorded": done.length,
				"Incidents in the period": incidents.length,
				"Waste movements": movements.length,
			},
		};
	},
});

export const MANUFACTURING_FUNCTIONS = [
	batchRecordReconciliation,
	tempoProductionPlan,
	qualifySupplierPackage,
	assayLabReview,
	assureReleasePackage,
	gaugeEquipmentReview,
	cleanClearanceReview,
	coachTrainingReview,
	complyEvidenceReview,
	safeguardRecordsReview,
];
