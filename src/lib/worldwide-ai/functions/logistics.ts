import { z } from "zod";
import { ZERO, add, dec, div, gt, isZero, lte, maxDec, mul, sub, sum, type Dec } from "../decimal";
import { currencyExponent } from "../money";
import { daysBetween, formatOpsDateTime } from "../time";
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
	upper,
} from "./helpers";
import { groupBy, type Row } from "./table";
import { defineFunction } from "./types";

/** Route, Trace, Stock, Link and Return: shipments, stock, scans and returns, from the records supplied. */

// ---- Route ------------------------------------------------------------------------------------------

export const routeExceptionPackage = defineFunction({
	id: "route.exception-package",
	version: 1,
	agent: "route",
	action: "Resolve shipment exception",
	outputType: "LogisticsExceptionPackage",
	purpose:
		"Puts a shipment exception in order: which delivery documents are missing, which invoiced charges differ from the rate evidence and by exactly how much, and the internal follow-ups.",
	expectedResult:
		"A logistics exception package is stored against the shipment with missing documents, each charge's invoiced and expected amount and difference, unverifiable charges, and drafted internal actions.",
	notThis:
		"It prepares internal follow-ups only. It does not contact the carrier, dispute an invoice, or book or change a shipment.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "shipment", label: "Shipment or tracking number", kind: "text", required: true, max: 80 },
		{ key: "carrier", label: "Carrier", kind: "text", max: 80 },
		{ key: "invoice", label: "Carrier invoice number", kind: "text", max: 80 },
		{ key: "exception", label: "What went wrong", kind: "textarea", required: true, max: 2000 },
		{ key: "currency", label: "Currency", kind: "text", required: true, max: 3, placeholder: "CAD" },
		{ key: "requiredDocuments", label: "Documents this shipment should have", kind: "list", maxItems: 20 },
		{ key: "documentsOnFile", label: "Documents on file", kind: "list", maxItems: 20 },
		{
			key: "charges",
			label: "Invoiced charges",
			kind: "table",
			maxRows: 100,
			columns: [
				{ key: "charge", label: "Charge", required: true, aliases: ["description", "line"] },
				{ key: "invoiced", label: "Invoiced", required: true, kind: "decimal", aliases: ["amount"] },
				{ key: "expected", label: "Expected", kind: "decimal", aliases: ["quoted", "rate"] },
				{ key: "evidence", label: "Evidence", aliases: ["source", "rate evidence"] },
			],
		},
	],
	output: z.object({
		shipment: text,
		carrier: text,
		invoice: text,
		currency: text,
		exception: text,
		missingDocuments: texts,
		discrepancies: z.array(
			z.object({ charge: text, invoiced: text, expected: text, difference: text, evidence: text }),
		),
		agreed: z.array(z.object({ charge: text, amount: text })),
		unverified: z.array(z.object({ charge: text, invoiced: text, reason: text })),
		totals: z.object({ invoiced: text, expectedWhereKnown: text, overcharge: text }),
		actions: z.array(z.object({ action: text, basis: text })),
	}),
	sample: () => ({
		shipment: "[DEMO] 1Z-DEMO-0042",
		carrier: "Demo Freight",
		invoice: "INV-DEMO-77",
		exception: "Delivered two days late and the invoice includes a residential surcharge we were not quoted.",
		currency: "CAD",
		requiredDocuments: "Bill of lading\nProof of delivery\nCommercial invoice",
		documentsOnFile: "Bill of lading\nCommercial invoice",
		charges:
			"charge,invoiced,expected,evidence\nBase freight,148.00,148.00,Rate sheet 2026-Q3\nFuel surcharge,22.20,19.24,Rate sheet 2026-Q3 (13%)\nResidential surcharge,35.00,0,Quote Q-5512\nLiftgate,45.00,,",
	}),
	async handler(ctx) {
		const currency = upper(ctx.text("currency"));
		if (!/^[A-Z]{3}$/.test(currency)) block("Currency must be a three-letter code such as CAD.");
		const dp = currencyExponent(currency);
		const onFile = new Set(ctx.list("documentsOnFile").map(lower));
		const missingDocuments = ctx.list("requiredDocuments").filter((doc) => !onFile.has(lower(doc)));
		const discrepancies: Array<{
			charge: string;
			invoiced: string;
			expected: string;
			difference: string;
			evidence: string;
		}> = [];
		const agreed: Array<{ charge: string; amount: string }> = [];
		const unverified: Array<{ charge: string; invoiced: string; reason: string }> = [];
		let invoicedTotal = ZERO;
		let expectedTotal = ZERO;
		let overcharge = ZERO;
		for (const row of ctx.rows("charges")) {
			const invoiced = num(row, "invoiced");
			invoicedTotal = add(invoicedTotal, invoiced);
			const expected = numOrNull(row, "expected");
			if (!expected) {
				unverified.push({
					charge: row.charge,
					invoiced: fixed(invoiced, dp),
					reason: "No expected amount or rate evidence was supplied.",
				});
				continue;
			}
			expectedTotal = add(expectedTotal, expected);
			const difference = sub(invoiced, expected);
			if (isZero(difference)) agreed.push({ charge: row.charge, amount: fixed(invoiced, dp) });
			else {
				discrepancies.push({
					charge: row.charge,
					invoiced: fixed(invoiced, dp),
					expected: fixed(expected, dp),
					difference: fixed(difference, dp),
					evidence: row.evidence || "No evidence reference given",
				});
				overcharge = add(overcharge, difference);
			}
		}
		const actions = [
			...missingDocuments.map((doc) => ({
				action: `Obtain the ${doc} for shipment ${ctx.text("shipment")}`,
				basis: "Listed as required and not on file.",
			})),
			...discrepancies.map((d) => ({
				action: `Query "${d.charge}": invoiced ${d.invoiced}, expected ${d.expected} (${currency} ${d.difference} difference)`,
				basis: d.evidence,
			})),
			...unverified.map((u) => ({
				action: `Find the rate evidence for "${u.charge}" (${currency} ${u.invoiced})`,
				basis: u.reason,
			})),
		];
		return {
			output: {
				shipment: ctx.text("shipment"),
				carrier: ctx.text("carrier"),
				invoice: ctx.text("invoice"),
				currency,
				exception: ctx.text("exception"),
				missingDocuments,
				discrepancies,
				agreed,
				unverified,
				totals: {
					invoiced: fixed(invoicedTotal, dp),
					expectedWhereKnown: fixed(expectedTotal, dp),
					overcharge: fixed(overcharge, dp),
				},
				actions,
			},
			summary: `Shipment ${ctx.text("shipment")}: ${plural(missingDocuments.length, "missing document")}, ${plural(discrepancies.length, "charge discrepancy", "charge discrepancies")} totalling ${currency} ${fixed(overcharge, dp)}.`,
			missing: [
				...(ctx.list("requiredDocuments").length === 0
					? ["No list of required documents was given, so document gaps were not checked."]
					: []),
				...(ctx.rows("charges").length === 0
					? ["No invoiced charges were given, so charges were not compared."]
					: []),
				...unverified.map((u) => `"${u.charge}" can't be checked: ${u.reason}`),
			],
			coverage: {
				"Charges compared": discrepancies.length + agreed.length,
				"Charges supplied": ctx.rows("charges").length,
			},
		};
	},
});

// ---- Trace ------------------------------------------------------------------------------------------

const hasZone = (value: string) => /(Z|[+-]\d{2}:?\d{2})$/.test(value);
const toInstant = (value: string): number =>
	Date.parse(
		/T| /.test(value)
			? hasZone(value)
				? value.replace(" ", "T")
				: `${value.replace(" ", "T")}Z`
			: `${value}T00:00:00Z`,
	);

export const traceShipmentTimeline = defineFunction({
	id: "trace.shipment-timeline",
	version: 1,
	agent: "trace",
	action: "Build shipment timeline",
	outputType: "ShipmentTimeline",
	purpose:
		"Orders the carrier events you supply for one shipment, keeps each event's own timestamp, separates confirmed events from estimates, and reports duplicates, contradictions and how old the latest event is.",
	expectedResult:
		"A shipment timeline is stored for the order with its confirmed events in order, estimates labelled as estimates, the latest confirmed status, the data's age, and any inconsistencies.",
	notThis:
		"It never adds an event or a delivery date that isn't in the record. It is a timeline, not a message to the customer.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "order", label: "Order number", kind: "text", required: true, max: 40 },
		{ key: "shipment", label: "Tracking number", kind: "text", required: true, max: 80 },
		{ key: "carrier", label: "Carrier", kind: "text", max: 80 },
		{
			key: "exportedAt",
			label: "When the events were exported",
			kind: "text",
			max: 40,
			help: "Date and time of the export, if known (2026-10-09T15:00:00Z).",
		},
		{
			key: "events",
			label: "Carrier events",
			kind: "table",
			required: true,
			maxRows: 200,
			columns: [
				{
					key: "timestamp",
					label: "Timestamp",
					required: true,
					kind: "datetime",
					aliases: ["time", "date", "event time"],
				},
				{ key: "status", label: "Status", required: true, aliases: ["event", "description"] },
				{ key: "location", label: "Location" },
				{ key: "kind", label: "Kind", aliases: ["type"] },
			],
		},
	],
	output: z.object({
		order: text,
		shipment: text,
		carrier: text,
		confirmed: z.array(z.object({ timestamp: text, winnipegTime: text, status: text, location: text })),
		estimates: z.array(z.object({ timestamp: text, status: text })),
		latestConfirmed: z.object({ timestamp: text, status: text, location: text }).nullable(),
		delivered: z.boolean(),
		daysSinceLatestEvent: z.number().int().nullable(),
		issues: texts,
	}),
	sample: () => ({
		order: "[DEMO] 1051",
		shipment: "DEMO-TRACK-889",
		carrier: "Demo Post",
		exportedAt: "2026-10-09T15:00:00Z",
		events:
			"timestamp,status,location,kind\n2026-10-06T14:10:00-05:00,Picked up,Winnipeg MB,confirmed\n2026-10-05T09:00:00-05:00,Label created,Winnipeg MB,confirmed\n2026-10-07T02:30:00-05:00,In transit,Thunder Bay ON,confirmed\n2026-10-07T02:30:00-05:00,In transit,Thunder Bay ON,confirmed\n2026-10-10T17:00:00-04:00,Expected delivery,Toronto ON,estimate",
	}),
	async handler(ctx) {
		const issues: string[] = [];
		const seen = new Set<string>();
		let duplicates = 0;
		const rows = ctx.rows("events").filter((row) => {
			const key = `${row.timestamp}|${lower(row.status)}|${lower(row.location)}`;
			if (seen.has(key)) {
				duplicates += 1;
				return false;
			}
			seen.add(key);
			return true;
		});
		if (duplicates)
			issues.push(`${plural(duplicates, "duplicate event")} removed (same time, status and place).`);
		const supplied = rows.map((r) => toInstant(r.timestamp));
		if (supplied.some((t, i) => i > 0 && t < supplied[i - 1]))
			issues.push("The events were supplied out of time order; they are shown in order here.");
		if (rows.some((r) => !hasZone(r.timestamp)))
			issues.push(
				"Some timestamps have no time zone. They are kept as written and treated as UTC for ordering only.",
			);
		const ordered = [...rows].sort((a, b) => toInstant(a.timestamp) - toInstant(b.timestamp));
		const isEstimate = (row: Row) => /^(estimate|estimated|expected|forecast)$/.test(lower(row.kind));
		const confirmedRows = ordered.filter((r) => !isEstimate(r));
		const confirmed = confirmedRows.map((r) => ({
			timestamp: r.timestamp,
			winnipegTime: hasZone(r.timestamp) ? formatOpsDateTime(toInstant(r.timestamp)) : "zone not given",
			status: r.status,
			location: r.location ?? "",
		}));
		const deliveredAt = confirmedRows.findIndex((r) => /\bdelivered\b/i.test(r.status));
		if (deliveredAt >= 0 && deliveredAt < confirmedRows.length - 1)
			issues.push(
				`An event ("${confirmedRows[deliveredAt + 1].status}") is recorded after delivery. The record contradicts itself.`,
			);
		const latest = confirmedRows[confirmedRows.length - 1];
		const reference = ctx.text("exportedAt") ? Date.parse(ctx.text("exportedAt")) : ctx.now.getTime();
		if (ctx.text("exportedAt") && Number.isNaN(reference))
			block("The export time isn't a date and time like 2026-10-09T15:00:00Z.");
		const age = latest ? Math.floor((ctx.now.getTime() - toInstant(latest.timestamp)) / 86_400_000) : null;
		if (latest && toInstant(latest.timestamp) > reference)
			issues.push("The latest confirmed event is dated after the export it came from.");
		return {
			output: {
				order: ctx.text("order"),
				shipment: ctx.text("shipment"),
				carrier: ctx.text("carrier"),
				confirmed,
				estimates: ordered
					.filter(isEstimate)
					.map((r) => ({ timestamp: r.timestamp, status: `Estimate: ${r.status}` })),
				latestConfirmed: latest
					? { timestamp: latest.timestamp, status: latest.status, location: latest.location ?? "" }
					: null,
				delivered: deliveredAt >= 0,
				daysSinceLatestEvent: age,
				issues,
			},
			summary: latest
				? `Order ${ctx.text("order")}: latest confirmed event "${latest.status}" (${latest.timestamp}); ${deliveredAt >= 0 ? "delivered" : "not shown as delivered"}.`
				: `Order ${ctx.text("order")}: no confirmed events were supplied.`,
			missing: [
				...(confirmed.length === 0 ? ["There are no confirmed events, only estimates."] : []),
				...(!ctx.text("exportedAt")
					? ["The export time wasn't given, so how fresh these events are is unknown."]
					: []),
			],
			coverage: { "Events supplied": ctx.rows("events").length, "Confirmed events": confirmed.length },
			sourceRefs: [
				{
					system: "carrier-export",
					id: ctx.text("shipment"),
					retrievedAt: ctx.text("exportedAt") || ctx.now.toISOString(),
					label: `${ctx.text("carrier") || "Carrier"} events for ${ctx.text("shipment")}`,
				},
			],
			warnings:
				age !== null && age > 3 && deliveredAt < 0
					? [`The latest event is ${age} days old and the shipment isn't shown as delivered.`]
					: [],
		};
	},
	verify: (output, input) => {
		const supplied = new Set((input.events as Row[]).map((r) => `${r.timestamp}|${r.status}`));
		return output.confirmed
			.filter((e) => !supplied.has(`${e.timestamp}|${e.status}`))
			.map((e) => `Event "${e.status}" at ${e.timestamp} isn't in the supplied record.`);
	},
});

// ---- Stock ------------------------------------------------------------------------------------------

const stockLine = z.object({
	sku: text,
	unit: text,
	onHand: text,
	onHold: text,
	expired: text,
	reserved: text,
	usable: text,
	dailyDemand: nullableText,
	daysOfCover: nullableText,
	leadTimeDays: z.number().int().nullable(),
	target: nullableText,
	shortage: nullableText,
	status: z.enum(["reorder", "low", "ok", "cannot_calculate"]),
	notes: texts,
});

export const stockReplenishmentPlan = defineFunction({
	id: "stock.replenishment-plan",
	version: 1,
	agent: "stock",
	action: "Calculate replenishment needs",
	outputType: "ReplenishmentPlan",
	purpose:
		"Works out usable stock per SKU from a stock snapshot (on hand less holds, expired lots and reservations) and the quantity short of covering demand through the lead time plus the days you choose.",
	expectedResult:
		"A replenishment plan is stored with usable quantity, days of cover, target and shortage per SKU, with held and expired stock shown separately and every SKU that couldn't be calculated.",
	notThis:
		"It recommends. It does not adjust stock, confirm a reservation or place an order, and a SKU with no demand or lead time is not guessed at.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "snapshot", label: "Snapshot name", kind: "text", required: true, max: 120 },
		{ key: "asOf", label: "Snapshot date", kind: "date", help: "Leave blank for today in Winnipeg." },
		{ key: "coverDays", label: "Days to cover beyond the lead time", kind: "integer", help: "Default 30." },
		{
			key: "stock",
			label: "Stock lines (one per SKU or per lot)",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "sku", label: "SKU", required: true },
				{ key: "on_hand", label: "On hand", required: true, kind: "decimal", aliases: ["quantity", "qty"] },
				{ key: "on_hold", label: "On hold", kind: "decimal", aliases: ["quarantine", "quarantined", "hold"] },
				{ key: "reserved", label: "Reserved", kind: "decimal" },
				{ key: "unit", label: "Unit" },
				{ key: "lot", label: "Lot" },
				{ key: "expiry", label: "Expiry", kind: "date" },
				{ key: "daily_demand", label: "Daily demand", kind: "decimal", aliases: ["demand per day"] },
				{ key: "min_stock", label: "Minimum stock", kind: "decimal", aliases: ["threshold", "safety stock"] },
				{ key: "lead_time_days", label: "Lead time (days)", kind: "integer", aliases: ["lead time"] },
			],
		},
	],
	output: z.object({
		snapshot: text,
		asOf: text,
		coverDays: count,
		lines: z.array(stockLine),
		counts: z.object({ reorder: count, low: count, ok: count, cannotCalculate: count }),
	}),
	sample: () => ({
		snapshot: "[DEMO] Warehouse count",
		asOf: "2026-10-09",
		coverDays: "30",
		stock:
			"sku,lot,on_hand,on_hold,reserved,unit,expiry,daily_demand,min_stock,lead_time_days\nPG-BASE,L-100,5000,0,1200,mL,2027-03-31,180,1000,14\nPG-BASE,L-090,800,0,0,mL,2026-09-30,180,1000,14\nVG-BASE,L-200,9000,2000,500,mL,2027-06-30,90,1500,21\nBOTTLE-30,,400,0,0,each,,,,\nFLAV-A,L-300,120,0,0,mL,2027-01-15,2,50,30",
	}),
	async handler(ctx) {
		const asOf = ctx.text("asOf") || ctx.today;
		const coverDays = fieldInt(ctx, "coverDays", 30);
		const lines = [...groupBy(ctx.rows("stock"), (r) => r.sku)].map(([sku, lots]) => {
			const notes: string[] = [];
			const units = [...new Set(lots.map((l) => l.unit).filter(Boolean))];
			if (units.length > 1)
				return {
					sku,
					unit: units.join(" / "),
					onHand: "0",
					onHold: "0",
					expired: "0",
					reserved: "0",
					usable: "0",
					dailyDemand: null,
					daysOfCover: null,
					leadTimeDays: null,
					target: null,
					shortage: null,
					status: "cannot_calculate" as const,
					notes: [
						`Lots are recorded in different units (${units.join(", ")}). They are not added together without a documented conversion.`,
					],
				};
			const live = lots.filter((l) => !l.expiry || l.expiry >= asOf);
			const dead = lots.filter((l) => l.expiry && l.expiry < asOf);
			const onHand = sum(lots.map((l) => num(l, "on_hand")));
			const expired = sum(dead.map((l) => num(l, "on_hand")));
			const onHold = sum(live.map((l) => num(l, "on_hold")));
			const reserved = sum(lots.map((l) => num(l, "reserved")));
			const usable = maxDec(ZERO, sub(sub(sub(onHand, expired), onHold), reserved));
			if (dead.length)
				notes.push(
					`${plural(dead.length, "lot")} expired before ${asOf} and ${dead.length === 1 ? "is" : "are"} not counted as usable.`,
				);
			if (gt(add(add(expired, onHold), reserved), onHand))
				notes.push(
					"Holds, expired stock and reservations add up to more than is on hand. Check the records.",
				);
			const firstOf = (key: string): Dec | null =>
				lots.map((l) => numOrNull(l, key)).find((v): v is Dec => v !== null) ?? null;
			const demand = firstOf("daily_demand");
			const minimum = firstOf("min_stock") ?? ZERO;
			const leadRow = lots.find((l) => l.lead_time_days);
			const lead = leadRow ? Number(leadRow.lead_time_days) : null;
			const base = {
				sku,
				unit: units[0] ?? "",
				onHand: plain(onHand),
				onHold: plain(onHold),
				expired: plain(expired),
				reserved: plain(reserved),
				usable: plain(usable),
			};
			if (!demand || lead === null) {
				notes.push(
					`${!demand ? "No daily demand" : "No lead time"} was supplied, so cover and shortage can't be calculated.`,
				);
				return {
					...base,
					dailyDemand: demand ? plain(demand) : null,
					daysOfCover: null,
					leadTimeDays: lead,
					target: null,
					shortage: null,
					status: "cannot_calculate" as const,
					notes,
				};
			}
			const target = add(mul(demand, dec(lead + coverDays)), minimum);
			const shortage = maxDec(ZERO, sub(target, usable));
			const reorderPoint = add(mul(demand, dec(lead)), minimum);
			const status = lte(usable, reorderPoint)
				? ("reorder" as const)
				: gt(shortage, ZERO)
					? ("low" as const)
					: ("ok" as const);
			const earliest = live.filter((l) => l.expiry).sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
			if (earliest && live.length > 1)
				notes.push(`Use lot ${earliest.lot || "(unnamed)"} first: it expires ${earliest.expiry}.`);
			return {
				...base,
				dailyDemand: plain(demand),
				daysOfCover: isZero(demand) ? null : fixed(div(usable, demand), 1),
				leadTimeDays: lead,
				target: plain(target),
				shortage: plain(shortage),
				status,
				notes,
			};
		});
		const order = { reorder: 0, low: 1, cannot_calculate: 2, ok: 3 } as const;
		lines.sort((a, b) => order[a.status] - order[b.status] || a.sku.localeCompare(b.sku));
		const counts = {
			reorder: lines.filter((l) => l.status === "reorder").length,
			low: lines.filter((l) => l.status === "low").length,
			ok: lines.filter((l) => l.status === "ok").length,
			cannotCalculate: lines.filter((l) => l.status === "cannot_calculate").length,
		};
		return {
			output: { snapshot: ctx.text("snapshot"), asOf, coverDays, lines, counts },
			summary: `${counts.reorder} to reorder now, ${counts.low} low, ${counts.cannotCalculate} that can't be calculated, of ${plural(lines.length, "SKU")}.`,
			missing: lines
				.filter((l) => l.status === "cannot_calculate")
				.map((l) => `${l.sku}: ${l.notes[l.notes.length - 1]}`),
			assumptions: [
				`Target is daily demand × (lead time + ${coverDays} days) + minimum stock. Reorder when usable stock is at or below demand through the lead time plus the minimum.`,
				"The snapshot is taken as supplied: it is not compared with Saleor or any other system here.",
			],
			coverage: { "SKUs planned": lines.length, "Stock lines read": ctx.rows("stock").length },
		};
	},
});

// ---- Link -------------------------------------------------------------------------------------------

export const linkScanReconciliation = defineFunction({
	id: "link.scan-reconciliation",
	version: 1,
	agent: "link",
	action: "Reconcile scan session",
	outputType: "ScanReconciliation",
	purpose:
		"Reconciles one session's tag reads against its manifest: repeated reads count once, a carton and the units inside it are not both counted, and unknown or missing tags become exceptions.",
	expectedResult:
		"A scan reconciliation is stored with expected and observed units per SKU, missing tags, unknown tags, how cartons were counted, and the number of repeated reads that were collapsed.",
	notThis:
		"A read is an observation. No stock is moved, no location is inferred from a nearby read, and reading a tag proves nothing about authenticity, identity or age.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "session", label: "Session", kind: "text", required: true, max: 120 },
		{
			key: "sessionType",
			label: "Session type",
			kind: "select",
			required: true,
			options: [
				{ value: "receiving", label: "Receiving" },
				{ value: "cycle_count", label: "Cycle count" },
				{ value: "picking", label: "Picking" },
				{ value: "shipping", label: "Shipping" },
			],
		},
		{
			key: "source",
			label: "Where the scans came from",
			kind: "text",
			required: true,
			max: 160,
			help: "The reader export or file, and whether it is real or simulated.",
		},
		{
			key: "manifest",
			label: "Manifest (expected tags)",
			kind: "table",
			required: true,
			maxRows: 2000,
			columns: [
				{ key: "tag", label: "Tag", required: true, aliases: ["tag id", "epc", "uid"] },
				{ key: "sku", label: "SKU", required: true },
				{ key: "kind", label: "Kind", aliases: ["type"] },
				{ key: "parent_tag", label: "Parent tag", aliases: ["carton", "parent"] },
				{ key: "units", label: "Units inside", kind: "integer", aliases: ["quantity", "carton quantity"] },
			],
		},
		{
			key: "scans",
			label: "Scan events",
			kind: "table",
			required: true,
			maxRows: 5000,
			columns: [
				{ key: "event_id", label: "Event id", required: true, aliases: ["id"] },
				{ key: "tag", label: "Tag", required: true, aliases: ["tag id", "epc", "uid"] },
				{ key: "timestamp", label: "Timestamp", required: true, kind: "datetime", aliases: ["time"] },
				{ key: "reader", label: "Reader" },
			],
		},
	],
	output: z.object({
		session: text,
		sessionType: text,
		source: text,
		reads: z.object({ events: count, replayedEvents: count, distinctTags: count, repeatedReads: count }),
		bySku: z.array(
			z.object({
				sku: text,
				expectedUnits: count,
				observedUnits: count,
				viaCartonOnly: count,
				difference: z.number().int(),
			}),
		),
		missingTags: z.array(z.object({ tag: text, sku: text, kind: text })),
		unknownTags: z.array(z.object({ tag: text, reads: count, firstSeen: text })),
		cartons: z.array(
			z.object({ tag: text, sku: text, unitsOnManifest: count, childrenObserved: count, counted: text }),
		),
		matches: z.boolean(),
	}),
	sample: () => ({
		session: "[DEMO] PO-4471 receiving",
		sessionType: "receiving",
		source: "Simulated reader export (demonstration, not a real reader)",
		manifest:
			"tag,sku,kind,parent_tag,units\nC-01,BOTTLE-30,carton,,3\nU-01,BOTTLE-30,unit,C-01,\nU-02,BOTTLE-30,unit,C-01,\nU-03,BOTTLE-30,unit,C-01,\nC-02,BOTTLE-30,carton,,3\nU-10,COIL-X,unit,,\nU-11,COIL-X,unit,,",
		scans:
			"event_id,tag,timestamp,reader\nE1,C-01,2026-10-09T15:00:01Z,dock-1\nE2,U-01,2026-10-09T15:00:01Z,dock-1\nE3,U-02,2026-10-09T15:00:02Z,dock-1\nE4,U-01,2026-10-09T15:00:03Z,dock-1\nE4,U-01,2026-10-09T15:00:03Z,dock-1\nE5,C-02,2026-10-09T15:00:05Z,dock-1\nE6,U-10,2026-10-09T15:00:06Z,dock-1\nE7,X-99,2026-10-09T15:00:07Z,dock-1",
	}),
	async handler(ctx) {
		const manifest = ctx.rows("manifest");
		const tags = new Map(manifest.map((m) => [m.tag, m]));
		if (tags.size !== manifest.length)
			block("The manifest lists a tag more than once. Each tag must appear once.");
		const isCarton = (m: Row) =>
			lower(m.kind) === "carton" || manifest.some((child) => child.parent_tag === m.tag);

		const events = new Map<string, Row>();
		let replayed = 0;
		for (const scan of ctx.rows("scans")) {
			if (events.has(scan.event_id)) replayed += 1;
			else events.set(scan.event_id, scan);
		}
		const reads = [...groupBy([...events.values()], (s) => s.tag)];
		const observed = new Set(reads.map(([tag]) => tag));
		const repeated = reads.reduce((n, [, group]) => n + group.length - 1, 0);

		const cartons = manifest.filter(isCarton).map((carton) => {
			const children = manifest.filter((m) => m.parent_tag === carton.tag);
			const childrenObserved = children.filter((c) => observed.has(c.tag)).length;
			const unitsOnManifest = carton.units ? Number(carton.units) : children.length;
			return {
				tag: carton.tag,
				sku: carton.sku,
				unitsOnManifest,
				childrenObserved,
				seen: observed.has(carton.tag),
				counted:
					childrenObserved > 0
						? `${childrenObserved} units read individually (the carton tag itself adds none)`
						: observed.has(carton.tag)
							? `Carton read, no unit inside read: ${unitsOnManifest} units come from the manifest, not from observation`
							: "Not read",
			};
		});
		const bySku = [...groupBy(manifest, (m) => m.sku)].map(([sku, items]) => {
			const units = items.filter((m) => !isCarton(m));
			const skuCartons = cartons.filter((c) => c.sku === sku);
			// Expected: every unit listed, plus the stated contents of cartons whose units aren't listed one by one.
			const expectedUnits =
				units.length +
				skuCartons
					.filter((c) => !items.some((m) => m.parent_tag === c.tag))
					.reduce((n, c) => n + c.unitsOnManifest, 0);
			const observedUnits = units.filter((u) => observed.has(u.tag)).length;
			const viaCartonOnly = skuCartons
				.filter((c) => c.seen && c.childrenObserved === 0)
				.reduce((n, c) => n + c.unitsOnManifest, 0);
			return {
				sku,
				expectedUnits,
				observedUnits,
				viaCartonOnly,
				difference: observedUnits + viaCartonOnly - expectedUnits,
			};
		});
		const inCartonReadWhole = (m: Row) =>
			cartons.some((c) => c.tag === m.parent_tag && c.seen && c.childrenObserved === 0);
		const missingTags = manifest
			.filter((m) => !observed.has(m.tag) && !inCartonReadWhole(m))
			.map((m) => ({ tag: m.tag, sku: m.sku, kind: isCarton(m) ? "carton" : "unit" }));
		const unknownTags = reads
			.filter(([tag]) => !tags.has(tag))
			.map(([tag, group]) => ({
				tag,
				reads: group.length,
				firstSeen: [...group].sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0].timestamp,
			}));
		const matches =
			missingTags.length === 0 && unknownTags.length === 0 && bySku.every((s) => s.difference === 0);
		return {
			output: {
				session: ctx.text("session"),
				sessionType: ctx.text("sessionType"),
				source: ctx.text("source"),
				reads: {
					events: events.size,
					replayedEvents: replayed,
					distinctTags: observed.size,
					repeatedReads: repeated,
				},
				bySku,
				missingTags,
				unknownTags,
				cartons: cartons.map(({ seen: _seen, ...carton }) => carton),
				matches,
			},
			summary: matches
				? `${ctx.text("session")}: all ${manifest.length} manifest tags accounted for.`
				: `${ctx.text("session")}: ${plural(missingTags.length, "tag")} missing, ${plural(unknownTags.length, "unknown tag")}.`,
			missing: bySku
				.filter((s) => s.viaCartonOnly > 0)
				.map(
					(s) =>
						`${s.sku}: ${s.viaCartonOnly} units were not read individually; their count comes from the manifest.`,
				),
			assumptions: [
				"A tag read at least once in the session counts as observed, once.",
				"A tag not read may still be present: an unread tag is a gap in the evidence, not proof of absence.",
			],
			coverage: { "Manifest tags": manifest.length, "Scan events read": ctx.rows("scans").length },
			warnings: /simulat|demo|test/i.test(ctx.text("source"))
				? ["The scans are from a simulated source. This says nothing about a real reader."]
				: [],
			sourceRefs: [
				{
					system: "scan-export",
					id: ctx.text("session"),
					retrievedAt: ctx.now.toISOString(),
					label: ctx.text("source"),
				},
			],
		};
	},
});

// ---- Return -----------------------------------------------------------------------------------------

export const returnCaseReview = defineFunction({
	id: "return.case-review",
	version: 1,
	agent: "return",
	action: "Review return or warranty",
	outputType: "ReturnReviewPackage",
	purpose:
		"Checks a return or warranty request against the order facts and the policy terms you give it (window, condition, earlier returns) and proposes a resolution with the facts it rests on.",
	expectedResult:
		"A return review package is stored with each eligibility check and its evidence, the facts still unconfirmed, and a proposed resolution or supplier claim for a person to decide.",
	notThis:
		"It proposes. No refund, replacement or stock adjustment is made, and a missing fact leaves eligibility undetermined rather than assumed.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "orderNumber", label: "Order number", kind: "text", required: true, max: 40 },
		{ key: "sku", label: "Product (SKU)", kind: "text", required: true, max: 80 },
		{ key: "lot", label: "Lot or serial", kind: "text", max: 80 },
		{ key: "request", label: "What the customer asked for", kind: "textarea", required: true, max: 3000 },
		{
			key: "requestType",
			label: "Request type",
			kind: "select",
			required: true,
			options: [
				{ value: "return", label: "Return" },
				{ value: "warranty", label: "Warranty or fault" },
			],
		},
		{ key: "requestedOn", label: "Requested on", kind: "date", required: true },
		{ key: "deliveredOn", label: "Delivered on", kind: "date" },
		{
			key: "condition",
			label: "Reported condition",
			kind: "select",
			required: true,
			options: [
				{ value: "unopened", label: "Unopened" },
				{ value: "opened", label: "Opened" },
				{ value: "faulty", label: "Faulty or damaged" },
				{ value: "unknown", label: "Not stated" },
			],
		},
		{
			key: "policy",
			label: "Policy and version relied on",
			kind: "text",
			max: 160,
			placeholder: "Returns and refunds, version 3",
		},
		{ key: "windowDays", label: "Policy window (days from delivery)", kind: "integer" },
		{
			key: "openedAllowed",
			label: "Does the policy accept opened items of this kind?",
			kind: "select",
			options: [
				{ value: "yes", label: "Yes" },
				{ value: "no", label: "No" },
				{ value: "unknown", label: "Not sure" },
			],
		},
		{ key: "priorReturns", label: "Earlier returns on this order", kind: "integer" },
		{
			key: "evidence",
			label: "Evidence on file",
			kind: "list",
			maxItems: 20,
			help: "Photos, order record, supplier notice… one per line.",
		},
	],
	output: z.object({
		orderNumber: text,
		sku: text,
		lot: text,
		requestType: text,
		checks: z.array(
			z.object({ check: text, result: z.enum(["met", "not_met", "undetermined"]), detail: text }),
		),
		eligibility: z.enum(["eligible", "not_eligible", "undetermined"]),
		unconfirmed: texts,
		proposedResolution: text,
		supplierClaim: nullableText,
		evidence: texts,
	}),
	sample: () => ({
		orderNumber: "[DEMO] 1042",
		sku: "COIL-X-5PK",
		request: "I ordered an unopened coil pack last week and changed my mind. Can I return it for a refund?",
		requestType: "return",
		requestedOn: "2026-10-06",
		deliveredOn: "2026-09-30",
		condition: "unopened",
		policy: "[DEMO] Returns and refunds, version 1",
		windowDays: "30",
		openedAllowed: "no",
		priorReturns: "0",
		evidence: "Order record 1042\nCustomer message of 2026-10-06",
	}),
	async handler(ctx) {
		const checks: Array<{ check: string; result: "met" | "not_met" | "undetermined"; detail: string }> = [];
		const unconfirmed: string[] = [];
		const delivered = ctx.text("deliveredOn");
		const window = ctx.text("windowDays");
		if (ctx.text("requestedOn") > ctx.today) block("The request date is in the future.");
		if (!ctx.text("policy")) unconfirmed.push("Which approved policy and version applies.");
		if (!delivered || !window) {
			checks.push({
				check: "Requested within the policy window",
				result: "undetermined",
				detail: !delivered ? "The delivery date isn't known." : "The policy window wasn't given.",
			});
			unconfirmed.push(!delivered ? "The delivery date." : "The policy's return window.");
		} else {
			const elapsed = daysBetween(delivered, ctx.text("requestedOn"));
			if (elapsed < 0) block("The request is dated before the delivery.");
			checks.push({
				check: "Requested within the policy window",
				result: elapsed <= Number(window) ? "met" : "not_met",
				detail: `Requested ${plural(elapsed, "day")} after delivery; the window is ${window} days.`,
			});
		}
		const condition = ctx.text("condition");
		const isWarranty = ctx.text("requestType") === "warranty";
		if (condition === "unknown") {
			checks.push({
				check: "Condition accepted by the policy",
				result: "undetermined",
				detail: "The item's condition wasn't stated.",
			});
			unconfirmed.push("The item's condition.");
		} else if (condition === "unopened")
			checks.push({ check: "Condition accepted by the policy", result: "met", detail: "Reported unopened." });
		else if (condition === "faulty")
			checks.push({
				check: "Condition accepted by the policy",
				result: isWarranty ? "met" : "undetermined",
				detail: isWarranty
					? "Reported faulty, on a warranty request."
					: "Reported faulty on a return request: decide whether this is a warranty matter.",
			});
		else {
			const allowed = ctx.text("openedAllowed") || "unknown";
			checks.push({
				check: "Condition accepted by the policy",
				result: allowed === "yes" ? "met" : allowed === "no" ? "not_met" : "undetermined",
				detail:
					allowed === "unknown"
						? "Opened, and whether the policy accepts opened items of this kind wasn't confirmed."
						: `Opened; the policy ${allowed === "yes" ? "accepts" : "does not accept"} opened items of this kind.`,
			});
			if (allowed === "unknown") unconfirmed.push("Whether the policy accepts opened items of this kind.");
		}
		if (isWarranty && condition === "faulty" && ctx.list("evidence").length === 0) {
			checks.push({
				check: "Fault is evidenced",
				result: "undetermined",
				detail: "No photo or description of the fault is on file.",
			});
			unconfirmed.push("Evidence of the fault.");
		}
		const prior = ctx.text("priorReturns");
		if (prior && Number(prior) > 0)
			checks.push({
				check: "No earlier return on this order",
				result: "not_met",
				detail: `${plural(Number(prior), "earlier return")} recorded. This is a fact to weigh, not proof of anything.`,
			});
		const decisive = checks.filter((c) => c.check !== "No earlier return on this order");
		const eligibility = decisive.some((c) => c.result === "not_met")
			? "not_eligible"
			: decisive.some((c) => c.result === "undetermined") || unconfirmed.length
				? "undetermined"
				: "eligible";
		const policy = ctx.text("policy") || "the applicable policy";
		const proposedResolution =
			eligibility === "eligible"
				? isWarranty
					? `Proposed: accept the warranty request for ${ctx.text("sku")} under ${policy}. A person decides replacement or refund.`
					: `Proposed: accept the return of ${ctx.text("sku")} under ${policy}. Any refund is issued by a person, not here.`
				: eligibility === "not_eligible"
					? `Proposed: decline under ${policy} (${decisive
							.filter((c) => c.result === "not_met")
							.map((c) => c.detail)
							.join(" ")}). A person may still decide to make an exception.`
					: `No resolution proposed yet. First confirm: ${unconfirmed.join(" ")}`;
		return {
			output: {
				orderNumber: ctx.text("orderNumber"),
				sku: ctx.text("sku"),
				lot: ctx.text("lot"),
				requestType: ctx.text("requestType"),
				checks,
				eligibility,
				unconfirmed,
				proposedResolution,
				supplierClaim:
					isWarranty && condition === "faulty"
						? `Draft supplier claim: ${ctx.text("sku")}${ctx.text("lot") ? `, lot ${ctx.text("lot")}` : " (lot not recorded)"}, reported faulty on ${ctx.text("requestedOn")}.`
						: null,
				evidence: ctx.list("evidence"),
			},
			summary: `Order ${ctx.text("orderNumber")}, ${ctx.text("sku")}: ${eligibility.replace("_", " ")}.`,
			missing: unconfirmed,
			assumptions: [
				"The policy terms are the ones entered on this request; they were not retrieved from the knowledge library here.",
				"The order facts are as entered and were not checked against Saleor.",
			],
			coverage: { "Checks run": checks.length },
		};
	},
});

export const LOGISTICS_FUNCTIONS = [
	routeExceptionPackage,
	traceShipmentTimeline,
	stockReplenishmentPlan,
	linkScanReconciliation,
	returnCaseReview,
];
