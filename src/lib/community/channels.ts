/**
 * The community's channels. They live in code, not in the database: adding or renaming one is a code change, so the list
 * can't be filled with junk and every channel always has a topic and clear rules about who may post.
 */

export type Channel = {
	/** The URL-safe name, also part of the Redis keys. Never rename one that already has messages. */
	id: string;
	group: "Start here" | "Talk";
	topic: string;
	/** Only staff and moderators may post (rules, announcements). Everyone can still read it. */
	staffOnly?: boolean;
};

export const CHANNELS: readonly Channel[] = [
	{
		id: "rules",
		group: "Start here",
		staffOnly: true,
		topic: "House rules. Read these before you post.",
	},
	{
		id: "announcements",
		group: "Start here",
		staffOnly: true,
		topic: "New products, restocks and store news from the team.",
	},
	{ id: "general", group: "Talk", topic: "Say hi and talk about anything vape related." },
	{ id: "product-talk", group: "Talk", topic: "Flavours, devices and coils: what you are using and loving." },
	{
		id: "quit-support",
		group: "Talk",
		topic: "Cutting down or quitting? Share wins and bad days. Be kind.",
	},
	{ id: "off-topic", group: "Talk", topic: "Everything else. Keep it friendly." },
];

export const DEFAULT_CHANNEL_ID = "general";

export const channelById = (id: string | null | undefined): Channel | undefined =>
	CHANNELS.find((channel) => channel.id === id);

/** The house rules, shown at the top of #rules and in the welcome panel for someone choosing a nickname. */
export const RULES: readonly { title: string; text: string }[] = [
	{ title: "Adults only", text: "You must be of legal age to buy and use vape products where you live." },
	{
		title: "No selling or trading",
		text: "This is not a marketplace. Don't offer, ask for or arrange sales, swaps or giveaways between members.",
	},
	{
		title: "Be kind",
		text: "No harassment, hate, threats or pile-ons. Disagree with the idea, never the person.",
	},
	{
		title: "No medical claims",
		text: "Share your own experience, not advice that sounds like treatment. Talk to a doctor about your health.",
	},
	{
		title: "Keep it clean",
		text: "No spam, scams, adverts or other people's private details. At most two links in a message.",
	},
	{
		title: "Staff decide",
		text: "Moderators can delete messages and mute or remove anyone who breaks these rules.",
	},
];
