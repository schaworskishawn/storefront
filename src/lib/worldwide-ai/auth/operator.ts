import "server-only";

import { cache } from "react";
import { OperatorViewerDocument } from "@/gql/graphql";
import { fetchAuthenticatedUserIfSession } from "@/lib/auth/fetch-authenticated-user";
import { resolveSessionUser } from "@/lib/auth/resolve-session-user";
import { readConfig, type WorldwideAiConfig } from "../config";
import type { OperatorActor } from "../types";
import { demoOperatorFor, operatorFor } from "./roles";

/**
 * The dashboard's door. The signed-in store account is read on the server from the session cookie (the dashboard never
 * calls Saleor from the browser), and what it may do is decided by `operatorFor`.
 *
 * "guest": nobody is signed in. "unavailable": the store's API couldn't be asked, so access is refused rather than guessed.
 * "forbidden": signed in, but not on the owner or staff list (an ordinary customer, for example): to them the dashboard does
 * not exist. "operator": allowed in.
 */

export type OperatorState =
	| { status: "guest" }
	| { status: "unavailable" }
	| { status: "forbidden"; accountId: string }
	| { status: "operator"; actor: OperatorActor; config: WorldwideAiConfig };

export const getOperatorState = cache(async (): Promise<OperatorState> => {
	const config = readConfig();
	const preview = demoOperatorFor(process.env, config);
	if (preview) return { status: "operator", actor: preview, config };
	const auth = await resolveSessionUser(() =>
		fetchAuthenticatedUserIfSession(OperatorViewerDocument, { cache: "no-cache" }),
	);
	if (auth.status === "guest") return { status: "guest" };
	if (auth.status === "unavailable") return { status: "unavailable" };
	const actor = operatorFor(auth.user, config);
	return actor ? { status: "operator", actor, config } : { status: "forbidden", accountId: auth.user.id };
});
