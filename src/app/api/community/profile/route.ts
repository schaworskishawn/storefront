import { failure, guarded, json, readJson, requireMember } from "@/lib/community/api";
import { clientIp } from "@/lib/community/origin";
import { setNickname } from "@/lib/community/store";
import { rateLimited } from "@/lib/rate-limit";

/** Choose or change the nickname the visitor posts under. */
export async function POST(request: Request) {
	if (rateLimited(`community-profile:${clientIp(request)}`, 30))
		return failure(429, "Too many nickname changes from this connection. Please try again later.");
	const guard = await requireMember(request);
	if ("response" in guard) return guard.response;

	return guarded(async () => {
		const body = await readJson(request);
		const result = await setNickname(guard.redis, guard.member, body.name);
		if (!result.ok) return failure(result.status, result.message);
		return json({ viewer: { memberId: guard.member.memberId, name: result.name, role: guard.member.role } });
	});
}
