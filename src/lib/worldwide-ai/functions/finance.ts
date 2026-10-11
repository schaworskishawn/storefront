import { z } from "zod";
import {
	ONE,
	ZERO,
	abs,
	add,
	cmp,
	dec,
	div,
	eq,
	gt,
	isNegative,
	lt,
	maxDec,
	mul,
	round,
	sub,
	sum,
	type Dec,
} from "../decimal";
import { currencyExponent } from "../money";
import { daysBetween } from "../time";
import {
	block,
	count,
	fieldDec,
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

/**
 * Ledger, Tally, Vault, Forecast, Duty and Source. Every figure here is calculated in exact decimals by this code, in one
 * stated currency; an amount in another currency is set aside, never converted on a guessed rate; and a rule or rate that
 * wasn't supplied leaves the lines it would apply to unresolved instead of zero.
 */

const currencyField = {
	key: "currency",
	label: "Currency",
	kind: "text",
	required: true,
	max: 3,
	placeholder: "CAD",
} as const;
const currencyOf = (value: string): string => {
	const code = upper(value);
	if (!/^[A-Z]{3}$/.test(code)) block(`"${value}" isn't a three-letter currency code such as CAD or USD.`);
	return code;
};
const places = (currency: string) => currencyExponent(currency);
const inPeriod = (date: string, period: string) => date.startsWith(period);
const periodOf = (value: string): string => {
	if (!/^\d{4}-\d{2}$/.test(value)) block(`The period "${value}" must be a month written YYYY-MM.`);
	return value;
};
const otherCurrency = (row: Row, currency: string) =>
	row.currency !== undefined && row.currency !== "" && upper(row.currency) !== currency;

// ---- Ledger -----------------------------------------------------------------------------------------

export const ledgerPeriodWorkpaper = defineFunction({
	id: "ledger.period-workpaper",
	version: 1,
	agent: "ledger",
	action: "Prepare accounting workpaper",
	outputType: "AccountingWorkpaper",
	purpose:
		"Classifies a period's transactions against your chart of accounts (keeping any account already recorded, proposing one from your keyword rules otherwise) and totals each account exactly.",
	expectedResult:
		"An accounting workpaper is stored with every transaction's account and the basis for it, exact totals per account, proposed entries, and the transactions that could not be classified.",
	notThis:
		"No entry is posted and no money moves. Proposals come only from the keywords you supply; a transaction no rule matches stays unclassified.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "entity", label: "Entity", kind: "text", required: true, max: 120 },
		{ key: "period", label: "Period (YYYY-MM)", kind: "text", required: true, max: 7 },
		currencyField,
		{
			key: "accounts",
			label: "Chart of accounts",
			kind: "table",
			required: true,
			columns: [
				{ key: "account", label: "Account", required: true, aliases: ["code", "account code"] },
				{ key: "name", label: "Name" },
				{ key: "keywords", label: "Keywords", aliases: ["match", "rules"] },
			],
		},
		{
			key: "transactions",
			label: "Transactions",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "id", label: "Id", required: true, aliases: ["reference", "ref", "transaction id"] },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "description", label: "Description", required: true, aliases: ["memo", "details"] },
				{ key: "amount", label: "Amount", required: true, kind: "decimal" },
				{ key: "currency", label: "Currency" },
				{ key: "account", label: "Account" },
			],
		},
	],
	output: z.object({
		entity: text,
		period: text,
		currency: text,
		totals: z.array(z.object({ account: text, name: text, transactions: count, total: text })),
		classified: z.array(
			z.object({ transactionId: text, date: text, amount: text, account: text, basis: text }),
		),
		proposedEntries: z.array(z.object({ transactionId: text, account: text, amount: text, reason: text })),
		unclassified: z.array(z.object({ transactionId: text, date: text, amount: text, reason: text })),
		grandTotal: text,
		unclassifiedTotal: text,
	}),
	sample: () => ({
		entity: "[DEMO] Worldwide Vapor",
		period: "2026-09",
		currency: "CAD",
		accounts:
			"account,name,keywords\n6100,Software,shopify; vercel; adobe\n6200,Shipping,canada post; purolator\n5000,Ingredients,flavour; glycol",
		transactions:
			"id,date,description,amount,currency,account\nT1,2026-09-03,Vercel Pro plan,-28.00,CAD,\nT2,2026-09-05,Canada Post shipment batch,-412.50,CAD,\nT3,2026-09-09,Propylene glycol 20L,-310.00,CAD,5000\nT4,2026-09-12,Unknown card charge,-75.25,CAD,\nT5,2026-09-15,Adobe US subscription,-54.99,USD,\nT6,2026-10-01,October charge,-10.00,CAD,",
	}),
	async handler(ctx) {
		const currency = currencyOf(ctx.text("currency"));
		const period = periodOf(ctx.text("period"));
		const accounts = ctx.rows("accounts");
		const byCode = new Map(accounts.map((a) => [a.account, a]));
		const rules = accounts.flatMap((a) =>
			(a.keywords ?? "")
				.split(/[;,]/)
				.map((k) => lower(k))
				.filter(Boolean)
				.map((keyword) => ({ keyword, account: a.account })),
		);
		const dp = places(currency);
		const classified: Array<{
			transactionId: string;
			date: string;
			amount: string;
			account: string;
			basis: string;
		}> = [];
		const proposedEntries: Array<{ transactionId: string; account: string; amount: string; reason: string }> =
			[];
		const unclassified: Array<{ transactionId: string; date: string; amount: string; reason: string }> = [];
		const amounts = new Map<string, Dec[]>();
		let outside = 0;
		for (const tx of ctx.rows("transactions")) {
			if (!inPeriod(tx.date, period)) {
				outside += 1;
				continue;
			}
			const amount = num(tx, "amount");
			const shown = fixed(amount, dp);
			const leave = (reason: string) =>
				unclassified.push({ transactionId: tx.id, date: tx.date, amount: shown, reason });
			if (otherCurrency(tx, currency)) {
				leave(
					`In ${upper(tx.currency)}, not ${currency}. It is not converted here; classify it in its own currency.`,
				);
				continue;
			}
			let account: string | null = null;
			let basis = "";
			if (tx.account) {
				if (!byCode.has(tx.account)) {
					leave(`Recorded against account "${tx.account}", which isn't in the chart supplied.`);
					continue;
				}
				account = tx.account;
				basis = "As recorded";
			} else {
				const description = lower(tx.description);
				const hits = [...new Set(rules.filter((r) => description.includes(r.keyword)).map((r) => r.account))];
				if (hits.length === 0) {
					leave("No keyword in the chart matches its description.");
					continue;
				}
				if (hits.length > 1) {
					leave(`Its description matches more than one account (${hits.join(", ")}).`);
					continue;
				}
				account = hits[0];
				const keyword =
					rules.find((r) => r.account === account && description.includes(r.keyword))?.keyword ?? "";
				basis = `Proposed: description contains "${keyword}"`;
				proposedEntries.push({ transactionId: tx.id, account, amount: shown, reason: basis });
			}
			classified.push({ transactionId: tx.id, date: tx.date, amount: shown, account, basis });
			amounts.set(account, [...(amounts.get(account) ?? []), amount]);
		}
		const totals = [...amounts].map(([account, values]) => ({
			account,
			name: byCode.get(account)?.name ?? "",
			transactions: values.length,
			total: fixed(sum(values), dp),
		}));
		const grand = sum([...amounts.values()].flat());
		const loose = sum(unclassified.filter((u) => !u.reason.startsWith("In ")).map((u) => dec(u.amount)));
		return {
			output: {
				entity: ctx.text("entity"),
				period,
				currency,
				totals: totals.sort((a, b) => a.account.localeCompare(b.account)),
				classified,
				proposedEntries,
				unclassified,
				grandTotal: fixed(grand, dp),
				unclassifiedTotal: fixed(loose, dp),
			},
			summary: `${plural(classified.length, "transaction")} classified (${currency} ${fixed(grand, dp)}), ${unclassified.length} left unclassified, for ${period}.`,
			missing: unclassified.map((u) => `${u.transactionId}: ${u.reason}`).slice(0, 20),
			assumptions: proposedEntries.length
				? [
						"Proposed accounts come from the keywords in the chart you supplied, and are proposals until you accept them.",
					]
				: [],
			coverage: {
				"Transactions in the period": classified.length + unclassified.length,
				"Outside the period (ignored)": outside,
			},
			warnings: unclassified.length
				? [
						`${plural(unclassified.length, "transaction")} could not be classified. The workpaper's totals leave them out.`,
					]
				: [],
		};
	},
	verify: (output) => {
		const dp = places(output.currency);
		const recomputed = fixed(sum(output.totals.map((t) => dec(t.total))), dp);
		return recomputed === output.grandTotal
			? []
			: [`The account totals add up to ${recomputed}, not the stated ${output.grandTotal}.`];
	},
});

// ---- Tally ------------------------------------------------------------------------------------------

type RateRule = {
	ruleId: string;
	version: string;
	tax: string;
	category: string;
	rate: Dec;
	from: string;
	to: string | null;
};
const readRateRules = (rows: readonly Row[]): RateRule[] =>
	rows.map((r) => ({
		ruleId: r.rule_id,
		version: r.version,
		tax: upper(r.tax),
		category: lower(r.category),
		rate: num(r, "rate_percent"),
		from: r.effective_from,
		to: r.effective_to || null,
	}));
const effectiveOn = (rule: { from: string; to: string | null }, date: string) =>
	rule.from <= date && (rule.to === null || date <= rule.to);

export const tallyTaxWorkpaper = defineFunction({
	id: "tally.tax-workpaper",
	version: 1,
	agent: "tally",
	action: "Prepare tax workpaper",
	outputType: "TaxWorkpaper",
	purpose:
		"Applies the approved, effective-dated tax rules you supply to a period's reviewed lines, calculates the tax line by line, and reconciles it with the tax recorded as collected.",
	expectedResult:
		"A tax workpaper is stored with each line's tax, the rule and version used, totals per tax, the difference from tax collected, and every line no rule covers.",
	notThis:
		"No rate is ever assumed: a line with no rule in effect stays unresolved, not zero. Nothing is filed or paid. Vaping excise belongs to Duty.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "entity", label: "Entity", kind: "text", required: true, max: 120 },
		{ key: "period", label: "Period (YYYY-MM)", kind: "text", required: true, max: 7 },
		currencyField,
		{
			key: "rules",
			label: "Approved tax rules",
			kind: "table",
			required: true,
			columns: [
				{ key: "rule_id", label: "Rule id", required: true, aliases: ["rule"] },
				{ key: "version", label: "Version", required: true },
				{ key: "tax", label: "Tax", required: true },
				{ key: "category", label: "Category", required: true },
				{
					key: "rate_percent",
					label: "Rate percent",
					required: true,
					kind: "decimal",
					aliases: ["rate", "rate %"],
				},
				{ key: "effective_from", label: "Effective from", required: true, kind: "date" },
				{ key: "effective_to", label: "Effective to", kind: "date" },
			],
		},
		{
			key: "lines",
			label: "Reviewed lines",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "id", label: "Id", required: true },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "category", label: "Category", required: true },
				{
					key: "taxable_amount",
					label: "Taxable amount",
					required: true,
					kind: "decimal",
					aliases: ["amount", "taxable"],
				},
				{ key: "tax_collected", label: "Tax collected", kind: "decimal", aliases: ["collected"] },
				{ key: "currency", label: "Currency" },
			],
		},
	],
	output: z.object({
		entity: text,
		period: text,
		currency: text,
		lines: z.array(
			z.object({
				lineId: text,
				date: text,
				tax: text,
				taxable: text,
				ratePercent: text,
				calculated: text,
				rule: text,
			}),
		),
		totals: z.array(z.object({ tax: text, taxable: text, calculated: text })),
		unresolved: z.array(z.object({ lineId: text, date: text, category: text, taxable: text, reason: text })),
		reconciliation: z.object({
			calculated: text,
			collected: nullableText,
			difference: nullableText,
			linesWithCollected: count,
		}),
	}),
	sample: () => ({
		entity: "[DEMO] Worldwide Vapor",
		period: "2026-09",
		currency: "CAD",
		rules:
			"rule_id,version,tax,category,rate_percent,effective_from,effective_to\nDEMO-GST,1,GST,goods,5,2020-01-01,\nDEMO-PST,3,PST,goods,7,2019-07-01,",
		lines:
			"id,date,category,taxable_amount,tax_collected\nS1,2026-09-02,goods,100.00,12.00\nS2,2026-09-10,goods,49.99,6.00\nS3,2026-09-18,services,80.00,4.00",
	}),
	async handler(ctx) {
		const currency = currencyOf(ctx.text("currency"));
		const period = periodOf(ctx.text("period"));
		const dp = places(currency);
		const rules = readRateRules(ctx.rows("rules"));
		const lines: Array<{
			lineId: string;
			date: string;
			tax: string;
			taxable: string;
			ratePercent: string;
			calculated: string;
			rule: string;
		}> = [];
		const unresolved: Array<{
			lineId: string;
			date: string;
			category: string;
			taxable: string;
			reason: string;
		}> = [];
		const perTax = new Map<string, { taxable: Dec; calculated: Dec }>();
		let collected: Dec | null = null;
		let linesWithCollected = 0;
		let considered = 0;
		for (const line of ctx.rows("lines")) {
			if (!inPeriod(line.date, period)) continue;
			considered += 1;
			const taxable = num(line, "taxable_amount");
			const leave = (reason: string) =>
				unresolved.push({
					lineId: line.id,
					date: line.date,
					category: line.category,
					taxable: fixed(taxable, dp),
					reason,
				});
			if (otherCurrency(line, currency)) {
				leave(`In ${upper(line.currency)}, not ${currency}.`);
				continue;
			}
			const applicable = rules.filter(
				(r) => r.category === lower(line.category) && effectiveOn(r, line.date),
			);
			if (applicable.length === 0) {
				leave(`No approved rule covers category "${line.category}" on ${line.date}.`);
				continue;
			}
			const clash = [...groupBy(applicable, (r) => r.tax)].find(([, group]) => group.length > 1);
			if (clash) {
				leave(
					`More than one ${clash[0]} rule is in effect on ${line.date} (${clash[1].map((r) => `${r.ruleId} v${r.version}`).join(", ")}).`,
				);
				continue;
			}
			const paid = numOrNull(line, "tax_collected");
			if (paid) {
				collected = add(collected ?? ZERO, paid);
				linesWithCollected += 1;
			}
			for (const rule of applicable) {
				const calculated = round(div(mul(taxable, rule.rate), dec(100)), dp);
				lines.push({
					lineId: line.id,
					date: line.date,
					tax: rule.tax,
					taxable: fixed(taxable, dp),
					ratePercent: plain(rule.rate),
					calculated: fixed(calculated, dp),
					rule: `${rule.ruleId} v${rule.version}`,
				});
				const running = perTax.get(rule.tax) ?? { taxable: ZERO, calculated: ZERO };
				perTax.set(rule.tax, {
					taxable: add(running.taxable, taxable),
					calculated: add(running.calculated, calculated),
				});
			}
		}
		const calculatedTotal = sum([...perTax.values()].map((t) => t.calculated));
		return {
			output: {
				entity: ctx.text("entity"),
				period,
				currency,
				lines,
				totals: [...perTax].map(([tax, t]) => ({
					tax,
					taxable: fixed(t.taxable, dp),
					calculated: fixed(t.calculated, dp),
				})),
				unresolved,
				reconciliation: {
					calculated: fixed(calculatedTotal, dp),
					collected: collected ? fixed(collected, dp) : null,
					difference: collected ? fixed(sub(collected, calculatedTotal), dp) : null,
					linesWithCollected,
				},
			},
			summary: `${currency} ${fixed(calculatedTotal, dp)} of tax calculated on ${plural(considered - unresolved.length, "line")} for ${period}; ${unresolved.length} unresolved.`,
			missing: unresolved.map((u) => `${u.lineId}: ${u.reason}`).slice(0, 20),
			assumptions: [
				"Each line's tax is rounded to the currency's smallest unit, line by line.",
				"The rules supplied are taken to be the approved versions; their approval is not checked here.",
			],
			coverage: {
				"Lines in the period": considered,
				"Lines calculated": considered - unresolved.length,
				"Rules supplied": rules.length,
			},
			warnings: unresolved.length
				? [
						"Unresolved lines are left out of every total. The workpaper is incomplete until they are resolved.",
					]
				: [],
		};
	},
	verify: (output) => {
		const dp = places(output.currency);
		const fromLines = fixed(sum(output.lines.map((l) => dec(l.calculated))), dp);
		return fromLines === output.reconciliation.calculated
			? []
			: [`The lines add up to ${fromLines}, not the stated ${output.reconciliation.calculated}.`];
	},
});

// ---- Vault ------------------------------------------------------------------------------------------

export const vaultSettlementMatch = defineFunction({
	id: "vault.settlement-match",
	version: 1,
	agent: "vault",
	action: "Reconcile settlements",
	outputType: "SettlementReconciliation",
	purpose:
		"Matches bank deposits to processor settlements on exact net amount within a date tolerance (the reference decides between candidates) and lists everything that doesn't match.",
	expectedResult:
		"A settlement reconciliation is stored with the matched pairs and their ids, ambiguous and unmatched items on both sides, fee checks, and exact totals.",
	notThis:
		"Amounts must match exactly; nothing is matched 'approximately'. No bank access is used or changed and no money moves.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		currencyField,
		{
			key: "toleranceDays",
			label: "Days a deposit may trail its settlement",
			kind: "integer",
			help: "Default 3.",
		},
		{
			key: "bank",
			label: "Bank lines",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "id", label: "Id", required: true },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "amount", label: "Amount", required: true, kind: "decimal" },
				{ key: "reference", label: "Reference", aliases: ["ref", "description"] },
				{ key: "currency", label: "Currency" },
			],
		},
		{
			key: "settlements",
			label: "Processor settlements",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "id", label: "Id", required: true, aliases: ["settlement id", "payout id"] },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "net", label: "Net", required: true, kind: "decimal", aliases: ["net amount", "payout"] },
				{ key: "gross", label: "Gross", kind: "decimal" },
				{ key: "fees", label: "Fees", kind: "decimal", aliases: ["fee"] },
				{ key: "reference", label: "Reference", aliases: ["ref"] },
				{ key: "currency", label: "Currency" },
			],
		},
	],
	output: z.object({
		currency: text,
		toleranceDays: count,
		matched: z.array(
			z.object({ bankId: text, settlementId: text, amount: text, daysApart: z.number().int(), basis: text }),
		),
		ambiguous: z.array(z.object({ bankId: text, amount: text, candidates: texts })),
		unmatchedBank: z.array(z.object({ bankId: text, date: text, amount: text, reason: text })),
		unmatchedSettlements: z.array(z.object({ settlementId: text, date: text, net: text, reason: text })),
		feeExceptions: z.array(z.object({ settlementId: text, detail: text })),
		totals: z.object({
			bank: text,
			settlementsNet: text,
			matched: text,
			unmatchedBank: text,
			unmatchedSettlements: text,
			feesOnMatched: nullableText,
		}),
	}),
	sample: () => ({
		currency: "CAD",
		toleranceDays: "3",
		bank: "id,date,amount,reference\nB1,2026-09-03,1482.15,PAYOUT P-1001\nB2,2026-09-05,920.40,PAYOUT P-1002\nB3,2026-09-09,300.00,\nB4,2026-09-10,300.00,\nB5,2026-09-12,57.00,Refund reversal",
		settlements:
			"id,date,gross,fees,net,reference\nP-1001,2026-09-02,1530.00,47.85,1482.15,P-1001\nP-1002,2026-09-04,950.00,29.60,920.40,P-1002\nP-1003,2026-09-08,310.00,10.00,300.00,P-1003\nP-1004,2026-09-11,1200.00,37.20,1160.80,P-1004",
	}),
	async handler(ctx) {
		const currency = currencyOf(ctx.text("currency"));
		const dp = places(currency);
		const tolerance = fieldInt(ctx, "toleranceDays", 3);
		const unmatchedBank: Array<{ bankId: string; date: string; amount: string; reason: string }> = [];
		const unmatchedSettlements: Array<{ settlementId: string; date: string; net: string; reason: string }> =
			[];
		const bank = ctx.rows("bank").filter((b) => {
			if (!otherCurrency(b, currency)) return true;
			unmatchedBank.push({
				bankId: b.id,
				date: b.date,
				amount: fixed(num(b, "amount"), dp),
				reason: `In ${upper(b.currency)}, not ${currency}.`,
			});
			return false;
		});
		const settlements = ctx.rows("settlements").filter((s) => {
			if (!otherCurrency(s, currency)) return true;
			unmatchedSettlements.push({
				settlementId: s.id,
				date: s.date,
				net: fixed(num(s, "net"), dp),
				reason: `In ${upper(s.currency)}, not ${currency}.`,
			});
			return false;
		});
		const feeExceptions = settlements.flatMap((s) => {
			const gross = numOrNull(s, "gross");
			const fees = numOrNull(s, "fees");
			if (!gross || !fees) return [];
			const expected = sub(gross, fees);
			return eq(expected, num(s, "net"))
				? []
				: [
						{
							settlementId: s.id,
							detail: `Gross ${fixed(gross, dp)} less fees ${fixed(fees, dp)} is ${fixed(expected, dp)}, but the net is ${fixed(num(s, "net"), dp)}.`,
						},
					];
		});

		const taken = new Set<string>();
		const matched: Array<{
			bankId: string;
			settlementId: string;
			amount: string;
			daysApart: number;
			basis: string;
		}> = [];
		const ambiguous: Array<{ bankId: string; amount: string; candidates: string[] }> = [];
		const candidatesFor = (line: Row) =>
			settlements.filter((s) => {
				if (taken.has(s.id) || !eq(num(s, "net"), num(line, "amount"))) return false;
				const apart = daysBetween(s.date, line.date);
				return apart >= 0 && apart <= tolerance;
			});
		const pair = (line: Row, settlement: Row, basis: string) => {
			taken.add(settlement.id);
			matched.push({
				bankId: line.id,
				settlementId: settlement.id,
				amount: fixed(num(line, "amount"), dp),
				daysApart: daysBetween(settlement.date, line.date),
				basis,
			});
		};
		// First the deposits whose reference names their settlement, then the ones with a single possible settlement.
		const waiting: Row[] = [];
		for (const line of bank) {
			const named = candidatesFor(line).filter((s) => {
				const reference = lower(line.reference);
				return (
					reference !== "" &&
					(reference.includes(lower(s.id)) || (s.reference !== "" && reference.includes(lower(s.reference))))
				);
			});
			if (named.length === 1) pair(line, named[0], "Same amount, reference names the settlement");
			else waiting.push(line);
		}
		for (const line of waiting) {
			const candidates = candidatesFor(line);
			const rivals = waiting.filter(
				(other) => other !== line && candidatesFor(other).some((s) => candidates.includes(s)),
			);
			if (candidates.length === 1 && rivals.length === 0)
				pair(line, candidates[0], `Same amount, deposited within ${tolerance} days, the only candidate`);
		}
		for (const line of waiting.filter((l) => !matched.some((m) => m.bankId === l.id))) {
			const candidates = candidatesFor(line);
			const amount = fixed(num(line, "amount"), dp);
			if (candidates.length)
				ambiguous.push({ bankId: line.id, amount, candidates: candidates.map((s) => s.id) });
			else
				unmatchedBank.push({
					bankId: line.id,
					date: line.date,
					amount,
					reason: `No settlement has a net of exactly ${amount} in the ${tolerance} days before it.`,
				});
		}
		for (const s of settlements.filter((s) => !taken.has(s.id)))
			if (!ambiguous.some((a) => a.candidates.includes(s.id)))
				unmatchedSettlements.push({
					settlementId: s.id,
					date: s.date,
					net: fixed(num(s, "net"), dp),
					reason: "No bank deposit matches its net amount within the tolerance.",
				});

		const matchedFees = matched.map((m) =>
			numOrNull(settlements.find((s) => s.id === m.settlementId) as Row, "fees"),
		);
		const money = (values: Dec[]) => fixed(sum(values), dp);
		return {
			output: {
				currency,
				toleranceDays: tolerance,
				matched,
				ambiguous,
				unmatchedBank,
				unmatchedSettlements,
				feeExceptions,
				totals: {
					bank: money(bank.map((b) => num(b, "amount"))),
					settlementsNet: money(settlements.map((s) => num(s, "net"))),
					matched: money(matched.map((m) => dec(m.amount))),
					unmatchedBank: money(unmatchedBank.map((u) => dec(u.amount))),
					unmatchedSettlements: money(unmatchedSettlements.map((u) => dec(u.net))),
					feesOnMatched:
						matchedFees.every((f) => f !== null) && matchedFees.length ? money(matchedFees as Dec[]) : null,
				},
			},
			summary: `${matched.length} matched, ${ambiguous.length} ambiguous, ${unmatchedBank.length} bank and ${unmatchedSettlements.length} settlement items unmatched (${currency}).`,
			missing: matchedFees.some((f) => f === null)
				? ["Some matched settlements have no fee amount, so fees on matched items aren't totalled."]
				: [],
			assumptions: [
				`A deposit is expected on or up to ${tolerance} days after its settlement date, for exactly the settlement's net amount.`,
			],
			coverage: { "Bank lines": ctx.rows("bank").length, Settlements: ctx.rows("settlements").length },
			warnings: [
				...(ambiguous.length
					? ["Ambiguous items have more than one possible match and need a person to decide."]
					: []),
				...(feeExceptions.length ? ["A settlement's gross, fees and net don't agree."] : []),
			],
		};
	},
	verify: (output, input) => {
		const problems: string[] = [];
		const bankIds = new Set((input.bank as Row[]).map((b) => b.id));
		const settlementIds = new Set((input.settlements as Row[]).map((s) => s.id));
		for (const m of output.matched) {
			if (!bankIds.has(m.bankId)) problems.push(`Matched bank line ${m.bankId} wasn't supplied.`);
			if (!settlementIds.has(m.settlementId))
				problems.push(`Matched settlement ${m.settlementId} wasn't supplied.`);
		}
		if (new Set(output.matched.map((m) => m.settlementId)).size !== output.matched.length)
			problems.push("A settlement was matched to two deposits.");
		if (new Set(output.matched.map((m) => m.bankId)).size !== output.matched.length)
			problems.push("A deposit was matched to two settlements.");
		return problems;
	},
});

// ---- Forecast ---------------------------------------------------------------------------------------

export const forecastCashScenario = defineFunction({
	id: "forecast.cash-scenario",
	version: 1,
	agent: "forecast",
	action: "Model cash-flow scenario",
	outputType: "CashFlowScenario",
	purpose:
		"Projects the cash balance day by day from an opening position and dated receipts and payments, each marked confirmed or assumed, and shows how the low point moves if assumed receipts fall short.",
	expectedResult:
		"A cash-flow scenario is stored with a dated balance after every movement, the lowest balance and when, totals split into confirmed and assumed, and a sensitivity run.",
	notThis:
		"A forecast is an estimate from the items you supplied. It is not a bank balance and nothing in it has happened yet.",
	uses: "code",
	requires: [],
	review: "none",
	fields: [
		{ key: "scenario", label: "Scenario", kind: "text", required: true, max: 120 },
		currencyField,
		{ key: "openingDate", label: "Opening date", kind: "date", required: true },
		{
			key: "openingBalance",
			label: "Opening balance",
			kind: "decimal",
			required: true,
			help: "A confirmed balance on the opening date.",
		},
		{ key: "horizonEnd", label: "Forecast until", kind: "date", required: true },
		{
			key: "shortfallPercent",
			label: "Sensitivity: assumed receipts fall short by (%)",
			kind: "decimal",
			help: "Default 20.",
		},
		{
			key: "items",
			label: "Receipts and payments",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "description", label: "Description", required: true },
				{ key: "amount", label: "Amount", required: true, kind: "decimal", aliases: ["value"] },
				{ key: "status", label: "Status", required: true, aliases: ["basis"] },
				{ key: "currency", label: "Currency" },
			],
		},
	],
	output: z.object({
		scenario: text,
		currency: text,
		opening: z.object({ date: text, balance: text }),
		horizonEnd: text,
		timeline: z.array(z.object({ date: text, description: text, amount: text, status: text, balance: text })),
		closingBalance: text,
		lowest: z.object({ date: text, balance: text }),
		firstNegativeDate: nullableText,
		totals: z.object({ confirmedIn: text, confirmedOut: text, assumedIn: text, assumedOut: text }),
		sensitivity: z.object({
			shortfallPercent: text,
			lowestBalance: text,
			lowestDate: text,
			firstNegativeDate: nullableText,
		}),
		excluded: z.array(z.object({ description: text, date: text, reason: text })),
	}),
	sample: () => ({
		scenario: "[DEMO] October base case",
		currency: "CAD",
		openingDate: "2026-10-01",
		openingBalance: "12000",
		horizonEnd: "2026-10-31",
		shortfallPercent: "25",
		items:
			"date,description,amount,status\n2026-10-03,Supplier invoice,-6500,confirmed\n2026-10-07,Web sales week 1,4200,assumed\n2026-10-10,Payroll,-7800,confirmed\n2026-10-14,Web sales week 2,4200,assumed\n2026-10-20,Wholesale order,3000,assumed\n2026-10-24,Payroll,-7800,confirmed\n2026-11-02,Rent,-2500,confirmed",
	}),
	async handler(ctx) {
		const currency = currencyOf(ctx.text("currency"));
		const dp = places(currency);
		const openingDate = ctx.text("openingDate");
		const horizonEnd = ctx.text("horizonEnd");
		if (horizonEnd < openingDate) block("The forecast end date is before the opening date.");
		const shortfall = fieldDec(ctx, "shortfallPercent", "20");
		if (isNegative(shortfall) || gt(shortfall, dec(100)))
			block("The shortfall must be between 0 and 100 percent.");
		const excluded: Array<{ description: string; date: string; reason: string }> = [];
		const items = ctx
			.rows("items")
			.filter((item) => {
				const status = lower(item.status);
				const reason = otherCurrency(item, currency)
					? `In ${upper(item.currency)}, not ${currency}.`
					: item.date < openingDate || item.date > horizonEnd
						? "Outside the forecast dates."
						: status !== "confirmed" && status !== "assumed"
							? `Status "${item.status}" is neither confirmed nor assumed.`
							: null;
				if (reason) excluded.push({ description: item.description, date: item.date, reason });
				return !reason;
			})
			.sort((a, b) => a.date.localeCompare(b.date));

		const project = (keep: Dec) => {
			let balance = dec(ctx.text("openingBalance"));
			let lowest = { date: openingDate, balance };
			let firstNegative: string | null = isNegative(balance) ? openingDate : null;
			const timeline = items.map((item) => {
				const raw = num(item, "amount");
				const amount = lower(item.status) === "assumed" && gt(raw, ZERO) ? round(mul(raw, keep), dp) : raw;
				balance = add(balance, amount);
				if (lt(balance, lowest.balance)) lowest = { date: item.date, balance };
				if (!firstNegative && isNegative(balance)) firstNegative = item.date;
				return {
					date: item.date,
					description: item.description,
					amount: fixed(amount, dp),
					status: lower(item.status),
					balance: fixed(balance, dp),
				};
			});
			return { timeline, closing: balance, lowest, firstNegative };
		};
		const base = project(ONE);
		const stressed = project(sub(ONE, div(shortfall, dec(100))));
		const total = (status: string, inflow: boolean) =>
			fixed(
				sum(
					items
						.filter((i) => lower(i.status) === status && gt(num(i, "amount"), ZERO) === inflow)
						.map((i) => abs(num(i, "amount"))),
				),
				dp,
			);
		return {
			output: {
				scenario: ctx.text("scenario"),
				currency,
				opening: { date: openingDate, balance: fixed(dec(ctx.text("openingBalance")), dp) },
				horizonEnd,
				timeline: base.timeline,
				closingBalance: fixed(base.closing, dp),
				lowest: { date: base.lowest.date, balance: fixed(base.lowest.balance, dp) },
				firstNegativeDate: base.firstNegative,
				totals: {
					confirmedIn: total("confirmed", true),
					confirmedOut: total("confirmed", false),
					assumedIn: total("assumed", true),
					assumedOut: total("assumed", false),
				},
				sensitivity: {
					shortfallPercent: plain(shortfall),
					lowestBalance: fixed(stressed.lowest.balance, dp),
					lowestDate: stressed.lowest.date,
					firstNegativeDate: stressed.firstNegative,
				},
				excluded,
			},
			summary: `Forecast low of ${currency} ${fixed(base.lowest.balance, dp)} on ${base.lowest.date}; closes ${horizonEnd} at ${fixed(base.closing, dp)}${base.firstNegative ? `; goes negative on ${base.firstNegative}` : ""}.`,
			missing: excluded.map((e) => `"${e.description}" (${e.date}) was left out: ${e.reason}`),
			assumptions: [
				"Items marked assumed are estimates. Only confirmed items are commitments.",
				"The opening balance is taken as confirmed; it is not checked against a bank record here.",
				`The sensitivity run reduces every assumed receipt by ${plain(shortfall)}% and leaves payments unchanged.`,
			],
			coverage: { "Items in the forecast": items.length, "Items left out": excluded.length },
			warnings: base.firstNegative
				? [`On these figures the balance is below zero from ${base.firstNegative}.`]
				: [],
		};
	},
});

// ---- Duty -------------------------------------------------------------------------------------------

type Tier = {
	ruleId: string;
	version: string;
	jurisdiction: string;
	from: string;
	to: string | null;
	upTo: Dec | null;
	unit: Dec;
	rate: Dec;
	roundUp: boolean;
};

export const dutyExciseWorkpaper = defineFunction({
	id: "duty.excise-workpaper",
	version: 1,
	agent: "duty",
	action: "Reconcile excise and stamps",
	outputType: "ExciseWorkpaper",
	purpose:
		"Calculates vaping duty on a period's packaged containers from the approved, effective-dated duty tiers you supply, and reconciles the stamp ledger against stamps applied and the count on hand.",
	expectedResult:
		"An excise workpaper is stored with the duty on each packaging event and the rule version used, total liability, a stamp reconciliation, and every exception.",
	notThis:
		"No duty rate is built in: a container no supplied rule covers leaves the liability unresolved, never zero. Nothing is filed or paid, and no stamp is ordered or disposed of.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{
			key: "jurisdiction",
			label: "Jurisdiction",
			kind: "text",
			required: true,
			max: 60,
			placeholder: "Canada (federal)",
		},
		{ key: "period", label: "Period (YYYY-MM)", kind: "text", required: true, max: 7 },
		currencyField,
		{
			key: "rules",
			label: "Approved duty tiers",
			kind: "table",
			required: true,
			columns: [
				{ key: "rule_id", label: "Rule id", required: true, aliases: ["rule"] },
				{ key: "version", label: "Version", required: true },
				{ key: "jurisdiction", label: "Jurisdiction", required: true },
				{ key: "effective_from", label: "Effective from", required: true, kind: "date" },
				{ key: "effective_to", label: "Effective to", kind: "date" },
				{
					key: "tier_up_to_ml",
					label: "Tier up to (mL)",
					kind: "decimal",
					aliases: ["up to ml", "tier limit"],
				},
				{
					key: "per_ml",
					label: "Charged per (mL)",
					required: true,
					kind: "decimal",
					aliases: ["unit ml", "per"],
				},
				{ key: "rate", label: "Rate", required: true, kind: "decimal", aliases: ["rate per unit"] },
				{
					key: "round_up",
					label: "Part units round up",
					required: true,
					aliases: ["or fraction thereof", "fraction rounds up"],
				},
			],
		},
		{
			key: "events",
			label: "Production and packaging events",
			kind: "table",
			required: true,
			maxRows: 1000,
			columns: [
				{ key: "id", label: "Id", required: true },
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "type", label: "Type", required: true, aliases: ["event"] },
				{
					key: "container_ml",
					label: "Container (mL)",
					required: true,
					kind: "decimal",
					aliases: ["volume ml", "ml"],
				},
				{
					key: "units",
					label: "Units",
					required: true,
					kind: "integer",
					aliases: ["quantity", "containers"],
				},
				{ key: "jurisdiction", label: "Jurisdiction" },
			],
		},
		{
			key: "stamps",
			label: "Stamp ledger",
			kind: "table",
			columns: [
				{ key: "date", label: "Date", required: true, kind: "date" },
				{ key: "movement", label: "Movement", required: true },
				{ key: "quantity", label: "Quantity", required: true, kind: "integer" },
				{ key: "reference", label: "Reference" },
				{ key: "jurisdiction", label: "Jurisdiction" },
			],
		},
	],
	output: z.object({
		jurisdiction: text,
		period: text,
		currency: text,
		events: z.array(
			z.object({
				eventId: text,
				date: text,
				containerMl: text,
				units: count,
				dutyPerContainer: text,
				duty: text,
				rule: text,
			}),
		),
		liability: z.object({ total: text, containers: count, complete: z.boolean() }),
		unresolved: z.array(z.object({ eventId: text, date: text, reason: text })),
		notDutiable: z.array(z.object({ eventId: text, type: text })),
		stamps: z.object({
			opening: count,
			received: count,
			applied: count,
			damaged: count,
			returned: count,
			expectedOnHand: z.number().int(),
			counted: z.number().int().nullable(),
			difference: z.number().int().nullable(),
			containersPackaged: count,
			appliedVersusPackaged: z.number().int(),
		}),
		exceptions: texts,
	}),
	sample: () => ({
		jurisdiction: "[DEMO] Demoland",
		period: "2026-09",
		currency: "CAD",
		rules:
			"rule_id,version,jurisdiction,effective_from,effective_to,tier_up_to_ml,per_ml,rate,round_up\nDEMO-DUTY,2,[DEMO] Demoland,2026-01-01,,10,2,1.00,yes\nDEMO-DUTY,2,[DEMO] Demoland,2026-01-01,,,10,1.00,yes",
		events:
			"id,date,type,container_ml,units\nPK-1,2026-09-04,packaged,30,200\nPK-2,2026-09-11,packaged,60,100\nBT-9,2026-09-11,batch_mixed,5000,1\nPK-3,2025-12-30,packaged,30,50",
		stamps:
			"date,movement,quantity,reference\n2026-09-01,opening,500,Count sheet 31 Aug\n2026-09-02,received,1000,Stamp order receipt\n2026-09-04,applied,200,PK-1\n2026-09-11,applied,98,PK-2\n2026-09-11,damaged,4,Damage log\n2026-09-30,counted,1190,Count sheet 30 Sep",
	}),
	async handler(ctx) {
		const currency = currencyOf(ctx.text("currency"));
		const dp = places(currency);
		const period = periodOf(ctx.text("period"));
		const jurisdiction = ctx.text("jurisdiction");
		const here = (row: Row) => !row.jurisdiction || lower(row.jurisdiction) === lower(jurisdiction);
		const tiers: Tier[] = ctx.rows("rules").map((r) => {
			const roundUp = lower(r.round_up);
			if (!["yes", "no", "true", "false"].includes(roundUp))
				block(`Rule ${r.rule_id}: "Part units round up" must be yes or no, not "${r.round_up}".`);
			if (!gt(num(r, "per_ml"), ZERO)) block(`Rule ${r.rule_id}: "Charged per (mL)" must be more than zero.`);
			return {
				ruleId: r.rule_id,
				version: r.version,
				jurisdiction: lower(r.jurisdiction),
				from: r.effective_from,
				to: r.effective_to || null,
				upTo: numOrNull(r, "tier_up_to_ml"),
				unit: num(r, "per_ml"),
				rate: num(r, "rate"),
				roundUp: roundUp === "yes" || roundUp === "true",
			};
		});
		const dutyFor = (volume: Dec, schedule: Tier[]): Dec => {
			let floor = ZERO;
			let total = ZERO;
			for (const tier of schedule) {
				const ceiling = tier.upTo ?? volume;
				const inTier = sub(cmp(volume, ceiling) < 0 ? volume : ceiling, floor);
				if (gt(inTier, ZERO)) {
					const units = div(inTier, tier.unit);
					const whole = round(units, 0);
					const counted = tier.roundUp ? (lt(whole, units) ? add(whole, ONE) : whole) : units;
					total = add(total, mul(counted, tier.rate));
				}
				floor = maxDec(floor, ceiling);
				if (cmp(floor, volume) >= 0) break;
			}
			return total;
		};

		const events: Array<{
			eventId: string;
			date: string;
			containerMl: string;
			units: number;
			dutyPerContainer: string;
			duty: string;
			rule: string;
		}> = [];
		const unresolved: Array<{ eventId: string; date: string; reason: string }> = [];
		const notDutiable: Array<{ eventId: string; type: string }> = [];
		let containers = 0;
		for (const event of ctx.rows("events")) {
			if (!inPeriod(event.date, period) || !here(event)) continue;
			if (lower(event.type) !== "packaged") {
				notDutiable.push({ eventId: event.id, type: event.type });
				continue;
			}
			const units = Number(event.units);
			containers += units;
			const inForce = tiers.filter(
				(t) => t.jurisdiction === lower(jurisdiction) && effectiveOn(t, event.date),
			);
			const versions = [...new Set(inForce.map((t) => `${t.ruleId} v${t.version}`))];
			if (versions.length === 0) {
				unresolved.push({
					eventId: event.id,
					date: event.date,
					reason: `No approved duty rule for ${jurisdiction} is in effect on ${event.date}.`,
				});
				continue;
			}
			if (versions.length > 1) {
				unresolved.push({
					eventId: event.id,
					date: event.date,
					reason: `More than one duty rule is in effect on ${event.date} (${versions.join(", ")}).`,
				});
				continue;
			}
			const schedule = [...inForce].sort((a, b) =>
				a.upTo === null ? 1 : b.upTo === null ? -1 : cmp(a.upTo, b.upTo),
			);
			const volume = num(event, "container_ml");
			const top = schedule[schedule.length - 1];
			if (top.upTo !== null && gt(volume, top.upTo)) {
				unresolved.push({
					eventId: event.id,
					date: event.date,
					reason: `The rule's tiers stop at ${plain(top.upTo)} mL; a ${plain(volume)} mL container isn't covered.`,
				});
				continue;
			}
			const each = round(dutyFor(volume, schedule), dp);
			events.push({
				eventId: event.id,
				date: event.date,
				containerMl: plain(volume),
				units,
				dutyPerContainer: fixed(each, dp),
				duty: fixed(mul(each, dec(units)), dp),
				rule: versions[0],
			});
		}

		const ledger = ctx
			.rows("stamps")
			.filter((s) => here(s) && (inPeriod(s.date, period) || lower(s.movement) === "opening"));
		const moved = (movement: string) =>
			ledger.filter((s) => lower(s.movement) === movement).reduce((n, s) => n + Number(s.quantity), 0);
		const unknownMovements = [
			...new Set(
				ledger
					.map((s) => lower(s.movement))
					.filter((m) => !["opening", "received", "applied", "damaged", "returned", "counted"].includes(m)),
			),
		];
		const [opening, received, applied, damaged, returned] = [
			"opening",
			"received",
			"applied",
			"damaged",
			"returned",
		].map(moved);
		const counts = ledger.filter((s) => lower(s.movement) === "counted");
		const counted = counts.length ? Number(counts[counts.length - 1].quantity) : null;
		const expectedOnHand = opening + received - applied - damaged - returned;
		const exceptions = [
			...unresolved.map((u) => `${u.eventId}: ${u.reason}`),
			...(unknownMovements.length
				? [`Stamp movements not recognised and left out: ${unknownMovements.join(", ")}.`]
				: []),
			...(ledger.length && applied !== containers
				? [
						`${applied} stamps were applied but ${containers} containers were packaged (a difference of ${applied - containers}).`,
					]
				: []),
			...(counted !== null && counted !== expectedOnHand
				? [
						`The count of ${counted} stamps differs from the ${expectedOnHand} the ledger expects by ${counted - expectedOnHand}.`,
					]
				: []),
			...(damaged
				? [
						`${damaged} stamps are recorded as damaged. Recording damage here is not authorization to dispose of them.`,
					]
				: []),
		];
		const total = sum(events.map((e) => dec(e.duty)));
		return {
			output: {
				jurisdiction,
				period,
				currency,
				events,
				liability: { total: fixed(total, dp), containers, complete: unresolved.length === 0 },
				unresolved,
				notDutiable,
				stamps: {
					opening,
					received,
					applied,
					damaged,
					returned,
					expectedOnHand,
					counted,
					difference: counted === null ? null : counted - expectedOnHand,
					containersPackaged: containers,
					appliedVersusPackaged: applied - containers,
				},
				exceptions,
			},
			summary: `${currency} ${fixed(total, dp)} duty on ${plural(containers, "container")} for ${period}${unresolved.length ? ` (incomplete: ${unresolved.length} unresolved)` : ""}; ${plural(exceptions.length, "exception")}.`,
			missing: [
				...(ctx.rows("stamps").length === 0
					? ["No stamp ledger was supplied, so stamps were not reconciled."]
					: []),
				...(ledger.length && counted === null
					? ["No stamp count was supplied for the period, so the ledger wasn't compared with stock on hand."]
					: []),
			],
			assumptions: [
				'Only events of type "packaged" are treated as dutiable here.',
				"Each packaged container is expected to carry one stamp.",
				"The duty tiers supplied are taken to be the approved versions.",
			],
			coverage: {
				"Packaging events calculated": events.length,
				"Events unresolved": unresolved.length,
				"Stamp movements read": ledger.length,
			},
			warnings: unresolved.length
				? ["The liability is incomplete: unresolved events are not included in the total."]
				: [],
		};
	},
	verify: (output) => {
		const dp = places(output.currency);
		const fromEvents = fixed(sum(output.events.map((e) => dec(e.duty))), dp);
		return fromEvents === output.liability.total
			? []
			: [`The events add up to ${fromEvents}, not the stated ${output.liability.total}.`];
	},
});

// ---- Source -----------------------------------------------------------------------------------------

const quote = z.object({
	supplier: text,
	quoteRef: text,
	orderQuantity: text,
	extraUnits: text,
	goods: text,
	shipping: nullableText,
	duty: nullableText,
	landedTotal: nullableText,
	landedPerUnit: nullableText,
	leadTimeDays: z.number().int().nullable(),
	qualified: text,
	notes: texts,
});

export const sourceQuoteComparison = defineFunction({
	id: "source.quote-comparison",
	version: 1,
	agent: "source",
	action: "Compare purchasing quotes",
	outputType: "QuoteComparison",
	purpose:
		"Compares supplier quotes on exact landed cost for the quantity you need (unit price, minimum order, shipping, duty and exchange rate, each from the quote) and ranks the complete ones.",
	expectedResult:
		"A quote comparison is stored with each quote's landed total and per-unit cost in one currency, lead times, what each quote is missing, a ranking, and a draft purchase order for review.",
	notThis:
		"A quote with a missing cost is shown as incomplete, not ranked on a guess. Supplier quality is Qualify's call. No order is submitted.",
	uses: "code",
	requires: [],
	review: "required",
	fields: [
		{ key: "item", label: "Item", kind: "text", required: true, max: 120 },
		{ key: "quantity", label: "Quantity needed", kind: "decimal", required: true },
		{ key: "currency", label: "Compare in", kind: "text", required: true, max: 3, placeholder: "CAD" },
		{
			key: "quotes",
			label: "Quotes",
			kind: "table",
			required: true,
			maxRows: 50,
			columns: [
				{ key: "supplier", label: "Supplier", required: true, aliases: ["vendor"] },
				{ key: "unit_price", label: "Unit price", required: true, kind: "decimal", aliases: ["price"] },
				{ key: "currency", label: "Currency", required: true },
				{ key: "moq", label: "Minimum order", kind: "decimal", aliases: ["minimum order quantity"] },
				{ key: "shipping", label: "Shipping", kind: "decimal", aliases: ["freight"] },
				{ key: "duty_percent", label: "Duty percent", kind: "decimal", aliases: ["duty", "duty %"] },
				{ key: "fx_rate", label: "Exchange rate", kind: "decimal", aliases: ["fx", "rate"] },
				{ key: "lead_time_days", label: "Lead time (days)", kind: "integer", aliases: ["lead time"] },
				{ key: "qualified", label: "Qualified", aliases: ["approved supplier"] },
				{ key: "quote_ref", label: "Quote reference", aliases: ["reference", "quote"] },
			],
		},
	],
	output: z.object({
		item: text,
		quantity: text,
		currency: text,
		quotes: z.array(quote),
		ranking: z.array(z.object({ rank: count, supplier: text, landedTotal: text, landedPerUnit: text })),
		purchaseOrderDraft: z
			.object({
				status: text,
				supplier: text,
				item: text,
				quantity: text,
				unitPrice: text,
				quoteCurrency: text,
				landedTotal: text,
				quoteRef: text,
			})
			.nullable(),
	}),
	sample: () => ({
		item: "[DEMO] 30 mL bottles",
		quantity: "5000",
		currency: "CAD",
		quotes:
			"supplier,unit_price,currency,moq,shipping,duty_percent,fx_rate,lead_time_days,qualified,quote_ref\nDemo Glass Co,0.42,CAD,1000,180,0,,14,yes,Q-881\nDemo Import Ltd,0.25,USD,10000,650,6.5,1.37,35,yes,Q-17\nDemo Bargain Inc,0.19,USD,5000,,6.5,1.37,50,unknown,Q-300",
	}),
	async handler(ctx) {
		const currency = currencyOf(ctx.text("currency"));
		const dp = places(currency);
		const needed = dec(ctx.text("quantity"));
		if (!gt(needed, ZERO)) block("The quantity needed must be more than zero.");
		const rows = ctx.rows("quotes");
		const quotes = rows.map((q) => {
			const notes: string[] = [];
			const moq = numOrNull(q, "moq");
			const orderQuantity = moq && gt(moq, needed) ? moq : needed;
			if (moq && gt(moq, needed))
				notes.push(`Minimum order of ${plain(moq)} is more than the ${plain(needed)} needed.`);
			const quoteCurrency = currencyOf(q.currency);
			const fx = quoteCurrency === currency ? ONE : numOrNull(q, "fx_rate");
			const goods = mul(num(q, "unit_price"), orderQuantity);
			const shipping = numOrNull(q, "shipping");
			const dutyPercent = numOrNull(q, "duty_percent");
			if (!fx)
				notes.push(
					`No exchange rate from ${quoteCurrency} to ${currency} was given, so it can't be compared.`,
				);
			if (!shipping) notes.push("No shipping cost was given.");
			if (!dutyPercent) notes.push("No duty rate was given.");
			const qualified = lower(q.qualified) === "yes" ? "yes" : lower(q.qualified) === "no" ? "no" : "unknown";
			if (qualified !== "yes")
				notes.push(
					qualified === "no"
						? "The supplier is not qualified for this material."
						: "Supplier qualification is not confirmed (Qualify).",
				);
			const duty = dutyPercent ? div(mul(goods, dutyPercent), dec(100)) : null;
			const complete = fx && shipping && duty;
			const landed = complete ? round(mul(add(add(goods, shipping), duty), fx), dp) : null;
			return {
				supplier: q.supplier,
				quoteRef: q.quote_ref ?? "",
				orderQuantity: plain(orderQuantity),
				extraUnits: plain(sub(orderQuantity, needed)),
				goods: `${fixed(goods, places(quoteCurrency))} ${quoteCurrency}`,
				shipping: shipping ? `${fixed(shipping, places(quoteCurrency))} ${quoteCurrency}` : null,
				duty: duty ? `${fixed(duty, places(quoteCurrency))} ${quoteCurrency}` : null,
				landedTotal: landed ? fixed(landed, dp) : null,
				landedPerUnit: landed ? fixed(div(landed, orderQuantity), 4) : null,
				leadTimeDays: q.lead_time_days ? Number(q.lead_time_days) : null,
				qualified,
				notes,
			};
		});
		const complete = quotes.filter(
			(q): q is typeof q & { landedTotal: string; landedPerUnit: string } => q.landedTotal !== null,
		);
		const ranking = [...complete]
			.sort((a, b) => cmp(dec(a.landedTotal), dec(b.landedTotal)))
			.map((q, index) => ({
				rank: index + 1,
				supplier: q.supplier,
				landedTotal: q.landedTotal,
				landedPerUnit: q.landedPerUnit,
			}));
		const best = ranking
			.map((r) => complete.find((q) => q.supplier === r.supplier))
			.find((q) => q?.qualified === "yes");
		const bestRow = best ? rows.find((r) => r.supplier === best.supplier) : undefined;
		return {
			output: {
				item: ctx.text("item"),
				quantity: plain(needed),
				currency,
				quotes,
				ranking,
				purchaseOrderDraft:
					best && bestRow
						? {
								status: "DRAFT, not submitted",
								supplier: best.supplier,
								item: ctx.text("item"),
								quantity: best.orderQuantity,
								unitPrice: bestRow.unit_price,
								quoteCurrency: upper(bestRow.currency),
								landedTotal: `${best.landedTotal} ${currency}`,
								quoteRef: best.quoteRef,
							}
						: null,
			},
			summary: ranking.length
				? `${ranking[0].supplier} has the lowest landed cost: ${currency} ${ranking[0].landedTotal} for ${ctx.text("item")}. ${quotes.length - ranking.length} of ${plural(quotes.length, "quote")} incomplete.`
				: `None of the ${plural(quotes.length, "quote")} is complete enough to compare.`,
			missing: quotes
				.filter((q) => q.landedTotal === null)
				.map((q) => `${q.supplier}: ${q.notes.filter((n) => n.startsWith("No ")).join(" ")}`),
			assumptions: [
				"Duty is charged on the goods value only.",
				"Exchange rates are the ones on the quotes; none is looked up.",
				"Landed cost leaves out anything not on the quote (storage, payment fees, tax).",
			],
			coverage: { "Quotes compared": ranking.length, "Quotes supplied": quotes.length },
			warnings: best
				? []
				: ["No complete quote is from a qualified supplier, so no purchase order was drafted."],
		};
	},
});

export const FINANCE_FUNCTIONS = [
	ledgerPeriodWorkpaper,
	tallyTaxWorkpaper,
	vaultSettlementMatch,
	forecastCashScenario,
	dutyExciseWorkpaper,
	sourceQuoteComparison,
];
