import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { channelById } from "@/lib/community/channels";
import type { SessionState } from "@/lib/community/client";
import { Avatar, MessageText, RoleBadge } from "./community-bits";
import { Composer } from "./community-composer";
import { MemberList } from "./community-members";
import { RulesCard } from "./community-rules";
import { Sidebar } from "./community-sidebar";

const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

describe("MessageText", () => {
	it("renders markup typed into a message as plain text", () => {
		const out = html(
			createElement(MessageText, { text: '<img src=x onerror="alert(1)"> <script>x</script>' }),
		);
		expect(out).not.toContain("<img");
		expect(out).not.toContain("<script");
		expect(out).toContain("&lt;img");
	});

	it("opens links safely in a new tab", () => {
		const out = html(createElement(MessageText, { text: "see https://example.com/a" }));
		expect(out).toContain('href="https://example.com/a"');
		expect(out).toContain('target="_blank"');
		expect(out).toMatch(/rel="noopener noreferrer nofollow ugc"/);
	});

	it("never links a javascript: address", () => {
		expect(html(createElement(MessageText, { text: "javascript:alert(1)" }))).not.toContain("<a ");
	});

	it("formats bold, italic, code and mentions", () => {
		const out = html(createElement(MessageText, { text: "**b** *i* `c` @Ava_1" }));
		expect(out).toContain("<strong>b</strong>");
		expect(out).toContain("<em>i</em>");
		expect(out).toContain("<code");
		expect(out).toContain("@Ava_1");
	});
});

describe("badges and avatars", () => {
	it("labels staff and mods but not members", () => {
		expect(html(createElement(RoleBadge, { role: "staff" }))).toContain("Staff");
		expect(html(createElement(RoleBadge, { role: "mod" }))).toContain("Mod");
		expect(html(createElement(RoleBadge, { role: "member" }))).toBe("");
	});

	it("shows the first letter of the name, hidden from screen readers", () => {
		const out = html(createElement(Avatar, { memberId: "abc", name: "cloud" }));
		expect(out).toContain(">C<");
		expect(out).toContain('aria-hidden="true"');
	});
});

describe("RulesCard", () => {
	it("numbers the house rules", () => {
		const out = html(createElement(RulesCard));
		expect(out).toContain("HOUSE RULES");
		expect(out).toContain("No selling or trading");
		expect(out).toContain("Adults only");
	});
});

const general = channelById("general")!;
const rules = channelById("rules")!;

const composer = (session: SessionState, channel = general) =>
	html(
		createElement(Composer, {
			session,
			channel,
			draft: "",
			onDraft: vi.fn(),
			replyingTo: null,
			onCancelReply: vi.fn(),
			onSend: vi.fn(),
			onSent: vi.fn(),
			onChooseNickname: vi.fn(),
			onShowRules: vi.fn(),
		}),
	);

describe("Composer", () => {
	const viewer = (role: "member" | "mod" | "staff") => ({ memberId: "m1", name: "Ava", role });

	it("holds a place while the session loads", () => {
		const out = composer({ status: "loading" });
		expect(out).not.toContain("<textarea");
		expect(out).not.toContain("Sign in");
	});

	it("asks a guest to sign in, with a way back to the community", () => {
		const out = composer({ status: "guest" });
		expect(out).toContain("Anyone can read along");
		expect(out).toContain('href="/login?next=/community"');
		expect(out).toContain('href="/register"');
		expect(out).not.toContain("<textarea");
	});

	it("says so when sign-in can't be checked", () => {
		expect(composer({ status: "unavailable" })).toContain("couldn&#x27;t check your sign-in");
	});

	it("asks someone without a nickname to choose one before they can type", () => {
		const out = composer({ status: "needs-name", viewer: { memberId: "m1", name: null, role: "member" } });
		expect(out).toContain("CHOOSE A NICKNAME TO JOIN THE CHAT");
		expect(out).toContain("house rules");
		expect(out).not.toContain("<textarea");
	});

	it("gives a member a message box for the channel", () => {
		const out = composer({ status: "member", viewer: viewer("member") });
		expect(out).toContain("<textarea");
		expect(out).toContain('placeholder="Message #general"');
		expect(out).toContain('aria-label="Send message"');
	});

	it("keeps members out of the team-only channels but lets the team in", () => {
		expect(composer({ status: "member", viewer: viewer("member") }, rules)).toContain(
			"Only the team can post in #rules",
		);
		expect(composer({ status: "member", viewer: viewer("member") }, rules)).not.toContain("<textarea");
		expect(composer({ status: "member", viewer: viewer("mod") }, rules)).toContain("<textarea");
	});
});

describe("Sidebar", () => {
	const sidebar = (session: SessionState, unread: string[] = []) =>
		html(
			createElement(Sidebar, {
				session,
				channelId: "general",
				unread: new Set(unread),
				onSelect: vi.fn(),
				onClose: vi.fn(),
				onChooseNickname: vi.fn(),
			}),
		);

	it("lists every channel and marks the current one", () => {
		const out = sidebar({ status: "guest" });
		for (const id of ["rules", "announcements", "general", "product-talk", "quit-support", "off-topic"])
			expect(out).toContain(`>${id}<`);
		expect(out).toContain('aria-current="page"');
	});

	it("shows an unread dot only on channels with something new", () => {
		expect(sidebar({ status: "guest" })).not.toContain("Unread messages");
		expect(sidebar({ status: "guest" }, ["product-talk"]).match(/Unread messages/g)).toHaveLength(1);
	});

	it("shows the visitor's nickname and an edit button, or says they are a guest", () => {
		const member = sidebar({ status: "member", viewer: { memberId: "m1", name: "Ava", role: "staff" } });
		expect(member).toContain("Ava");
		expect(member).toContain("Edit");
		expect(member).toContain("Staff");
		expect(sidebar({ status: "guest" })).toContain("reading as a guest");
	});
});

describe("MemberList", () => {
	const list = (
		online: { memberId: string; name: string; role: "member" | "mod" | "staff" }[],
		total = online.length,
	) =>
		html(
			createElement(MemberList, {
				roster: { online, total },
				viewerId: "m1",
				onMention: vi.fn(),
				onClose: vi.fn(),
			}),
		);

	it("counts who is online and how many have joined", () => {
		const out = list(
			[
				{ memberId: "m1", name: "Ava", role: "member" },
				{ memberId: "m2", name: "Ben", role: "mod" },
			],
			1234,
		);
		expect(out).toContain("Online · 2");
		expect(out).toContain("1,234 members have joined");
		expect(out).toContain("Mod");
	});

	it("doesn't let you mention yourself", () => {
		const out = list([{ memberId: "m1", name: "Ava", role: "member" }]);
		expect(out).toMatch(/<button[^>]*disabled[^>]*title="That&#x27;s you"/);
	});

	it("invites people to say hello when nobody is here", () => {
		expect(list([])).toContain("No one is here right now");
	});

	it("uses the singular for one member", () => {
		expect(list([], 1)).toContain("1 member has joined");
	});
});
