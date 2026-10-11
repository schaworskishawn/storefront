import "server-only";

import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { audit } from "../audit";
import { getOperatorState } from "../auth/operator";
import { isDashboardConfigured, isDemoStore, type WorldwideAiConfig } from "../config";
import { getRuntime, type Runtime } from "../runtime";
import { WORKSPACE_PATH, actorKey, type OperatorActor } from "../types";

/**
 * The door every workspace page and every server action comes through. It is checked on the server on every request: a
 * layout's check does not protect the pages under it, so each page and each action calls this itself (the answer is cached
 * for the length of one request).
 *
 *   nobody signed in        → the store's sign-in page
 *   signed in, not listed   → "not found": to a customer the workspace does not exist (and the attempt is logged)
 *   sign-in can't be asked  → refused, never guessed
 *   an owner or staff       → in, with what they may do decided here and nowhere else
 */

export type Workspace = {
	actor: OperatorActor;
	/** The actor's key ("operator:<id>"): what records are attributed to, and whose personal work may be shown. */
	viewer: string;
	isOwner: boolean;
	config: WorldwideAiConfig;
	runtime: Runtime;
	/** True while the in-memory demonstration store is in use: every screen then says so. */
	demo: boolean;
};

export class SignInUnavailableError extends Error {
	constructor() {
		super(
			"The store's sign-in service couldn't be reached, so access was refused rather than guessed. Try again shortly.",
		);
		this.name = "SignInUnavailableError";
	}
}

export const LOGIN_PATH = `/login?next=${encodeURIComponent(WORKSPACE_PATH)}`;

export const getWorkspace = cache(async (): Promise<Workspace> => {
	// Everything in the workspace is rendered for one request, at request time: nothing here is ever prerendered or cached.
	await connection();
	const state = await getOperatorState();
	if (state.status === "guest") redirect(LOGIN_PATH);
	if (state.status === "unavailable") throw new SignInUnavailableError();
	if (state.status === "forbidden") {
		// Log the attempt when there is somewhere to log it; a logging failure never lets anyone in.
		try {
			const runtime = await getRuntime();
			await audit(runtime.sql, {
				actor: null,
				action: "workspace.access",
				subject: state.accountId,
				outcome: "denied",
				detail: { reason: "not an owner or staff account" },
			});
		} catch {
			// No database yet: nothing to record.
		}
		notFound();
	}
	const { actor, config } = state;
	// Nobody is an operator until an owner and a database are configured (the local preview aside).
	if (!isDashboardConfigured(config) && !isDemoStore(config)) notFound();
	return {
		actor,
		viewer: actorKey(actor),
		isOwner: actor.role === "owner",
		config,
		runtime: await getRuntime(),
		demo: isDemoStore(config),
	};
});

/** For pages only an owner may open. Staff get "not found", and the attempt is logged. */
export async function getOwnerWorkspace(action: string): Promise<Workspace> {
	const workspace = await getWorkspace();
	if (!workspace.isOwner) {
		await audit(workspace.runtime.sql, {
			actor: workspace.actor,
			action,
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		notFound();
	}
	return workspace;
}
