import { failure, guarded, json, notOpen } from "@/lib/community/api";
import { DEFAULT_CHANNEL_ID, channelById } from "@/lib/community/channels";
import { communityRedis } from "@/lib/community/redis";
import { listMessages, readFeed } from "@/lib/community/store";

/**
 * Catch up on a channel. Anyone can read; nothing here depends on who is asking, so polling it never calls Saleor.
 *   ?channel=general&cursor=<from the last reply>   what changed since that cursor (nothing, new messages, or a fresh page)
 *   ?channel=general&before=<message id>            the page of older messages before that one
 */
export async function GET(request: Request) {
	const redis = communityRedis();
	if (!redis) return notOpen();
	const params = new URL(request.url).searchParams;
	const channel = channelById(params.get("channel") ?? DEFAULT_CHANNEL_ID);
	if (!channel) return failure(404, "That channel doesn't exist.");

	return guarded(async () => {
		const before = params.get("before");
		if (before) return json({ ...(await listMessages(redis, channel.id, { before })), channel: channel.id });
		return json({
			...(await readFeed(redis, { channel: channel.id, cursor: params.get("cursor") })),
			channel: channel.id,
		});
	});
}
