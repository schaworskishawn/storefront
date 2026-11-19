import Anthropic from "@anthropic-ai/sdk";
import type { Result } from "./engine";
import type { AiApplicationReview, AiFlag } from "./records";
import type { AffiliateSignals } from "./signals";

/**
 * The affiliate program's AI reviewer (Claude, through the Anthropic API). It advises; it never moves money, approves,
 * rejects or pauses anyone by itself. Two jobs:
 *
 * - **Applications:** reads what an applicant wrote about their platform, audience and plans (never their name, email or
 *   phone) and suggests approve, review or reject with reasons, shown to the owner on /affiliate-admin.
 * - **Weekly review:** reads each affiliate's order signals (counts and shares only, see signals.ts) and flags patterns
 *   that look like fraud or abuse. The daily job emails the owner the summary, and a high-severity flag holds that
 *   affiliate's automatic payouts until the owner looks (their orders are still credited).
 *
 * Needs ANTHROPIC_API_KEY; without it both jobs are skipped. Requests use structured output so the answer is JSON, check
 * the stop reason before reading it, and opt into Anthropic's server-side fallback model if Claude declines.
 */

export const AI_MODEL = "claude-opus-5-5";

export const isAiConfigured = (env: Record<string, string | undefined> = process.env): boolean =>
	Boolean(env.ANTHROPIC_API_KEY?.trim());

export type CreateMessage = (
	params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.Messages.BetaMessage>;

export function defaultCreateMessage(): CreateMessage {
	const client = new Anthropic();
	return (params) => client.beta.messages.create(params);
}

async function askJson(
	create: CreateMessage,
	system: string,
	user: string,
	schema: Record<string, unknown>,
): Promise<Result<unknown>> {
	let response: Anthropic.Beta.Messages.BetaMessage;
	try {
		response = await create({
			model: AI_MODEL,
			max_tokens: 16000,
			betas: ["server-side-fallback-2026-07-01"],
			fallbacks: "default",
			output_config: { effort: "high", format: { type: "json_schema", schema } },
			system,
			messages: [{ role: "user", content: user }],
		});
	} catch (error) {
		if (error instanceof Anthropic.RateLimitError)
			return { ok: false, message: "The AI reviewer is rate limited; it will try again next time." };
		if (error instanceof Anthropic.APIError)
			return { ok: false, message: `The AI reviewer failed (Claude API ${error.status ?? "error"}).` };
		return { ok: false, message: "Couldn't reach the AI reviewer." };
	}
	if (response.stop_reason === "refusal")
		return { ok: false, message: "The AI reviewer declined to answer." };
	if (response.stop_reason === "max_tokens")
		return { ok: false, message: "The AI reviewer's answer was cut off." };
	const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false, message: "The AI reviewer's answer wasn't readable." };
	}
}

const LEVELS = ["low", "medium", "high"] as const;
const pick = <T extends string>(v: unknown, options: readonly T[]): T | null =>
	options.find((o) => o === v) ?? null;

export type ApplicationFacts = {
	platform: string;
	audience: string;
	country: string;
	profileUrl: string;
	plan: string;
};

const APPLICATION_SYSTEM = `You help the owner of Worldwide Vapor, an online vape shop selling only to age-verified adults in Canada and the US, review affiliate applications. You give advice; the owner decides.

Judge whether the applicant would promote the shop honestly to an adult audience on the platform they describe. Signs of a good fit: a real content platform aimed at adults (vaping, lifestyle, reviews), a concrete plan (reviews, tutorials, a link in bio), an audience size that matches the platform. Warning signs: coupon, deal, cashback or incentivised-traffic sites; paid ads bidding on the shop's name; content aimed at teenagers or likely to reach minors; health claims (vaping as safe or as a cure); spammy, copied or empty plans; a profile link that doesn't match the platform named.

You can't open the profile link; judge only what's written. Answer "approve" when it looks like a good fit with no warning signs, "reject" for clear warning signs, otherwise "review". Give two to four short reasons the owner can check.`;

const APPLICATION_SCHEMA = {
	type: "object",
	properties: {
		recommendation: { type: "string", enum: ["approve", "review", "reject"] },
		risk: { type: "string", enum: [...LEVELS] },
		reasons: { type: "array", items: { type: "string" } },
	},
	required: ["recommendation", "risk", "reasons"],
	additionalProperties: false,
};

export async function reviewApplication(
	facts: ApplicationFacts,
	now: Date,
	create: CreateMessage = defaultCreateMessage(),
): Promise<Result<AiApplicationReview>> {
	const answer = await askJson(
		create,
		APPLICATION_SYSTEM,
		JSON.stringify(facts, null, 2),
		APPLICATION_SCHEMA,
	);
	if (!answer.ok) return answer;
	const v = answer.value as Record<string, unknown>;
	const recommendation = pick(v.recommendation, ["approve", "review", "reject"] as const);
	const risk = pick(v.risk, LEVELS);
	if (!recommendation || !risk || !Array.isArray(v.reasons))
		return { ok: false, message: "The AI reviewer's answer wasn't in the expected shape." };
	return {
		ok: true,
		value: {
			at: now.toISOString(),
			recommendation,
			risk,
			reasons: v.reasons
				.filter((r): r is string => typeof r === "string")
				.map((r) => r.slice(0, 300))
				.slice(0, 4),
		},
	};
}

const WEEKLY_SYSTEM = `You review a vape shop's affiliate program each week for fraud and abuse, for the owner. You see per-affiliate signals: counts and shares over the last 90 days, never personal details. You give advice; you can't pay, pause or remove anyone.

What the signals mean: reversalRate is the share of credited orders later cancelled or refunded. uncreditedOrders carried the affiliate's code but weren't credited (often their own orders). ownEmailOrders used the affiliate's own email. lookalikeEmailOrders came from emails resembling the affiliate's (possible self-referral under another address). topPostalCodeShare and topBuyerShare are the largest share of orders from one postal code or one buyer (many orders from one place or person can mean fake or self-made orders). discountCodeShare is how many credited orders used their linked discount code (a share near 1 with few link orders can mean the code leaked to coupon sites). Compare salesThisMonth with averagePreviousMonths for sudden jumps.

Flag only affiliates whose signals suggest a real problem, with small numbers judged cautiously. Severity: "high" means likely fraud, and the shop will hold that affiliate's automatic payouts until the owner checks; "medium" means worth a look; "low" means worth noting. For each flag give the affiliate's code, one plain-language reason citing the numbers, and one suggested action. Then write a summary of the program's week in at most 120 words. If nothing looks wrong, return no flags and say so.`;

const WEEKLY_SCHEMA = {
	type: "object",
	properties: {
		summary: { type: "string" },
		flags: {
			type: "array",
			items: {
				type: "object",
				properties: {
					code: { type: "string" },
					severity: { type: "string", enum: [...LEVELS] },
					reason: { type: "string" },
					suggestedAction: { type: "string" },
				},
				required: ["code", "severity", "reason", "suggestedAction"],
				additionalProperties: false,
			},
		},
	},
	required: ["summary", "flags"],
	additionalProperties: false,
};

export type WeeklyFlag = AiFlag & { code: string; suggestedAction: string };
export type WeeklyReview = { summary: string; flags: WeeklyFlag[] };

export async function weeklyReview(
	signals: readonly AffiliateSignals[],
	now: Date,
	create: CreateMessage = defaultCreateMessage(),
): Promise<Result<WeeklyReview>> {
	if (signals.length === 0) return { ok: true, value: { summary: "No active affiliates yet.", flags: [] } };
	const answer = await askJson(
		create,
		WEEKLY_SYSTEM,
		`Signals for ${signals.length} affiliates, ${now.toISOString().slice(0, 10)}:\n${JSON.stringify(signals, null, 2)}`,
		WEEKLY_SCHEMA,
	);
	if (!answer.ok) return answer;
	const v = answer.value as Record<string, unknown>;
	if (typeof v.summary !== "string" || !Array.isArray(v.flags))
		return { ok: false, message: "The AI reviewer's answer wasn't in the expected shape." };
	const known = new Set(signals.map((s) => s.code));
	const flags: WeeklyFlag[] = [];
	for (const f of v.flags as Array<Record<string, unknown>>) {
		const severity = pick(f.severity, LEVELS);
		// Only codes that were actually reviewed: an invented code can't hold anyone.
		if (!severity || typeof f.code !== "string" || !known.has(f.code) || typeof f.reason !== "string")
			continue;
		flags.push({
			code: f.code,
			severity,
			reason: f.reason.slice(0, 500),
			suggestedAction: typeof f.suggestedAction === "string" ? f.suggestedAction.slice(0, 300) : "",
			at: now.toISOString(),
		});
	}
	return { ok: true, value: { summary: v.summary.slice(0, 1500), flags } };
}
