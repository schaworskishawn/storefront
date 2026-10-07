import { failure, guarded, identify, json, notOpen } from "@/lib/community/api";
import { sameOrigin } from "@/lib/community/origin";
import { communityRedis, type Redis } from "@/lib/community/redis";
import { heartbeat, readRoster, type Roster } from "@/lib/community/store";

const ROSTER_TTL_MS = 10_000;
let cached: { redis: Redis; at: number; roster: Roster } | null = null;

/** Who is online. Many visitors ask at once, so one server shares a copy that is at most ten seconds old. */
async function roster(redis: Redis): Promise<Roster> {
	const now = Date.now();
	if (cached && cached.redis === redis && now - cached.at < ROSTER_TTL_MS) return cached.roster;
	const fresh = await readRoster(redis, now);
	cached = { redis, at: now, roster: fresh };
	return fresh;
}

/** The online list, for anyone. */
export async function GET() {
	const redis = communityRedis();
	if (!redis) return notOpen();
	return guarded(async () => json(await roster(redis)));
}

/** "I'm here": a signed-in visitor's page calls this about once a minute, and gets the online list back. */
export async function POST(request: Request) {
	if (!sameOrigin(request)) return failure(403, "That request came from somewhere else.");
	const redis = communityRedis();
	if (!redis) return notOpen();
	return guarded(async () => {
		const identity = await identify(redis);
		if (identity.status === "member" && identity.member.name)
			await heartbeat(redis, identity.member.memberId);
		return json(await roster(redis));
	});
}
