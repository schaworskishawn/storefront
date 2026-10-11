import type { ModelHandle } from "../ai/model";
import type { WorldwideAiConfig } from "../config";
import type { Sql } from "../db/sql";
import type { OpenClawConnector } from "../openclaw/connector";
import type { FileStorage } from "../storage/files";
import type { TaskRecord } from "../tasks/repo";

/**
 * What a workflow needs to run, passed in rather than reached for: the database, the configuration, the clock, and the model
 * (null when none is configured). The Next.js app, Trigger.dev jobs and the tests each build one of these, so the same
 * workflow code runs, and is tested, everywhere.
 */
export type WorkflowDeps = {
	sql: Sql;
	config: WorldwideAiConfig;
	now: () => Date;
	model: ModelHandle | null;
	/** Where evidence files and uploads are kept. Null when storage isn't configured. */
	storage?: FileStorage | null;
	/** The OpenClaw worker's adapter. Null when it isn't configured. */
	openclaw?: OpenClawConnector | null;
	/** Waiting between polls (tests make this instant). */
	sleep?: (ms: number) => Promise<void>;
	/** How often to check a running OpenClaw job. */
	pollMs?: number;
	fetchImpl?: typeof fetch;
};

export type RunOutcome =
	| { status: "needs_review"; task: TaskRecord; draftId: string }
	| { status: "completed"; task: TaskRecord }
	| { status: "failed"; task: TaskRecord; error: string }
	| { status: "skipped"; task: TaskRecord; reason: string }
	| { status: "deferred"; task: TaskRecord; reason: string };

export type WorkflowErrorCode =
	| "not_found"
	| "conflict"
	| "disabled"
	| "forbidden"
	| "invalid"
	| "not_configured";

export class WorkflowError extends Error {
	constructor(
		readonly code: WorkflowErrorCode,
		message: string,
	) {
		super(message);
		this.name = "WorkflowError";
	}
}
