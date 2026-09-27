/** Shared shape + validation for the affiliate application (used by the form and by /api/affiliate). */

export const PLATFORMS = [
	"Instagram",
	"TikTok",
	"YouTube",
	"X / Twitter",
	"Facebook",
	"Website / Blog",
	"Discord / Community",
	"Other",
] as const;
export const AUDIENCES = [
	"Under 1,000",
	"1,000 – 10,000",
	"10,000 – 50,000",
	"50,000 – 250,000",
	"250,000+",
] as const;

export type AffiliateApplication = {
	name: string;
	email: string;
	phone: string;
	country: string;
	platform: string;
	profileUrl: string;
	audience: string;
	plan: string;
	confirmAge: boolean;
	agree: boolean;
	/** Honeypot: real people leave this empty. */
	company: string;
};

export type FieldErrors = Partial<Record<keyof AffiliateApplication, string>>;

const clean = (v: unknown, max: number) =>
	typeof v === "string"
		? v
				.replace(/[\u0000-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

export function normalize(raw: unknown): AffiliateApplication {
	const r = (raw ?? {}) as Record<string, unknown>;
	return {
		name: clean(r.name, 120),
		email: clean(r.email, 200),
		phone: clean(r.phone, 40),
		country: clean(r.country, 80),
		platform: clean(r.platform, 60),
		profileUrl: clean(r.profileUrl, 300),
		audience: clean(r.audience, 60),
		plan:
			typeof r.plan === "string"
				? r.plan
						.replace(/\u0000/g, "")
						.trim()
						.slice(0, 2000)
				: "",
		confirmAge: r.confirmAge === true,
		agree: r.agree === true,
		company: clean(r.company, 100),
	};
}

export function validate(a: AffiliateApplication): FieldErrors {
	const e: FieldErrors = {};
	if (a.name.length < 2) e.name = "Enter your full name.";
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) e.email = "Enter a valid email address.";
	if (!a.country) e.country = "Enter your country.";
	if (!a.platform) e.platform = "Choose your main platform.";
	if (!/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(a.profileUrl))
		e.profileUrl = "Enter a link to your profile, channel or website.";
	if (!a.audience) e.audience = "Choose your audience size.";
	if (a.plan.length < 20) e.plan = "Tell us a bit more (at least 20 characters).";
	if (!a.confirmAge) e.confirmAge = "You must be of legal age to apply.";
	if (!a.agree) e.agree = "Please accept the program terms.";
	return e;
}

export function toPlainText(a: AffiliateApplication): string {
	return [
		`Name: ${a.name}`,
		`Email: ${a.email}`,
		`Phone: ${a.phone || "—"}`,
		`Country: ${a.country}`,
		`Main platform: ${a.platform}`,
		`Profile / site: ${a.profileUrl}`,
		`Audience size: ${a.audience}`,
		"",
		"How they plan to promote Worldwide Vapor:",
		a.plan,
	].join("\n");
}
