import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AI_MODEL, isAiConfigured, reviewApplication, weeklyReview, type CreateMessage } from "./ai-review";
import type { AffiliateSignals } from "./signals";

const NOW = new Date("2026-11-16T15:00:00.000Z");

/** A fake Claude that answers with this JSON (or this stop reason). */
function claude(answer: unknown, stopReason = "end_turn") {
	return vi.fn(
		async (_params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) =>
			({
				id: "msg",
				type: "message",
				role: "assistant",
				model: AI_MODEL,
				stop_reason: stopReason,
				content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) }],
			}) as unknown as Anthropic.Beta.Messages.BetaMessage,
	);
}

const facts = {
	platform: "Instagram",
	audience: "12k followers, 21+",
	country: "Canada",
	profileUrl: "instagram.com/cloudchaser",
	plan: "Weekly reviews of new disposables, link in bio.",
};

describe("isAiConfigured", () => {
	it("needs ANTHROPIC_API_KEY", () => {
		expect(isAiConfigured({})).toBe(false);
		expect(isAiConfigured({ ANTHROPIC_API_KEY: " " })).toBe(false);
		expect(isAiConfigured({ ANTHROPIC_API_KEY: "sk-test" })).toBe(true);
	});
});

describe("reviewApplication", () => {
	it("asks Claude for structured advice with fallbacks on, sending only what the applicant wrote about their platform", async () => {
		const create = claude({
			recommendation: "approve",
			risk: "low",
			reasons: ["Adult audience", "Concrete plan"],
		});
		const result = await reviewApplication(facts, NOW, create as CreateMessage);

		expect(result).toEqual({
			ok: true,
			value: {
				at: NOW.toISOString(),
				recommendation: "approve",
				risk: "low",
				reasons: ["Adult audience", "Concrete plan"],
			},
		});
		const params = create.mock.calls[0]![0];
		expect(params).toMatchObject({
			model: "claude-opus-5-5",
			betas: ["server-side-fallback-2026-07-01"],
			fallbacks: "default",
			output_config: { effort: "high", format: { type: "json_schema" } },
		});
		expect(JSON.parse(params.messages[0]!.content as string)).toEqual(facts);
	});

	it("keeps at most four reasons", async () => {
		const create = claude({
			recommendation: "review",
			risk: "medium",
			reasons: ["a", "b", "c", "d", "e", 6],
		});
		const result = await reviewApplication(facts, NOW, create as CreateMessage);
		expect(result.ok && result.value.reasons).toEqual(["a", "b", "c", "d"]);
	});

	it.each([
		["a refusal", claude({}, "refusal"), "declined"],
		["a cut-off answer", claude({}, "max_tokens"), "cut off"],
		["unreadable JSON", claude("not json"), "wasn't readable"],
		["the wrong shape", claude({ recommendation: "yes", risk: "low", reasons: [] }), "expected shape"],
	])("reports %s instead of guessing", async (_name, create, message) => {
		const result = await reviewApplication(facts, NOW, create as CreateMessage);
		expect(result).toEqual({ ok: false, message: expect.stringContaining(message) });
	});

	it("reports an unreachable API without throwing", async () => {
		const create = vi.fn(async () => {
			throw new Error("offline");
		});
		const result = await reviewApplication(facts, NOW, create as unknown as CreateMessage);
		expect(result).toEqual({ ok: false, message: "Couldn't reach the AI reviewer." });
	});
});

describe("weeklyReview", () => {
	const signals = (code: string): AffiliateSignals => ({
		code,
		tierThisMonth: "CLOUD",
		referredOrders: 10,
		creditedOrders: 9,
		reversedOrders: 0,
		reversalRate: 0,
		uncreditedOrders: 1,
		ownEmailOrders: 0,
		lookalikeEmailOrders: 0,
		topPostalCodeShare: 0.9,
		topBuyerShare: 0.2,
		discountCodeShare: 0,
		salesThisMonth: 900,
		averagePreviousMonths: 100,
	});

	it("keeps only flags for affiliates it was shown, so an invented code can't hold anyone", async () => {
		const create = claude({
			summary: "One affiliate looks off.",
			flags: [
				{
					code: "neo",
					severity: "high",
					reason: "90% of orders from one postal code",
					suggestedAction: "Check the orders",
				},
				{ code: "ghost", severity: "high", reason: "Made up", suggestedAction: "-" },
				{ code: "neo", severity: "extreme", reason: "Bad severity", suggestedAction: "-" },
			],
		});
		const result = await weeklyReview([signals("neo")], NOW, create as CreateMessage);
		expect(result).toEqual({
			ok: true,
			value: {
				summary: "One affiliate looks off.",
				flags: [
					{
						code: "neo",
						severity: "high",
						reason: "90% of orders from one postal code",
						suggestedAction: "Check the orders",
						at: NOW.toISOString(),
					},
				],
			},
		});
	});

	it("sends only the signals: no emails or addresses", async () => {
		const create = claude({ summary: "Quiet week.", flags: [] });
		await weeklyReview([signals("neo")], NOW, create as CreateMessage);
		const content = create.mock.calls[0]![0].messages[0]!.content as string;
		expect(content).toContain('"topPostalCodeShare": 0.9');
		expect(content).not.toMatch(/@/);
	});

	it("doesn't call Claude when there's no one to review", async () => {
		const create = claude({});
		const result = await weeklyReview([], NOW, create as CreateMessage);
		expect(result.ok).toBe(true);
		expect(create).not.toHaveBeenCalled();
	});
});
