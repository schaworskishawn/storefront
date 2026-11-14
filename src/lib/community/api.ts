import "server-only";

import { NextResponse } from "next/server";
import { CommunityViewerDocument } from "@/gql/graphql";
import { fetchAuthenticatedUserIfSession } from "@/lib/auth/fetch-authenticated-user";
import { resolveSessionUser } from "@/lib/auth/resolve-session-user";
import { sameOrigin } from "./origin";
import { communityRedis, type Redis } from "./redis";
import { roleFor } from "./roles";
import { resolveMember, type Member } from "./store";

/** What every community route needs: a JSON reply that is never cached, the origin check, and who is asking. */

export const json = (body: unknown, status = 200) =>
	NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });

export const failure = (status: number, message: string) => json({ message }, status);

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	const body = (await request.json().catch(() => null)) as unknown;
	return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

export const notOpen = () => failure(503, "The community isn't open yet.");

export type Identity = { status: "guest" } | { status: "unavailable" } | { status: "member"; member: Member };

/** The signed-in store account behind this request, as a community member. Needs Saleor and Redis, so use it for what changes things. */
export async function identify(redis: Redis): Promise<Identity> {
	const auth = await resolveSessionUser(() =>
		fetchAuthenticatedUserIfSession(CommunityViewerDocument, { cache: "no-cache" }),
	);
	if (auth.status !== "authenticated") return { status: auth.status };
	const { id, email, isStaff } = auth.user;
	return { status: "member", member: await resolveMember(redis, id, roleFor({ email, isStaff })) };
}

type Guard = { redis: Redis; member: Member } | { response: NextResponse };

/** For a route that changes something: the origin must match, Redis must be set up, and the visitor must be signed in. */
export async function requireMember(request: Request): Promise<Guard> {
	if (!sameOrigin(request)) return { response: failure(403, "That request came from somewhere else.") };
	const redis = communityRedis();
	if (!redis) return { response: notOpen() };
	const identity = await identify(redis);
	if (identity.status === "guest") return { response: failure(401, "Sign in to join the conversation.") };
	if (identity.status === "unavailable")
		return { response: failure(503, "We couldn't check your sign-in. Please try again.") };
	return { redis, member: identity.member };
}

/** Run a route's work, answering a Redis or network problem with a plain 502 instead of a stack trace. */
export async function guarded(work: () => Promise<NextResponse>): Promise<NextResponse> {
	try {
		return await work();
	} catch (error) {
		console.error("[community]", error instanceof Error ? error.message : error);
		return failure(502, "The community is having trouble right now. Please try again in a moment.");
	}
}
