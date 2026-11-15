import { failure, guarded, json, readJson, requireMember } from "@/lib/community/api";
import { moderate, type ModAction } from "@/lib/community/store";

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** A moderator removing a message, timing a member out, or removing / restoring one. Everyone else is refused by the store. */
export async function POST(request: Request) {
	const guard = await requireMember(request);
	if ("response" in guard) return guard.response;

	return guarded(async () => {
		const body = await readJson(request);
		let action: ModAction;
		switch (body.action) {
			case "delete":
				action = { kind: "delete", channel: str(body.channel), messageId: str(body.messageId) };
				break;
			case "timeout":
				action = { kind: "timeout", memberId: str(body.memberId), minutes: Number(body.minutes) || 10 };
				break;
			case "ban":
			case "unban":
				action = { kind: body.action, memberId: str(body.memberId) };
				break;
			default:
				return failure(400, "Unknown action.");
		}
		const result = await moderate(guard.redis, guard.member, action);
		return result.ok ? json({ ok: true }) : failure(result.status, result.message);
	});
}
