import "server-only";

import { NextResponse, connection } from "next/server";
import { audit } from "../audit";
import { getOperatorState } from "../auth/operator";
import { isDashboardConfigured, isDemoStore, type WorldwideAiConfig } from "../config";
import { getRuntime, type Runtime } from "../runtime";
import { actorKey, type OperatorActor } from "../types";

/**
 * The door for the workspace's own API routes. Unlike a page, a route can answer with a real status code, so it does:
 * 401 when nobody is signed in, 404 when the person isn't an owner or staff member (the route doesn't exist for them),
 * 503 when the store's sign-in service couldn't be asked. Every response is private and never cached.
 */

export const PRIVATE_HEADERS = {
	"Cache-Control": "private, no-store",
	"X-Robots-Tag": "noindex, nofollow",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
} as const;

export const apiJson = (body: unknown, status = 200) =>
	NextResponse.json(body, { status, headers: PRIVATE_HEADERS });

export type ApiOperator = {
	actor: OperatorActor;
	viewer: string;
	config: WorldwideAiConfig;
	runtime: Runtime;
};

export async function authorizeApi(): Promise<
	{ ok: true; operator: ApiOperator } | { ok: false; response: NextResponse }
> {
	await connection();
	const state = await getOperatorState();
	if (state.status === "guest") return { ok: false, response: apiJson({ error: "Sign in first." }, 401) };
	if (state.status === "unavailable")
		return {
			ok: false,
			response: apiJson({ error: "The sign-in service couldn't be reached. Try again shortly." }, 503),
		};
	if (state.status === "forbidden") {
		try {
			const runtime = await getRuntime();
			await audit(runtime.sql, {
				actor: null,
				action: "workspace.api_access",
				subject: state.accountId,
				outcome: "denied",
				detail: { reason: "not an owner or staff account" },
			});
		} catch {
			// Nowhere to record it; the request is refused all the same.
		}
		return { ok: false, response: apiJson({ error: "Not found." }, 404) };
	}
	if (!isDashboardConfigured(state.config) && !isDemoStore(state.config))
		return { ok: false, response: apiJson({ error: "Not found." }, 404) };
	return {
		ok: true,
		operator: {
			actor: state.actor,
			viewer: actorKey(state.actor),
			config: state.config,
			runtime: await getRuntime(),
		},
	};
}
