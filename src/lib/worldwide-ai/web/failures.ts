import "server-only";

import { SettingsError } from "../agents/settings";
import { ModelRunError } from "../ai/run";
import { AtlasError } from "../atlas/service";
import { DatabaseNotConfiguredError } from "../db/sql";
import { FunctionInputError } from "../functions/pipeline";
import { ConnectorError } from "../openclaw/connector";
import { CaseError } from "../support/cases";
import { TaskActionError } from "../tasks/actions";
import { DelegationLimitError, TaskNotFoundError } from "../tasks/repo";
import { InvalidTransitionError } from "../tasks/state-machine";
import { WorkflowError } from "../workflows/types";

import type { ActionState } from "./action-state";

/**
 * Turns an error into something safe and specific to show. Errors this application raises on purpose carry a message written
 * for a person; anything else is logged on the server and shown as a plain "something went wrong", never as a stack trace.
 */
export function describeFailure(error: unknown, values?: Record<string, string>): ActionState {
	if (error instanceof FunctionInputError)
		return {
			ok: false,
			message: "Some of what was entered can't be used.",
			problems: error.problems,
			values,
		};
	if (
		error instanceof WorkflowError ||
		error instanceof AtlasError ||
		error instanceof CaseError ||
		error instanceof TaskActionError ||
		error instanceof SettingsError ||
		error instanceof ModelRunError ||
		error instanceof ConnectorError ||
		error instanceof TaskNotFoundError ||
		error instanceof DelegationLimitError ||
		error instanceof DatabaseNotConfiguredError
	)
		return { ok: false, message: error.message, values };
	if (error instanceof InvalidTransitionError)
		return {
			ok: false,
			message: "That can't be done from the state this is in now. Reload and look again.",
			values,
		};
	console.error(
		"[worldwide-ai] action failed:",
		error instanceof Error ? `${error.name}: ${error.message}` : error,
	);
	return {
		ok: false,
		message:
			"Something went wrong and nothing was changed. Try again; if it keeps happening, check the Integrations page.",
		values,
	};
}
