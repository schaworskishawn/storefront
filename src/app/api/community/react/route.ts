import { failure, guarded, json, readJson, requireMember } from "@/lib/community/api";
import { toggleReaction } from "@/lib/community/store";

/** React to a message with one of the offered emoji, or take the reaction back. */
export async function POST(request: Request) {
	const guard = await requireMember(request);
	if ("response" in guard) return guard.response;
	if (!guard.member.name) return failure(403, "Choose a nickname first.");

	return guarded(async () => {
		const body = await readJson(request);
		const result = await toggleReaction(guard.redis, {
			channel: typeof body.channel === "string" ? body.channel : "",
			messageId: body.messageId,
			emoji: body.emoji,
			memberId: guard.member.memberId,
		});
		return result.ok ? json({ ok: true }) : failure(result.status, result.message);
	});
}
