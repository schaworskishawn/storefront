import { guarded, identify, json, notOpen } from "@/lib/community/api";
import { communityRedis } from "@/lib/community/redis";

/** Who the visitor is in the community: signed out, signed in but without a nickname yet, or a member. */
export async function GET() {
	const redis = communityRedis();
	if (!redis) return notOpen();
	return guarded(async () => {
		const identity = await identify(redis);
		if (identity.status !== "member") return json({ status: identity.status });
		const { memberId, name, role } = identity.member;
		return json(
			name
				? { status: "member", viewer: { memberId, name, role } }
				: { status: "needs-name", viewer: { memberId, name: null, role } },
		);
	});
}
