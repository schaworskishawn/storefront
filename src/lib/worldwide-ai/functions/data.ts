import { z } from "zod";
import { KNOWLEDGE_COLLECTIONS } from "../atlas/collections";
import { listDocuments, listPendingVersions, searchApproved } from "../atlas/service";
import { ROLE_BY_ID } from "../agents/registry";
import { cmp, dec, div, isZero, lt, percentOf, sub, tryDec } from "../decimal";
import { daysBetween } from "../time";
import type { SourceRef } from "../types";
import {
	block,
	count,
	fieldInt,
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
import { groupBy, isIsoDay, normalizeHeader } from "./table";
import { defineFunction } from "./types";

/** Check, Review, Insight and Atlas: the functions that are about the records themselves. */

// ---- Check ------------------------------------------------------------------------------------------

const issue = z.object({ row: count, key: text, rule: text, column: text, value: text, proposal: text });

export const checkRecordValidation = defineFunction({
	id: "check.record-validation",
	version: 1,
	agent: "check",
	action: "Validate selected records",
	outputType: "DataQualityReport",
	purpose:
		"Runs completeness, duplicate, format and unit checks over the records you supply and lists every problem by row and key, with a proposed correction.",
	expectedResult:
		"A data quality report is stored listing each rule that was run, how many rows it checked and failed, and every problem by row and record key. No record is edited.",
	notThis:
		"It reports and proposes. It does not edit, merge or delete any record, and it checks only the rows you supplied.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{
			key: "dataset",
			label: "Dataset name",
			kind: "text",
			required: true,
			max: 120,
			placeholder: "Ingredient lots, October",
		},
		{
			key: "keyColumn",
			label: "Key column",
			kind: "text",
			required: true,
			max: 60,
			help: "The column that should identify each record once.",
		},
		{ key: "requiredColumns", label: "Columns that must be filled in", kind: "list", maxItems: 30 },
		{ key: "numericColumns", label: "Columns that must be numbers", kind: "list", maxItems: 30 },
		{ key: "dateColumns", label: "Columns that must be dates (YYYY-MM-DD)", kind: "list", maxItems: 30 },
		{ key: "unitColumn", label: "Unit column", kind: "text", max: 60 },
		{ key: "allowedUnits", label: "Units allowed in that column", kind: "list", maxItems: 20 },
		{ key: "records", label: "Records", kind: "table", required: true, columns: [], maxRows: 1000 },
	],
	output: z.object({
		dataset: text,
		rowsChecked: count,
		keyColumn: text,
		rules: z.array(z.object({ rule: text, rowsChecked: count, rowsFailed: count })),
		issues: z.array(issue),
		duplicateKeys: z.array(z.object({ key: text, rows: z.array(count) })),
		clean: z.boolean(),
	}),
	sample: () => ({
		dataset: "[DEMO] Ingredient lots",
		keyColumn: "lot",
		requiredColumns: "name\nsupplier",
		numericColumns: "quantity\ndensity",
		dateColumns: "expiry",
		unitColumn: "unit",
		allowedUnits: "mL\ng",
		records:
			"lot,name,supplier,quantity,unit,density,expiry\nL-100,PG base,Demo Supply,5000,mL,1.036,2027-03-31\nL-101,VG base,,2500,ml,1.261,2027-13-01\nL-100,PG base,Demo Supply,5000,mL,1.036,2027-03-31\nL-102,Flavour A,Demo Supply,abc,oz,,2026-12-01",
	}),
	async handler(ctx) {
		const rows = ctx.rows("records");
		const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
		const known = (name: string, what: string) => {
			const column = normalizeHeader(name);
			if (!columns.includes(column))
				block(`The ${what} "${name}" isn't a column in the records. Columns found: ${columns.join(", ")}.`);
			return column;
		};
		const key = known(ctx.text("keyColumn"), "key column");
		const required = ctx.list("requiredColumns").map((c) => known(c, "required column"));
		const numeric = ctx.list("numericColumns").map((c) => known(c, "numeric column"));
		const dates = ctx.list("dateColumns").map((c) => known(c, "date column"));
		const unitColumn = ctx.text("unitColumn") ? known(ctx.text("unitColumn"), "unit column") : null;
		const allowed = ctx.list("allowedUnits");

		const issues: Array<z.infer<typeof issue>> = [];
		const failed = new Map<string, Set<number>>();
		const flag = (rule: string, row: number, column: string, value: string, proposal: string) => {
			issues.push({ row, key: rows[row - 1][key] ?? "", rule, column, value, proposal });
			failed.set(rule, (failed.get(rule) ?? new Set()).add(row));
		};
		rows.forEach((row, index) => {
			const n = index + 1;
			if (!row[key]) flag("Key is present", n, key, "", "Give this record its identifier.");
			for (const column of required)
				if (!row[column]) flag("Required field is filled in", n, column, "", `Fill in "${column}".`);
			for (const column of numeric)
				if (row[column] && !tryDec(row[column]))
					flag("Number is valid", n, column, row[column], "Enter a plain number (no units or text).");
			for (const column of dates)
				if (row[column] && !isIsoDay(row[column]))
					flag("Date is valid", n, column, row[column], "Use a real date written YYYY-MM-DD.");
			if (unitColumn && row[unitColumn] && allowed.length && !allowed.includes(row[unitColumn])) {
				const sameLetters = allowed.find((unit) => lower(unit) === lower(row[unitColumn]));
				flag(
					"Unit is one of the allowed units",
					n,
					unitColumn,
					row[unitColumn],
					sameLetters
						? `Write the unit as "${sameLetters}".`
						: `Use one of: ${allowed.join(", ")}. Do not convert without a documented factor.`,
				);
			}
		});

		const duplicateKeys = [
			...groupBy(
				rows.map((row, index) => ({ row, n: index + 1 })).filter((r) => r.row[key]),
				(r) => r.row[key],
			),
		]
			.filter(([, group]) => group.length > 1)
			.map(([value, group]) => {
				const identical = group.every((g) => JSON.stringify(g.row) === JSON.stringify(group[0].row));
				for (const g of group.slice(1))
					flag(
						"Key is unique",
						g.n,
						key,
						value,
						identical
							? `Identical to row ${group[0].n}: likely the same record entered twice.`
							: `Conflicts with row ${group[0].n}: same key, different values. Decide which is right.`,
					);
				return { key: value, rows: group.map((g) => g.n) };
			});

		const ruleNames = [
			"Key is present",
			"Key is unique",
			...(required.length ? ["Required field is filled in"] : []),
			...(numeric.length ? ["Number is valid"] : []),
			...(dates.length ? ["Date is valid"] : []),
			...(unitColumn && allowed.length ? ["Unit is one of the allowed units"] : []),
		];
		issues.sort((a, b) => a.row - b.row);
		return {
			output: {
				dataset: ctx.text("dataset"),
				rowsChecked: rows.length,
				keyColumn: key,
				rules: ruleNames.map((rule) => ({
					rule,
					rowsChecked: rows.length,
					rowsFailed: failed.get(rule)?.size ?? 0,
				})),
				issues,
				duplicateKeys,
				clean: issues.length === 0,
			},
			summary: issues.length
				? `${plural(issues.length, "problem")} in ${plural(rows.length, "row")} of ${ctx.text("dataset")}.`
				: `No problems found in ${plural(rows.length, "row")} of ${ctx.text("dataset")}.`,
			missing:
				unitColumn && !allowed.length
					? ["No allowed units were given, so the unit column was not checked."]
					: [],
			coverage: { "Rows checked": rows.length, "Rules run": ruleNames.length },
		};
	},
	verify: (output) =>
		output.issues
			.filter((i) => i.row < 1 || i.row > output.rowsChecked)
			.map((i) => `Problem points at row ${i.row}, which wasn't supplied.`),
});

// ---- Review -----------------------------------------------------------------------------------------

const deadline = z.object({
	item: text,
	kind: text,
	owner: text,
	date: nullableText,
	basis: z.enum(["confirmed", "suggested", "none"]),
	daysUntil: z.number().int().nullable(),
	status: z.enum(["overdue", "due_soon", "upcoming", "no_date"]),
	source: text,
});

export const reviewDeadlineRegister = defineFunction({
	id: "review.deadline-register",
	version: 1,
	agent: "review",
	action: "Review upcoming deadlines",
	outputType: "DeadlineRegister",
	purpose:
		"Works out what is overdue, due soon and upcoming from the dated records you supply (documents, licences, contracts, services, renewals), on the Winnipeg calendar.",
	expectedResult:
		"A deadline register is stored with each item's date, whether that date is confirmed or only suggested, the days remaining, and one follow-up per item that needs attention.",
	notThis:
		"It never invents an obligation: an item with no date stays 'no date', and a date with no source is marked as unsourced.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "asOf", label: "As of", kind: "date", help: "Leave blank for today in Winnipeg." },
		{ key: "warnDays", label: "Warn this many days ahead", kind: "integer", help: "Default 30." },
		{
			key: "items",
			label: "Dated items",
			kind: "table",
			required: true,
			columns: [
				{ key: "item", label: "Item", required: true },
				{ key: "kind", label: "Kind", aliases: ["type"] },
				{ key: "owner", label: "Owner", aliases: ["responsible"] },
				{
					key: "due_date",
					label: "Due date",
					kind: "date",
					aliases: ["due", "expiry", "expires", "renewal date"],
				},
				{ key: "suggested_date", label: "Suggested date", kind: "date", aliases: ["suggested review"] },
				{ key: "source", label: "Source", aliases: ["reference", "document"] },
			],
		},
	],
	output: z.object({
		asOf: text,
		warnDays: count,
		items: z.array(deadline),
		counts: z.object({ overdue: count, dueSoon: count, upcoming: count, noDate: count }),
		followUps: z.array(z.object({ title: text, owner: text, reason: text })),
	}),
	sample: () => ({
		warnDays: "30",
		items:
			"item,kind,owner,due_date,suggested_date,source\n[DEMO] Business licence,licence,Owner,2026-11-01,,City licence letter\n[DEMO] Scale calibration,service,Lab lead,2026-09-30,,Calibration certificate 2025\n[DEMO] Returns policy review,document,Support lead,,2026-12-15,\n[DEMO] Insurance renewal,contract,Owner,,,",
	}),
	async handler(ctx) {
		const asOf = ctx.text("asOf") || ctx.today;
		const warnDays = fieldInt(ctx, "warnDays", 30);
		const seen = new Set<string>();
		const items: Array<z.infer<typeof deadline>> = [];
		for (const row of ctx.rows("items")) {
			const date = row.due_date || row.suggested_date || null;
			const dedupe = `${lower(row.item)}|${date ?? ""}`;
			if (seen.has(dedupe)) continue;
			seen.add(dedupe);
			const daysUntil = date ? daysBetween(asOf, date) : null;
			items.push({
				item: row.item,
				kind: row.kind || "unspecified",
				owner: row.owner || "unassigned",
				date,
				basis: row.due_date ? "confirmed" : row.suggested_date ? "suggested" : "none",
				daysUntil,
				status:
					daysUntil === null
						? "no_date"
						: daysUntil < 0
							? "overdue"
							: daysUntil <= warnDays
								? "due_soon"
								: "upcoming",
				source: row.source || "",
			});
		}
		const order = { overdue: 0, due_soon: 1, upcoming: 2, no_date: 3 } as const;
		items.sort((a, b) => order[a.status] - order[b.status] || (a.daysUntil ?? 0) - (b.daysUntil ?? 0));
		const followUps = items
			.filter((i) => i.status === "overdue" || i.status === "due_soon")
			.map((i) => ({
				title: `${i.status === "overdue" ? "Overdue" : "Due soon"}: ${i.item}`,
				owner: i.owner,
				reason:
					i.status === "overdue"
						? `${i.basis === "confirmed" ? "Due" : "Suggested for"} ${i.date}, ${plural(Math.abs(i.daysUntil ?? 0), "day")} ago.`
						: `${i.basis === "confirmed" ? "Due" : "Suggested for"} ${i.date}, in ${plural(i.daysUntil ?? 0, "day")}.`,
			}));
		const counts = {
			overdue: items.filter((i) => i.status === "overdue").length,
			dueSoon: items.filter((i) => i.status === "due_soon").length,
			upcoming: items.filter((i) => i.status === "upcoming").length,
			noDate: items.filter((i) => i.status === "no_date").length,
		};
		return {
			output: { asOf, warnDays, items, counts, followUps },
			summary: `${counts.overdue} overdue, ${counts.dueSoon} due within ${warnDays} days, ${counts.noDate} with no date.`,
			missing: [
				...items
					.filter((i) => i.status === "no_date")
					.map((i) => `"${i.item}" has no date, so nothing can be said about when it is due.`),
				...items
					.filter((i) => i.basis === "confirmed" && !i.source)
					.map((i) => `"${i.item}" has a due date but no source for it.`),
			],
			assumptions: items.some((i) => i.basis === "suggested")
				? ["Suggested dates are internal targets, not obligations."]
				: [],
			coverage: { "Items reviewed": items.length },
		};
	},
});

// ---- Insight ----------------------------------------------------------------------------------------

const point = z.object({
	period: text,
	segment: text,
	numerator: text,
	denominator: nullableText,
	value: text,
});

export const insightMetricAnalysis = defineFunction({
	id: "insight.metric-analysis",
	version: 1,
	agent: "insight",
	action: "Analyze business metric",
	outputType: "MetricAnalysis",
	purpose:
		"Calculates a metric for two periods from the observations you supply, by segment where given, and states the change with its denominators.",
	expectedResult:
		"A metric analysis is stored with the current and baseline values, the exact change, each segment's change, and plain statements of what the figures do and don't show.",
	notThis:
		"It describes what changed. It does not say why: no cause is claimed, and a sample below your minimum is reported as inconclusive.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{
			key: "metric",
			label: "Metric",
			kind: "text",
			required: true,
			max: 120,
			placeholder: "Support drafts corrected before saving",
		},
		{
			key: "definition",
			label: "Definition",
			kind: "textarea",
			required: true,
			max: 600,
			help: "What the numerator and denominator count, and where they come from.",
		},
		{ key: "unit", label: "Unit", kind: "text", max: 20, help: "Use % for a rate shown as a percentage." },
		{ key: "currentPeriod", label: "Current period", kind: "text", required: true, max: 40 },
		{ key: "baselinePeriod", label: "Baseline period", kind: "text", required: true, max: 40 },
		{ key: "minSample", label: "Smallest denominator you would trust", kind: "integer" },
		{
			key: "observations",
			label: "Observations",
			kind: "table",
			required: true,
			minRows: 2,
			columns: [
				{ key: "period", label: "Period", required: true },
				{
					key: "numerator",
					label: "Numerator",
					required: true,
					kind: "decimal",
					aliases: ["value", "count"],
				},
				{ key: "denominator", label: "Denominator", kind: "decimal", aliases: ["total", "out of"] },
				{ key: "segment", label: "Segment" },
			],
		},
	],
	output: z.object({
		metric: text,
		definition: text,
		unit: text,
		current: point,
		baseline: point,
		change: z.object({ absolute: text, percent: nullableText, direction: z.enum(["up", "down", "flat"]) }),
		segments: z.array(
			z.object({ segment: text, current: nullableText, baseline: nullableText, absolute: nullableText }),
		),
		conclusive: z.boolean(),
		findings: texts,
	}),
	sample: () => ({
		metric: "[DEMO] Support drafts corrected before saving",
		definition:
			"Drafts a reviewer edited before saving, out of all drafts saved in the period. Demonstration figures.",
		unit: "%",
		currentPeriod: "2026-09",
		baselinePeriod: "2026-08",
		minSample: "20",
		observations:
			"period,segment,numerator,denominator\n2026-08,Shipping,9,30\n2026-08,Returns,6,20\n2026-09,Shipping,5,32\n2026-09,Returns,6,18",
	}),
	async handler(ctx) {
		const rows = ctx.rows("observations");
		const asPercent = ctx.text("unit").trim() === "%";
		const minSample = ctx.text("minSample") ? dec(ctx.text("minSample")) : null;
		const total = (period: string, segment?: string) => {
			const mine = rows.filter(
				(r) => r.period === period && (segment === undefined || (r.segment || "All") === segment),
			);
			if (!mine.length) return null;
			const numerator = mine.reduce((sum, r) => sum + num(r, "numerator").v, 0n);
			const withDenominator = mine.filter((r) => numOrNull(r, "denominator"));
			if (withDenominator.length && withDenominator.length !== mine.length)
				block(`Some ${period} rows have a denominator and some don't. Give it for every row or for none.`);
			const denominator = withDenominator.length
				? withDenominator.reduce((sum, r) => sum + num(r, "denominator").v, 0n)
				: null;
			if (denominator === 0n)
				block(`The ${period} denominator adds up to zero, so the metric can't be calculated.`);
			const n = { v: numerator };
			const d = denominator === null ? null : { v: denominator };
			const value = d ? (asPercent ? div({ v: n.v * 100n }, d) : div(n, d)) : n;
			return { numerator: n, denominator: d, value };
		};
		const shape = (period: string, segment: string, t: NonNullable<ReturnType<typeof total>>) => ({
			period,
			segment,
			numerator: plain(t.numerator),
			denominator: t.denominator ? plain(t.denominator) : null,
			value: fixed(t.value, t.denominator ? 2 : 2),
		});
		const currentPeriod = ctx.text("currentPeriod");
		const baselinePeriod = ctx.text("baselinePeriod");
		const current = total(currentPeriod);
		const baseline = total(baselinePeriod);
		if (!current)
			block(
				`There are no observations for the current period "${currentPeriod}". Periods supplied: ${[...new Set(rows.map((r) => r.period))].join(", ")}.`,
			);
		if (!baseline)
			block(`There are no observations for the baseline period "${baselinePeriod}". Baseline unavailable.`);

		const absolute = sub(current.value, baseline.value);
		const percent = isZero(baseline.value) ? null : percentOf(absolute, baseline.value);
		const small = minSample
			? [current, baseline].some((t) => t.denominator !== null && lt(t.denominator, minSample))
			: false;
		const segments = [...new Set(rows.map((r) => r.segment || "All"))]
			.filter((segment) => segment !== "All" || rows.every((r) => !r.segment))
			.map((segment) => {
				const c = total(currentPeriod, segment);
				const b = total(baselinePeriod, segment);
				return {
					segment,
					current: c ? fixed(c.value) : null,
					baseline: b ? fixed(b.value) : null,
					absolute: c && b ? fixed(sub(c.value, b.value)) : null,
				};
			});
		const unit = ctx.text("unit");
		const direction = cmp(absolute, dec(0)) === 0 ? "flat" : cmp(absolute, dec(0)) > 0 ? "up" : "down";
		const findings = [
			`${ctx.text("metric")} was ${fixed(current.value)}${unit} in ${currentPeriod} and ${fixed(baseline.value)}${unit} in ${baselinePeriod}: ${direction === "flat" ? "no change" : `${direction} ${fixed(absolute).replace("-", "")}${asPercent ? " percentage points" : unit}`}${percent && !asPercent ? ` (${percent}%)` : ""}.`,
			...(current.denominator && baseline.denominator
				? [
						`Based on ${plain(current.numerator)} of ${plain(current.denominator)} in ${currentPeriod} and ${plain(baseline.numerator)} of ${plain(baseline.denominator)} in ${baselinePeriod}.`,
					]
				: []),
			...(small
				? [
						`At least one period is below your minimum sample of ${plain(minSample as NonNullable<typeof minSample>)}, so this comparison is inconclusive.`,
					]
				: []),
			"These figures show a difference between two periods. They do not show what caused it.",
		];
		return {
			output: {
				metric: ctx.text("metric"),
				definition: ctx.text("definition"),
				unit,
				current: shape(currentPeriod, "All", current),
				baseline: shape(baselinePeriod, "All", baseline),
				change: { absolute: fixed(absolute), percent, direction },
				segments,
				conclusive: !small,
				findings,
			},
			summary: findings[0],
			missing: segments
				.filter((s) => s.current === null || s.baseline === null)
				.map((s) => `Segment "${s.segment}" has no figure for one of the two periods.`),
			assumptions: ["The two periods are assumed to be measured the same way, as the definition states."],
			coverage: {
				"Observations used": rows.filter((r) => r.period === currentPeriod || r.period === baselinePeriod)
					.length,
				"Observations supplied": rows.length,
			},
		};
	},
});

// ---- Atlas ------------------------------------------------------------------------------------------

export const atlasKnowledgeReview = defineFunction({
	id: "atlas.knowledge-review",
	version: 1,
	agent: "atlas",
	action: "Review knowledge sources",
	outputType: "KnowledgeReviewPackage",
	purpose:
		"Goes through the document library (one collection or all of it) and reports what is unapproved, waiting, stale, expired or duplicated, and which topics you name have no approved source.",
	expectedResult:
		"A knowledge review package is stored listing every document's status and version, conflicts between documents, uncovered topics, and a proposed action for each problem.",
	notThis:
		"It proposes. Approving, rejecting or retiring a document version stays a separate decision by the owner on the Knowledge page.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{
			key: "collection",
			label: "Collection",
			kind: "select",
			required: true,
			options: [
				{ value: "all", label: "Every collection" },
				...KNOWLEDGE_COLLECTIONS.map((c) => ({ value: c.id, label: c.label })),
			],
		},
		{
			key: "topics",
			label: "Topics that should be covered",
			kind: "list",
			maxItems: 15,
			help: "One per line. Each is searched for among approved documents.",
		},
	],
	output: z.object({
		collection: text,
		documents: z.array(
			z.object({
				documentId: text,
				title: text,
				collection: text,
				status: text,
				version: z.number().int().nullable(),
				freshness: text,
				flags: texts,
			}),
		),
		conflicts: z.array(z.object({ title: text, documentIds: texts, reason: text })),
		gaps: z.array(z.object({ topic: text, reason: text })),
		proposals: z.array(z.object({ action: text, documentId: nullableText, reason: text })),
		counts: z.object({ documents: count, approved: count, needingAttention: count }),
	}),
	sample: () => ({ collection: "all", topics: "returns\nshipping times\nwarranty" }),
	async handler(ctx) {
		const collection = ctx.text("collection");
		const clock = { now: ctx.now, staleAfterDays: ctx.deps.config.staleAfterDays };
		const documents = await listDocuments(ctx.deps.sql, collection === "all" ? {} : { collection }, clock);
		const pending = new Set((await listPendingVersions(ctx.deps.sql)).map((v) => v.documentId));
		const proposals: Array<{ action: string; documentId: string | null; reason: string }> = [];
		const listed = documents.map((doc) => {
			const flags: string[] = [];
			if (doc.status === "draft") flags.push("Never approved");
			if (pending.has(doc.id)) flags.push("A version is waiting for approval");
			if (doc.freshness?.state === "stale") flags.push(`Stale: ${doc.freshness.reasons.join(" ")}`);
			if (doc.freshness?.state === "expired") flags.push(`Expired: ${doc.freshness.reasons.join(" ")}`);
			if (doc.status === "approved" && !doc.reviewDue) flags.push("No review date");
			if (doc.status === "draft" || pending.has(doc.id))
				proposals.push({
					action: "Review the waiting version",
					documentId: doc.id,
					reason: `"${doc.title}" has a version that only the owner can approve or reject.`,
				});
			if (doc.freshness?.state === "stale")
				proposals.push({
					action: "Re-review and set a new review date",
					documentId: doc.id,
					reason: `"${doc.title}" is past review; drafts citing it are flagged.`,
				});
			if (doc.freshness?.state === "expired")
				proposals.push({
					action: "Replace or retire",
					documentId: doc.id,
					reason: `"${doc.title}" has expired and is no longer used as a source.`,
				});
			return {
				documentId: doc.id,
				title: doc.title,
				collection: doc.collection,
				status: doc.status,
				version: doc.currentVersion,
				freshness: doc.freshness?.state ?? "not approved",
				flags,
			};
		});
		const live = documents.filter((d) => d.status === "approved");
		const conflicts = [
			...groupBy(
				live,
				(d) =>
					`${d.collection}|${d.title
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, " ")
						.trim()}`,
			),
		]
			.filter(([, group]) => group.length > 1)
			.map(([, group]) => ({
				title: group[0].title,
				documentIds: group.map((d) => d.id),
				reason: `${group.length} approved documents in "${group[0].collection}" share this title. Only one should be authoritative.`,
			}));
		for (const conflict of conflicts)
			proposals.push({
				action: "Decide which document is authoritative",
				documentId: conflict.documentIds[0],
				reason: conflict.reason,
			});

		const allowed = collection === "all" ? ROLE_BY_ID.atlas.knowledge : [collection];
		const gaps: Array<{ topic: string; reason: string }> = [];
		for (const topic of ctx.list("topics")) {
			const found = await searchApproved(ctx.deps.sql, {
				query: topic,
				allowedCollections: allowed,
				limit: 1,
				...clock,
			});
			if (found.hits.length === 0) {
				const reason = found.skipped.length
					? `Only an expired document matches ("${found.skipped[0].title}").`
					: "No approved document matches.";
				gaps.push({ topic, reason });
				proposals.push({ action: `Add an approved source for "${topic}"`, documentId: null, reason });
			}
		}
		const needingAttention = listed.filter((d) => d.flags.length).length;
		const sourceRefs: SourceRef[] = documents.slice(0, 50).map((doc) => ({
			system: "atlas",
			id: doc.id,
			version: doc.currentVersion ?? undefined,
			retrievedAt: ctx.now.toISOString(),
			label: doc.title,
		}));
		return {
			output: {
				collection,
				documents: listed,
				conflicts,
				gaps,
				proposals,
				counts: { documents: listed.length, approved: live.length, needingAttention },
			},
			summary: `${plural(listed.length, "document")} reviewed: ${needingAttention} need attention, ${plural(conflicts.length, "conflict")}, ${plural(gaps.length, "uncovered topic")}.`,
			missing: listed.length === 0 ? ["The library has no documents in this collection yet."] : [],
			coverage: { "Documents reviewed": listed.length, "Topics searched": ctx.list("topics").length },
			sourceRefs,
		};
	},
});

export const DATA_FUNCTIONS = [
	checkRecordValidation,
	reviewDeadlineRegister,
	insightMetricAnalysis,
	atlasKnowledgeReview,
];
