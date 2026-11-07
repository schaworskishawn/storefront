import { audit } from "../audit";
import { iso, type Row, type Sql } from "../db/sql";
import { actorKey, type OperatorActor } from "../types";
import {
	ComplianceError,
	addDays,
	day,
	optionalDay,
	optionalWhole,
	ownerOnly,
	pick,
	sourceAddress,
	tidy,
} from "./common";

/**
 * The rule register: the requirements the business tracks, each read from a named source by a person.
 *
 * A rule is recorded in versions. A version says what kind of source it comes from (a law, official guidance, the business's
 * own policy, or an interpretation nobody has settled), when the source was read and published, when it takes effect, what
 * it asks of the business in a person's own words, and whether it applies here and why. A draft guides nothing. Only the
 * owner approves a version, and an approved version has to say whether it applies, why, from when, and when it is next
 * looked at. Approving a new version supersedes the one before it, which is kept.
 *
 * Nothing here decides what the law requires or that the business complies with it. The register holds what people read
 * and decided, so that work relying on a rule can name the version it relied on.
 */

export { ComplianceError };

export const RULE_KINDS = {
	law: "Law or regulation",
	guidance: "Official guidance",
	internal_policy: "Our own policy",
	unresolved_interpretation: "An interpretation nobody has settled",
} as const;
export type RuleKind = keyof typeof RULE_KINDS;

export const APPLICABILITY = {
	applies: "Applies here",
	does_not_apply: "Does not apply here",
	undecided: "Not decided",
} as const;
export type Applicability = keyof typeof APPLICABILITY;

export type Rule = {
	id: string;
	code: string;
	title: string;
	jurisdiction: string;
	ownerLabel: string;
	status: "active" | "withdrawn";
	withdrawnReason: string | null;
	createdBy: string;
	createdAt: string;
};

export type RuleVersion = {
	id: string;
	ruleId: string;
	version: number;
	kind: RuleKind;
	sourceTitle: string;
	sourceUrl: string | null;
	retrievedOn: string | null;
	publishedOn: string | null;
	effectiveFrom: string | null;
	effectiveTo: string | null;
	summary: string;
	applicability: Applicability;
	applicabilityReason: string | null;
	reviewEveryDays: number | null;
	nextReviewOn: string | null;
	status: "draft" | "approved" | "superseded" | "rejected";
	draftedBy: string;
	draftedAt: string;
	reviewedBy: string | null;
	reviewedAt: string | null;
	reviewNote: string | null;
};

/** Where a rule stands today, from its records alone. */
export type RuleStanding =
	| "approved"
	| "review_due"
	| "not_in_effect"
	| "awaiting_review"
	| "not_approved"
	| "withdrawn";

export const STANDING_LABELS: Record<RuleStanding, string> = {
	approved: "Approved",
	review_due: "Approved, review due",
	not_in_effect: "Approved, not in effect today",
	awaiting_review: "Draft waiting for the owner",
	not_approved: "No approved version",
	withdrawn: "Withdrawn",
};

export type RuleSummary = Rule & {
	/** The approved version, if there is one. */
	current: RuleVersion | null;
	/** The newest draft waiting for a decision, if there is one. */
	draft: RuleVersion | null;
	standing: RuleStanding;
};

const RULE_COLUMNS = `id, code, title, jurisdiction, owner_label, status, withdrawn_reason, created_by, created_at`;
const VERSION_COLUMNS = `id, rule_id, version, kind, source_title, source_url, retrieved_on, published_on, effective_from,
	effective_to, summary, applicability, applicability_reason, review_every_days, next_review_on, status, drafted_by,
	drafted_at, reviewed_by, reviewed_at, review_note`;

const toRule = (r: Row): Rule => ({
	id: r.id as string,
	code: r.code as string,
	title: r.title as string,
	jurisdiction: r.jurisdiction as string,
	ownerLabel: r.owner_label as string,
	status: r.status as Rule["status"],
	withdrawnReason: (r.withdrawn_reason as string | null) ?? null,
	createdBy: r.created_by as string,
	createdAt: iso(r.created_at) as string,
});

const toVersion = (r: Row): RuleVersion => ({
	id: r.id as string,
	ruleId: r.rule_id as string,
	version: Number(r.version),
	kind: r.kind as RuleKind,
	sourceTitle: r.source_title as string,
	sourceUrl: (r.source_url as string | null) ?? null,
	retrievedOn: day(r.retrieved_on),
	publishedOn: day(r.published_on),
	effectiveFrom: day(r.effective_from),
	effectiveTo: day(r.effective_to),
	summary: r.summary as string,
	applicability: r.applicability as Applicability,
	applicabilityReason: (r.applicability_reason as string | null) ?? null,
	reviewEveryDays: r.review_every_days === null ? null : Number(r.review_every_days),
	nextReviewOn: day(r.next_review_on),
	status: r.status as RuleVersion["status"],
	draftedBy: r.drafted_by as string,
	draftedAt: iso(r.drafted_at) as string,
	reviewedBy: (r.reviewed_by as string | null) ?? null,
	reviewedAt: iso(r.reviewed_at),
	reviewNote: (r.review_note as string | null) ?? null,
});

/** Pure: the same records give the same answer. */
export function ruleStanding(
	rule: Rule,
	current: RuleVersion | null,
	draft: RuleVersion | null,
	today: string,
): RuleStanding {
	if (rule.status === "withdrawn") return "withdrawn";
	if (current) {
		if (
			(current.effectiveFrom && current.effectiveFrom > today) ||
			(current.effectiveTo && current.effectiveTo < today)
		)
			return "not_in_effect";
		if (current.nextReviewOn && current.nextReviewOn <= today) return "review_due";
		return "approved";
	}
	return draft ? "awaiting_review" : "not_approved";
}

export type VersionInput = {
	kind: string;
	sourceTitle: string;
	sourceUrl?: string;
	retrievedOn?: string;
	publishedOn?: string;
	effectiveFrom?: string;
	effectiveTo?: string;
	summary: string;
	applicability?: string;
	applicabilityReason?: string;
	reviewEveryDays?: string;
};

type CleanVersion = {
	kind: RuleKind;
	sourceTitle: string;
	sourceUrl: string | null;
	retrievedOn: string | null;
	publishedOn: string | null;
	effectiveFrom: string | null;
	effectiveTo: string | null;
	summary: string;
	applicability: Applicability;
	applicabilityReason: string | null;
	reviewEveryDays: number | null;
};

function cleanVersion(input: VersionInput): CleanVersion {
	const kind = pick(RULE_KINDS, input.kind);
	if (!kind)
		throw new ComplianceError(
			"invalid",
			"Say what kind of source this is: a law, official guidance, our own policy, or an interpretation nobody has settled.",
		);
	const sourceTitle = tidy(input.sourceTitle, 300);
	if (!sourceTitle) throw new ComplianceError("invalid", "Name the source it was read from.");
	const summary = tidy(input.summary, 4000);
	if (!summary) throw new ComplianceError("invalid", "Say, in your own words, what it asks of the business.");
	const effectiveFrom = optionalDay("The date it takes effect", input.effectiveFrom);
	const effectiveTo = optionalDay("The date it stops applying", input.effectiveTo);
	if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)
		throw new ComplianceError("invalid", "It can't stop applying before it takes effect.");
	return {
		kind,
		sourceTitle,
		sourceUrl: sourceAddress(input.sourceUrl),
		retrievedOn: optionalDay("The date it was read", input.retrievedOn),
		publishedOn: optionalDay("The date it was published", input.publishedOn),
		effectiveFrom,
		effectiveTo,
		summary,
		applicability: pick(APPLICABILITY, input.applicability) ?? "undecided",
		applicabilityReason: tidy(input.applicabilityReason, 2000) || null,
		reviewEveryDays: optionalWhole("How often it is looked at again", input.reviewEveryDays, {
			min: 1,
			max: 1825,
		}),
	};
}

async function insertVersion(
	tx: Sql,
	actor: OperatorActor,
	ruleId: string,
	version: number,
	v: CleanVersion,
) {
	const { rows } = await tx.query(
		`insert into wai_compliance_rule_versions (rule_id, version, kind, source_title, source_url, retrieved_on, published_on,
			effective_from, effective_to, summary, applicability, applicability_reason, review_every_days, drafted_by)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning ${VERSION_COLUMNS}`,
		[
			ruleId,
			version,
			v.kind,
			v.sourceTitle,
			v.sourceUrl,
			v.retrievedOn,
			v.publishedOn,
			v.effectiveFrom,
			v.effectiveTo,
			v.summary,
			v.applicability,
			v.applicabilityReason,
			v.reviewEveryDays,
			actorKey(actor),
		],
	);
	return toVersion(rows[0]);
}

export type NewRule = VersionInput & {
	code: string;
	title: string;
	jurisdiction: string;
	ownerLabel: string;
};

/** Anyone in the workspace can record a rule. It starts as a draft and guides nothing until the owner approves it. */
export async function createRule(
	sql: Sql,
	actor: OperatorActor,
	input: NewRule,
): Promise<{ rule: Rule; version: RuleVersion }> {
	const code = tidy(input.code, 48).toUpperCase().replace(/\s+/g, "-");
	if (!/^[A-Z0-9][A-Z0-9-]{1,47}$/.test(code))
		throw new ComplianceError(
			"invalid",
			"Give the rule a short code of letters, digits and dashes, like CRA-VAPING-RETURNS.",
		);
	const title = tidy(input.title, 300);
	if (!title) throw new ComplianceError("invalid", "Give the rule a title.");
	const jurisdiction = tidy(input.jurisdiction, 120);
	if (!jurisdiction)
		throw new ComplianceError("invalid", "Say whose rule it is, like Canada (federal) or Manitoba.");
	const ownerLabel = tidy(input.ownerLabel, 120);
	if (!ownerLabel) throw new ComplianceError("invalid", "Say who looks after this rule.");
	const v = cleanVersion(input);
	const made = await sql.transaction(async (tx) => {
		const taken = await tx.query(`select 1 from wai_compliance_rules where code = $1`, [code]);
		if (taken.rows.length)
			throw new ComplianceError("conflict", `A rule with the code ${code} is already recorded.`);
		const { rows } = await tx.query(
			`insert into wai_compliance_rules (code, title, jurisdiction, owner_label, created_by)
			 values ($1,$2,$3,$4,$5) returning ${RULE_COLUMNS}`,
			[code, title, jurisdiction, ownerLabel, actorKey(actor)],
		);
		const rule = toRule(rows[0]);
		return { rule, version: await insertVersion(tx, actor, rule.id, 1, v) };
	});
	await audit(sql, {
		actor,
		action: "compliance.rule.create",
		subject: made.rule.id,
		outcome: "allowed",
		detail: { code, kind: v.kind, source: v.sourceTitle },
	});
	return made;
}

async function ruleById(sql: Sql, id: string, lock = false): Promise<Rule> {
	const { rows } = await sql.query(
		`select ${RULE_COLUMNS} from wai_compliance_rules where id = $1 ${lock ? "for update" : ""}`,
		[tidy(id, 60)],
	);
	if (!rows[0]) throw new ComplianceError("not_found", "That rule doesn't exist.");
	return toRule(rows[0]);
}

/** A new reading of a rule, as a draft. The approved version, if any, goes on guiding until the owner approves this one. */
export async function draftRuleVersion(
	sql: Sql,
	actor: OperatorActor,
	input: VersionInput & { ruleId: string },
): Promise<RuleVersion> {
	const v = cleanVersion(input);
	const version = await sql.transaction(async (tx) => {
		const rule = await ruleById(tx, input.ruleId, true);
		if (rule.status === "withdrawn")
			throw new ComplianceError("conflict", "That rule was withdrawn. Record a new rule instead.");
		const { rows } = await tx.query<{ n: number }>(
			`select coalesce(max(version), 0) + 1 as n from wai_compliance_rule_versions where rule_id = $1`,
			[rule.id],
		);
		return insertVersion(tx, actor, rule.id, Number(rows[0].n), v);
	});
	await audit(sql, {
		actor,
		action: "compliance.rule.draft",
		subject: version.ruleId,
		outcome: "allowed",
		detail: { version: version.version, kind: v.kind },
	});
	return version;
}

export type RuleReview = {
	versionId: string;
	decision: "approve" | "reject";
	note: string;
	/** The owner's decision on whether it applies, when it differs from the draft's. */
	applicability?: string;
	applicabilityReason?: string;
	/** When it is next looked at. Without one, it is worked out from how often the draft says to look at it again. */
	nextReviewOn?: string;
};

/**
 * The owner approves or rejects a draft. Approving needs a decision on whether the rule applies, a reason, the date it takes
 * effect, and when it is next looked at; the version approved before it is superseded in the same step.
 */
export async function reviewRuleVersion(
	sql: Sql,
	actor: OperatorActor,
	input: RuleReview,
	today: string,
): Promise<RuleVersion> {
	await ownerOnly(
		sql,
		actor,
		`compliance.rule.${input.decision === "approve" ? "approve" : "reject"}`,
		tidy(input.versionId, 60),
		"Only the owner can approve or reject a version of a rule.",
	);
	if (input.decision !== "approve" && input.decision !== "reject")
		throw new ComplianceError("invalid", "Approve or reject it.");
	const note = tidy(input.note, 2000);
	if (!note) throw new ComplianceError("invalid", "Say on what basis.");
	const reviewed = await sql.transaction(async (tx) => {
		const { rows } = await tx.query(
			`select ${VERSION_COLUMNS} from wai_compliance_rule_versions where id = $1 for update`,
			[tidy(input.versionId, 60)],
		);
		if (!rows[0]) throw new ComplianceError("not_found", "That version doesn't exist.");
		const version = toVersion(rows[0]);
		if (version.status !== "draft")
			throw new ComplianceError(
				"conflict",
				`That version is already ${version.status}. Only a draft can be decided.`,
			);
		const rule = await ruleById(tx, version.ruleId, true);
		if (rule.status === "withdrawn")
			throw new ComplianceError("conflict", "That rule was withdrawn. Its drafts can't be approved.");
		if (input.decision === "reject") {
			const done = await tx.query(
				`update wai_compliance_rule_versions set status = 'rejected', reviewed_by = $2, reviewed_at = now(), review_note = $3
				 where id = $1 returning ${VERSION_COLUMNS}`,
				[version.id, actorKey(actor), note],
			);
			return toVersion(done.rows[0]);
		}
		const applicability = pick(APPLICABILITY, input.applicability) ?? version.applicability;
		if (applicability === "undecided")
			throw new ComplianceError(
				"invalid",
				"Decide whether it applies here before approving it. An undecided reading can't guide anything.",
			);
		const reason = tidy(input.applicabilityReason, 2000) || version.applicabilityReason;
		if (!reason) throw new ComplianceError("invalid", "Say why it applies here, or why it doesn't.");
		if (!version.effectiveFrom)
			throw new ComplianceError(
				"invalid",
				"The draft doesn't say when it takes effect. Record a new draft with that date before approving it.",
			);
		const nextReviewOn =
			optionalDay("The next review", input.nextReviewOn) ??
			(version.reviewEveryDays ? addDays(today, version.reviewEveryDays) : null);
		if (!nextReviewOn)
			throw new ComplianceError("invalid", "Say when it is next looked at, or how often in the draft.");
		if (nextReviewOn <= today) throw new ComplianceError("invalid", "The next review has to be after today.");
		await tx.query(
			`update wai_compliance_rule_versions set status = 'superseded' where rule_id = $1 and status = 'approved'`,
			[rule.id],
		);
		const done = await tx.query(
			`update wai_compliance_rule_versions set status = 'approved', applicability = $2, applicability_reason = $3,
				next_review_on = $4, reviewed_by = $5, reviewed_at = now(), review_note = $6
			 where id = $1 returning ${VERSION_COLUMNS}`,
			[version.id, applicability, reason, nextReviewOn, actorKey(actor), note],
		);
		return toVersion(done.rows[0]);
	});
	await audit(sql, {
		actor,
		action: `compliance.rule.${reviewed.status === "approved" ? "approve" : "reject"}`,
		subject: reviewed.ruleId,
		outcome: "allowed",
		detail: { version: reviewed.version, applicability: reviewed.applicability, note },
	});
	return reviewed;
}

/** The owner stops tracking a rule. Its versions are kept; none of them guides anything afterwards. */
export async function withdrawRule(
	sql: Sql,
	actor: OperatorActor,
	input: { ruleId: string; reason: string },
): Promise<Rule> {
	await ownerOnly(
		sql,
		actor,
		"compliance.rule.withdraw",
		tidy(input.ruleId, 60),
		"Only the owner can withdraw a rule.",
	);
	const reason = tidy(input.reason, 1000);
	if (!reason) throw new ComplianceError("invalid", "Say why it is being withdrawn.");
	const { rows } = await sql.query(
		`update wai_compliance_rules set status = 'withdrawn', withdrawn_reason = $2 where id = $1 and status = 'active'
		 returning ${RULE_COLUMNS}`,
		[tidy(input.ruleId, 60), reason],
	);
	if (!rows[0]) {
		await ruleById(sql, input.ruleId);
		throw new ComplianceError("conflict", "That rule was already withdrawn.");
	}
	const rule = toRule(rows[0]);
	await audit(sql, {
		actor,
		action: "compliance.rule.withdraw",
		subject: rule.id,
		outcome: "allowed",
		detail: { reason },
	});
	return rule;
}

export async function getRule(sql: Sql, id: string): Promise<{ rule: Rule; versions: RuleVersion[] } | null> {
	const found = await sql.query(`select ${RULE_COLUMNS} from wai_compliance_rules where id = $1`, [
		tidy(id, 60),
	]);
	if (!found.rows[0]) return null;
	const { rows } = await sql.query(
		`select ${VERSION_COLUMNS} from wai_compliance_rule_versions where rule_id = $1 order by version desc`,
		[found.rows[0].id],
	);
	return { rule: toRule(found.rows[0]), versions: rows.map(toVersion) };
}

export async function listRules(sql: Sql, today: string): Promise<RuleSummary[]> {
	const rules = await sql.query(`select ${RULE_COLUMNS} from wai_compliance_rules order by code limit 500`);
	const versions = await sql.query(
		`select ${VERSION_COLUMNS} from wai_compliance_rule_versions where status in ('approved', 'draft')
		 order by version desc limit 2000`,
	);
	const all = versions.rows.map(toVersion);
	return rules.rows.map(toRule).map((rule) => {
		const current = all.find((v) => v.ruleId === rule.id && v.status === "approved") ?? null;
		const draft = all.find((v) => v.ruleId === rule.id && v.status === "draft") ?? null;
		return { ...rule, current, draft, standing: ruleStanding(rule, current, draft, today) };
	});
}

/**
 * The approved readings that apply here on a day: what work relying on the register may use. A rule that is withdrawn,
 * undecided, not approved, or not in effect on that day is not among them, and nothing stands in for it.
 */
export async function applicableRules(
	sql: Sql,
	on: string,
): Promise<Array<{ rule: Rule; version: RuleVersion }>> {
	const { rows } = await sql.query(
		`select ${VERSION_COLUMNS.split(",")
			.map((c) => `v.${c.trim()}`)
			.join(", ")}, r.code as rule_code
		 from wai_compliance_rule_versions v join wai_compliance_rules r on r.id = v.rule_id
		 where r.status = 'active' and v.status = 'approved' and v.applicability = 'applies'
			and v.effective_from <= $1::date and (v.effective_to is null or v.effective_to >= $1::date)
		 order by r.code`,
		[on],
	);
	const rules = new Map((await listRules(sql, on)).map((summary) => [summary.id, summary]));
	return rows.map((r) => {
		const version = toVersion(r);
		const rule = rules.get(version.ruleId) as Rule;
		return { rule, version };
	});
}

/**
 * The official sources the workspace's brief names as starting points. They go into the register as drafts that say they
 * haven't been read: someone has to read the current version, write down what it asks, and the owner has to decide whether
 * it applies here. Nothing is approved by adding them, and the list is not every rule that may apply.
 */
export const STARTING_SOURCES: ReadonlyArray<{
	code: string;
	title: string;
	ownerLabel: string;
	kind: RuleKind;
	sourceTitle: string;
	sourceUrl: string;
}> = [
	{
		code: "HC-NICOTINE-CONCENTRATION",
		title: "Nicotine concentration in vaping products",
		ownerLabel: "Comply",
		kind: "guidance",
		sourceTitle: "Health Canada, Guidance for regulated parties on nicotine concentration in vaping products",
		sourceUrl:
			"https://www.canada.ca/en/health-canada/services/smoking-tobacco/vaping/product-safety-regulation/guidance-regulated-parties-nicotine-concentration-vaping-products.html",
	},
	{
		code: "CRA-VAPING-DUTY-RETURNS",
		title: "Reporting and remitting the excise duty on vaping products",
		ownerLabel: "Duty",
		kind: "guidance",
		sourceTitle: "Canada Revenue Agency, Reporting and remitting the excise duty on vaping products",
		sourceUrl:
			"https://www.canada.ca/en/services/taxes/excise-taxes-duties-and-levies/excise-duty-vaping-products/reporting-remitting-vaping-duty.html",
	},
	{
		code: "CRA-EDN80-STAMPS",
		title: "Vaping excise stamps",
		ownerLabel: "Duty",
		kind: "guidance",
		sourceTitle: "Canada Revenue Agency, EDN80 Overview of vaping excise stamps",
		sourceUrl:
			"https://www.canada.ca/en/revenue-agency/services/tax/technical-information/excise-duty/excise-duty-notices/edn80-overview-vaping-excise-stamps.html",
	},
	{
		code: "SOR-2023-123-REPORTING",
		title: "Vaping Products Reporting Regulations",
		ownerLabel: "Comply",
		kind: "law",
		sourceTitle: "Justice Canada, Vaping Products Reporting Regulations (SOR/2023-123)",
		sourceUrl: "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2023-123/page-1.html",
	},
	{
		code: "HC-VAPING-REGULATIONS",
		title: "Vaping products regulations (overview)",
		ownerLabel: "Comply",
		kind: "guidance",
		sourceTitle: "Health Canada, Vaping products regulations",
		sourceUrl:
			"https://www.canada.ca/en/health-canada/services/smoking-tobacco/vaping/product-safety-regulation.html",
	},
];

const NOT_YET_READ =
	"Not read yet. Listed in the workspace's brief as a starting point, consulted on 2026-10-08. Read the current version of the source, then record a new draft saying in your own words what it asks of the business.";

/** The owner adds the starting sources to the register as unread drafts. A source already in the register is left alone. */
export async function queueStartingSources(sql: Sql, actor: OperatorActor): Promise<number> {
	await ownerOnly(
		sql,
		actor,
		"compliance.rule.queue_sources",
		"starting-sources",
		"Only the owner can add the starting sources to the register.",
	);
	let added = 0;
	for (const source of STARTING_SOURCES) {
		const taken = await sql.query(`select 1 from wai_compliance_rules where code = $1`, [source.code]);
		if (taken.rows.length) continue;
		await createRule(sql, actor, {
			code: source.code,
			title: source.title,
			jurisdiction: "Canada (federal)",
			ownerLabel: source.ownerLabel,
			kind: source.kind,
			sourceTitle: source.sourceTitle,
			sourceUrl: source.sourceUrl,
			summary: NOT_YET_READ,
		});
		added++;
	}
	return added;
}
