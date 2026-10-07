import { failure, guarded, json, readJson, requireMember } from "@/lib/community/api";
import { clientIp } from "@/lib/community/origin";
import { postMessage } from "@/lib/community/store";
import { rateLimited } from "@/lib/rate-limit";

/** Post a message. The store enforces the rules (nickname, channel permission, timeouts, rate limits). */
export async function POST(request: Request) {
	// A backstop per connection; the real limits are per member, in the store.
	if (rateLimited(`community-post:${clientIp(request)}`, 600))
		return failure(429, "Too many messages from this connection. Please try again later.");
	const guard = await requireMember(request);
	if ("response" in guard) return guard.response;

	return guarded(async () => {
		const body = await readJson(request);
		const result = await postMessage(guard.redis, {
			channel: typeof body.channel === "string" ? body.channel : "",
			member: guard.member,
			text: body.text,
			replyTo: body.replyTo,
		});
		return result.ok ? json({ message: result.message }) : failure(result.status, result.message);
	});
}
