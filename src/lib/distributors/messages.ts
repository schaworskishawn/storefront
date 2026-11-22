import { discountLabel, minimumLabel, tierById, type DistributorTierId } from "./tiers";

/** The emails a business gets about its distributor account. Plain text, like the store's other account emails. */

type Email = { subject: string; text: string };

const how = (tierId: DistributorTierId) => {
	const tier = tierById(tierId);
	return `As a ${tier.name}, you get ${discountLabel(tier)} off list price on every product. Sign in and you'll see your wholesale price on each product; once your cart reaches ${minimumLabel(tier)} at list price, checkout charges your wholesale prices automatically (below that, it's retail). Sale prices and discount codes still apply on top.`;
};

export function approvalEmail(input: { name: string; tierId: DistributorTierId; origin: string }): Email {
	const tier = tierById(input.tierId);
	return {
		subject: `You're approved: Worldwide Vapor ${tier.name}`,
		text: [
			`Hi ${input.name},`,
			"",
			`Welcome to the Worldwide Vapor distribution network. Your account is approved as a ${tier.name}.`,
			"",
			how(input.tierId),
			"",
			`Your tier and its details: ${input.origin}/account/distributor`,
			`Start shopping: ${input.origin}/shop`,
			"",
			"Worldwide Vapor",
		].join("\n"),
	};
}

export function tierChangedEmail(input: { name: string; tierId: DistributorTierId; origin: string }): Email {
	const tier = tierById(input.tierId);
	return {
		subject: `Your Worldwide Vapor tier is now ${tier.name}`,
		text: [
			`Hi ${input.name},`,
			"",
			`Your distributor tier has changed to ${tier.name}.`,
			"",
			how(input.tierId),
			"",
			`Details: ${input.origin}/account/distributor`,
			"",
			"Worldwide Vapor",
		].join("\n"),
	};
}

export function rejectionEmail(input: { name: string; origin: string }): Email {
	return {
		subject: "Your Worldwide Vapor distributor application",
		text: [
			`Hi ${input.name},`,
			"",
			"Thank you for applying to become a Worldwide Vapor distributor. We weren't able to approve your application this time, usually because we couldn't verify the business licence or permits provided.",
			"",
			`You're welcome to apply again with updated details at ${input.origin}/distributor#apply, or reply to this email with any questions.`,
			"",
			"Worldwide Vapor",
		].join("\n"),
	};
}
