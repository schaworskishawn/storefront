import { loadRoleSettings } from "../agents/settings";
import { audit } from "../audit";
import { iso, json, type Row, type Sql } from "../db/sql";
import { hashOf } from "../functions/products";
import { sha256Hex } from "../hash";
import { actorKey, type Actor, type OperatorActor } from "../types";
import { WorkflowError } from "../workflows/types";
import {
	ALWAYS_PROTECTED,
	ScopeError,
	checkChangedFiles,
	parsePatterns,
	pathsInDiff,
	type ChangedFile,
} from "./scope";

/**
 * Build's coding work, as a contract and its records.
 *
 * The server describes a job in an envelope it builds itself: which registered repository, which commit to start from, what
 * may be changed, which checks may be run. Nothing in it comes from model output, and a request can't name an address, a
 * command or a path on a machine. A worker returns a change package; it is accepted only if it is for that exact envelope,
 * starts from that commit, lists exactly the files its diff touches, and every one of them is in scope. It is then frozen
 * under a checksum of what it contains. Verify's results and the owner's decision are each tied to that checksum, so
 * neither carries over to anything else.
 *
 * This module runs nothing. A job is recorded and waits until a person starts it; the worker beside it does the running,
 * and is held to these rules like any other source of a change. Nothing here writes a patch, runs a check,
 * pushes a branch, merges or deploys, and an approval is a recorded decision, not a merge.
 */

export class CodingError extends WorkflowError {
	constructor(code: "invalid" | "not_found" | "conflict" | "forbidden", message: string) {
		super(code, message);
		this.name = "CodingError";
	}
}

export const CONTRACT_VERSION = 1;

export const JOB_TYPES = {
	repository_inspection: "Inspect the repository and report, changing nothing",
	change_proposal: "Prepare a change as a reviewable diff",
	acceptance_verification: "Run Verify's checks on a frozen candidate",
} as const;
export type JobType = keyof typeof JOB_TYPES;

/**
 * The coding backends this contract is written for. The Claude Agent SDK has a worker (it runs in throwaway machines on
 * Vercel Sandbox, once the server's settings are in place). OpenHands has none.
 */
export const BACKENDS = {
	"claude-agent-sdk": { label: "Claude Agent SDK", worker: "Vercel Sandbox" },
	openhands: { label: "OpenHands", worker: null },
} as const;
export type Backend = keyof typeof BACKENDS;

/**
 * The checks a job may ask for, by id. What each one runs is the worker's reviewed configuration, looked up by the id: a
 * command is never written by a model or taken from a request.
 */
export const CHECK_RUNNERS = {
	typecheck: "Typecheck",
	lint: "Lint",
	"unit-tests": "Unit tests",
	build: "Production build",
	"access-e2e": "Access tests against the build",
} as const;
export type RunnerId = keyof typeof CHECK_RUNNERS;

const tidy = (value: unknown, max: number): string =>
	typeof value === "string"
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
				.trim()
				.slice(0, max)
		: "";

const scoped = <T>(work: () => T): T => {
	try {
		return work();
	} catch (error) {
		if (error instanceof ScopeError) throw new CodingError("invalid", error.message);
		throw error;
	}
};

// ---- Repositories -------------------------------------------------------------------------------------

export type Repository = {
	id: string;
	label: string;
	defaultBranch: string;
	changeScope: string[];
	protectedPaths: string[];
	status: "active" | "retired";
	registeredAt: string;
};

const parseList = (value: unknown): string[] =>
	(typeof value === "string" ? JSON.parse(value) : value) as string[];

const toRepository = (r: Row): Repository => ({
	id: r.id as string,
	label: r.label as string,
	defaultBranch: r.default_branch as string,
	changeScope: parseList(r.change_scope),
	protectedPaths: parseList(r.protected_paths),
	status: r.status as Repository["status"],
	registeredAt: iso(r.registered_at) as string,
});

const REPOSITORY_COLUMNS = `id, label, default_branch, change_scope, protected_paths, status, registered_at`;

export async function listRepositories(sql: Sql): Promise<Repository[]> {
	const { rows } = await sql.query(`select ${REPOSITORY_COLUMNS} from wai_repositories order by id`);
	return rows.map(toRepository);
}

/**
 * The owner registers a repository under a short id, with what a change may touch and what it never may. Its address is
 * not asked for and not stored: the worker's own configuration resolves the id.
 */
export async function registerRepository(
	sql: Sql,
	actor: OperatorActor,
	input: { id: string; label: string; defaultBranch: string; changeScope: string; protectedPaths?: string },
): Promise<Repository> {
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: "coding.repository.register",
			subject: tidy(input.id, 60),
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new CodingError("forbidden", "Only the owner can register a repository.");
	}
	const id = tidy(input.id, 60);
	if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id))
		throw new CodingError(
			"invalid",
			"Give the repository a short id in lower-case letters, digits and dashes, like storefront. Not its address.",
		);
	const label = tidy(input.label, 160);
	if (!label) throw new CodingError("invalid", "Say which repository this is.");
	const defaultBranch = tidy(input.defaultBranch, 100);
	if (!/^[A-Za-z0-9._/-]{1,100}$/.test(defaultBranch) || defaultBranch.includes(".."))
		throw new CodingError("invalid", "Enter the default branch's name, like main.");
	const changeScope = scoped(() => parsePatterns(input.changeScope));
	if (changeScope.length === 0)
		throw new CodingError(
			"invalid",
			"List at least one path pattern a change may touch, like src/ui/**. Nothing is in scope by default.",
		);
	const protectedPaths = scoped(() => parsePatterns(input.protectedPaths ?? ""));
	const taken = await sql.query(`select 1 from wai_repositories where id = $1`, [id]);
	if (taken.rows[0]) throw new CodingError("conflict", `A repository is already registered as ${id}.`);
	const { rows } = await sql.query(
		`insert into wai_repositories (id, label, default_branch, change_scope, protected_paths, registered_by)
		 values ($1,$2,$3,$4::jsonb,$5::jsonb,$6) returning ${REPOSITORY_COLUMNS}`,
		[id, label, defaultBranch, json(changeScope), json(protectedPaths), actorKey(actor)],
	);
	await audit(sql, {
		actor,
		action: "coding.repository.register",
		subject: id,
		outcome: "allowed",
		detail: { changeScope, protectedPaths },
	});
	return toRepository(rows[0]);
}

// ---- Jobs ---------------------------------------------------------------------------------------------

export type Envelope = {
	contract: number;
	jobType: JobType;
	backend: Backend;
	repositoryId: string;
	defaultBranch: string;
	/** The commit the work starts from. A package built on any other commit is refused. */
	baseCommit: string;
	/** What is wanted, in the requester's words. It is described to the worker as data; it grants nothing. */
	goal: string;
	expectedResult: string;
	changeScope: string[];
	protectedPaths: string[];
	checkRunners: RunnerId[];
	limits: { maxTurns: number; maxMinutes: number };
	initiator: string;
	idempotencyKey: string;
	correlationId: string;
	createdAt: string;
};

export type CodingJob = {
	id: string;
	taskId: string | null;
	jobType: JobType;
	repositoryId: string;
	backend: Backend;
	envelope: Envelope;
	envelopeSha256: string;
	status:
		| "awaiting_backend"
		| "queued"
		| "running"
		| "returned"
		| "rejected"
		| "failed"
		| "cancelled"
		| "outcome_unknown";
	statusDetail: string | null;
	requestedBy: string;
	createdAt: string;
	updatedAt: string;
};

const JOB_COLUMNS = `id, task_id, job_type, repository_id, backend, envelope, envelope_sha256, status, status_detail, requested_by,
	created_at, updated_at`;

const toJob = (r: Row): CodingJob => ({
	id: r.id as string,
	taskId: (r.task_id as string | null) ?? null,
	jobType: r.job_type as JobType,
	repositoryId: r.repository_id as string,
	backend: r.backend as Backend,
	envelope: (typeof r.envelope === "string" ? JSON.parse(r.envelope) : r.envelope) as Envelope,
	envelopeSha256: r.envelope_sha256 as string,
	status: r.status as CodingJob["status"],
	statusDetail: (r.status_detail as string | null) ?? null,
	requestedBy: r.requested_by as string,
	createdAt: iso(r.created_at) as string,
	updatedAt: iso(r.updated_at) as string,
});

const IN_HAND: ReadonlyArray<CodingJob["status"]> = ["awaiting_backend", "queued", "running"];

export async function listCodingJobs(sql: Sql): Promise<CodingJob[]> {
	const { rows } = await sql.query(
		`select ${JOB_COLUMNS} from wai_coding_jobs order by created_at desc limit 200`,
	);
	return rows.map(toJob);
}

async function jobById(sql: Sql, id: string, lock = false): Promise<CodingJob> {
	const { rows } = await sql.query(
		`select ${JOB_COLUMNS} from wai_coding_jobs where id = $1 ${lock ? "for update" : ""}`,
		[tidy(id, 60)],
	);
	if (!rows[0]) throw new CodingError("not_found", "That coding job doesn't exist.");
	return toJob(rows[0]);
}

export type NewCodingJob = {
	jobType: string;
	repositoryId: string;
	backend?: string;
	baseCommit: string;
	goal: string;
	expectedResult: string;
	/** Check-runner ids, from the fixed list. */
	checks: readonly string[];
	idempotencyKey: string;
};

/**
 * Records a request for coding work and builds its envelope. The repository has to be registered, the starting commit has
 * to be a full commit id, and the checks have to be from the fixed list: a request can't carry an address, a command or a
 * path of its own. With no backend connected the job waits, and says so. One job is in hand per repository at a time.
 */
export async function requestCodingJob(
	sql: Sql,
	actor: OperatorActor,
	input: NewCodingJob,
	now: Date,
): Promise<CodingJob> {
	const key = tidy(input.idempotencyKey, 120);
	if (key.length < 8)
		throw new CodingError("invalid", "The request is missing its key. Reload the page and try again.");
	const jobType = (Object.keys(JOB_TYPES) as JobType[]).find((t) => t === input.jobType);
	if (!jobType) throw new CodingError("invalid", "Choose what kind of coding work this is.");
	const backend = (Object.keys(BACKENDS) as Backend[]).find(
		(b) => b === (input.backend || "claude-agent-sdk"),
	);
	if (!backend) throw new CodingError("invalid", "That isn't a coding backend this workspace knows.");
	const baseCommit = tidy(input.baseCommit, 64).toLowerCase();
	if (!/^[0-9a-f]{40}$/.test(baseCommit))
		throw new CodingError(
			"invalid",
			"Enter the full 40-character id of the commit to start from. A branch name can move; a commit can't.",
		);
	const goal = tidy(input.goal, 4000);
	if (!goal) throw new CodingError("invalid", "Say what is wanted.");
	const expectedResult = tidy(input.expectedResult, 1000);
	if (!expectedResult)
		throw new CodingError("invalid", "Say what a finished result looks like, so it can be checked against.");
	const unknown = input.checks.filter((id) => !(id in CHECK_RUNNERS));
	if (unknown.length)
		throw new CodingError(
			"invalid",
			`These aren't registered checks: ${unknown.join(", ")}. A check is chosen from the list, never written in.`,
		);
	const checkRunners = [...new Set(input.checks)] as RunnerId[];
	if (jobType !== "repository_inspection" && checkRunners.length === 0)
		throw new CodingError(
			"invalid",
			"Choose at least one check Verify has to pass before this can be approved.",
		);

	const existing = await sql.query(`select ${JOB_COLUMNS} from wai_coding_jobs where idempotency_key = $1`, [
		key,
	]);
	if (existing.rows[0]) return toJob(existing.rows[0]);
	// The same switch that stops Build's other work stops a coding job from starting.
	if (!(await loadRoleSettings(sql, "build")).enabled)
		throw new CodingError(
			"conflict",
			"Build is switched off in Settings, so no coding work can be asked for.",
		);
	const found = await sql.query(`select ${REPOSITORY_COLUMNS} from wai_repositories where id = $1`, [
		tidy(input.repositoryId, 60),
	]);
	if (!found.rows[0])
		throw new CodingError("invalid", "Choose a registered repository. An address can't be given here.");
	const repository = toRepository(found.rows[0]);
	if (repository.status !== "active")
		throw new CodingError("conflict", `Repository ${repository.id} is retired.`);
	const busy = await sql.query<{ id: string }>(
		`select id from wai_coding_jobs where repository_id = $1 and status = any($2::text[]) limit 1`,
		[repository.id, IN_HAND],
	);
	if (busy.rows[0])
		throw new CodingError(
			"conflict",
			`A coding job is already in hand for ${repository.id}. One at a time: cancel it or wait for it.`,
		);
	const envelope: Envelope = {
		contract: CONTRACT_VERSION,
		jobType,
		backend,
		repositoryId: repository.id,
		defaultBranch: repository.defaultBranch,
		baseCommit,
		goal,
		expectedResult,
		changeScope: jobType === "change_proposal" ? repository.changeScope : [],
		protectedPaths: [...ALWAYS_PROTECTED, ...repository.protectedPaths],
		checkRunners,
		limits: { maxTurns: 40, maxMinutes: 30 },
		initiator: actorKey(actor),
		idempotencyKey: key,
		correlationId: sha256Hex(`${key}:${now.toISOString()}`).slice(0, 24),
		createdAt: now.toISOString(),
	};
	let rows: Row[];
	try {
		({ rows } = await sql.query(
			`insert into wai_coding_jobs (job_type, repository_id, backend, envelope, envelope_sha256, status, status_detail,
				idempotency_key, requested_by)
			 values ($1,$2,$3,$4::jsonb,$5,'awaiting_backend',$6,$7,$8) returning ${JOB_COLUMNS}`,
			[
				jobType,
				repository.id,
				backend,
				json(envelope),
				hashOf(envelope),
				BACKENDS[backend].worker
					? "Recorded. Nothing has run: a person starts the run once the worker's settings are in place."
					: `Recorded. Nothing can run it: no worker exists for ${BACKENDS[backend].label}.`,
				key,
				actorKey(actor),
			],
		));
	} catch (error) {
		// Two requests for the same repository at the same moment: the index lets one through.
		if (error instanceof Error && /wai_coding_jobs_one_active|unique/i.test(error.message))
			throw new CodingError("conflict", `A coding job is already in hand for ${repository.id}.`);
		throw error;
	}
	const job = toJob(rows[0]);
	await audit(sql, {
		actor,
		action: "coding.job.request",
		subject: job.id,
		outcome: "allowed",
		detail: { jobType, repository: repository.id, baseCommit, backend },
	});
	return job;
}

/** Cancels a job that is still in hand. A returned or rejected job is history and isn't changed. */
export async function cancelCodingJob(
	sql: Sql,
	actor: OperatorActor,
	input: { jobId: string; reason: string },
): Promise<CodingJob> {
	const reason = tidy(input.reason, 500);
	if (!reason) throw new CodingError("invalid", "Say why the job is being cancelled.");
	const { rows } = await sql.query(
		`update wai_coding_jobs set status = 'cancelled', status_detail = $2, updated_at = now()
		 where id = $1 and status = any($3::text[]) returning ${JOB_COLUMNS}`,
		[tidy(input.jobId, 60), `Cancelled: ${reason}`, IN_HAND],
	);
	if (!rows[0]) throw new CodingError("conflict", "That job doesn't exist or is no longer in hand.");
	const job = toJob(rows[0]);
	await audit(sql, {
		actor,
		action: "coding.job.cancel",
		subject: job.id,
		outcome: "allowed",
		detail: { reason },
	});
	return job;
}

// ---- Change packages ----------------------------------------------------------------------------------

export type BuildCheck = { runnerId: string; exitStatus: number };

export type ChangePackage = {
	id: string;
	jobId: string;
	baseCommit: string;
	/** The checksum of exactly this candidate: its base commit, its diff and its list of files. */
	candidateSha256: string;
	diff: string;
	diffSha256: string;
	files: ChangedFile[];
	summary: string;
	buildChecks: BuildCheck[];
	status: "frozen" | "superseded";
	returnedBy: string;
	frozenAt: string;
	decision: "approved" | "rejected" | null;
	decidedBy: string | null;
	decidedAt: string | null;
	decisionNote: string | null;
};

const PACKAGE_COLUMNS = `id, job_id, base_commit, candidate_sha256, diff, diff_sha256, files, summary, build_checks, status,
	returned_by, frozen_at, decision, decided_by, decided_at, decision_note`;

const toPackage = (r: Row): ChangePackage => ({
	id: r.id as string,
	jobId: r.job_id as string,
	baseCommit: r.base_commit as string,
	candidateSha256: r.candidate_sha256 as string,
	diff: r.diff as string,
	diffSha256: r.diff_sha256 as string,
	files: (typeof r.files === "string" ? JSON.parse(r.files) : r.files) as ChangedFile[],
	summary: r.summary as string,
	buildChecks: (typeof r.build_checks === "string"
		? JSON.parse(r.build_checks)
		: r.build_checks) as BuildCheck[],
	status: r.status as ChangePackage["status"],
	returnedBy: r.returned_by as string,
	frozenAt: iso(r.frozen_at) as string,
	decision: (r.decision as ChangePackage["decision"]) ?? null,
	decidedBy: (r.decided_by as string | null) ?? null,
	decidedAt: iso(r.decided_at),
	decisionNote: (r.decision_note as string | null) ?? null,
});

/** The checksum a candidate is known by. The same base, diff and files always give the same one. */
export const candidateHash = (
	baseCommit: string,
	diffSha256: string,
	files: readonly ChangedFile[],
): string =>
	hashOf({
		baseCommit,
		diffSha256,
		files: [...files].sort((a, b) => a.path.localeCompare(b.path)),
	});

export type ReturnedPackage = {
	jobId: string;
	/** The checksum of the envelope the work was done under. It has to be this job's. */
	envelopeSha256: string;
	baseCommit: string;
	diff: string;
	files: readonly ChangedFile[];
	summary: string;
	buildChecks?: readonly BuildCheck[];
};

const refuse = async (sql: Sql, jobId: string, reasons: readonly string[]): Promise<never> => {
	const detail = `Package refused. ${reasons.slice(0, 12).join(" ")}`;
	await sql.query(
		`update wai_coding_jobs set status = 'rejected', status_detail = $2, updated_at = now() where id = $1`,
		[jobId, detail.slice(0, 4000)],
	);
	throw new CodingError("conflict", detail);
};

/**
 * Takes a change package a worker returned, or refuses it whole. Only a worker's own identity can return one: a person or
 * an agent can't. It has to be for this job's exact envelope, start from the envelope's commit, list exactly the files its
 * diff touches, and keep every one of them in scope. A refused package is not stored; the job is marked rejected with every
 * reason. An accepted one is frozen, and replaces any earlier candidate for the job, whose decision does not carry over.
 */
export async function acceptPackage(sql: Sql, worker: Actor, input: ReturnedPackage): Promise<ChangePackage> {
	if (worker.kind !== "system") {
		await audit(sql, {
			actor: worker,
			action: "coding.package.return",
			subject: tidy(input.jobId, 60),
			outcome: "denied",
			detail: { reason: "worker only" },
		});
		throw new CodingError(
			"forbidden",
			"A change package comes from a coding worker. It can't be entered by hand.",
		);
	}
	const job = await jobById(sql, input.jobId);
	if (job.jobType !== "change_proposal")
		throw new CodingError(
			"conflict",
			"That job wasn't asked to change anything, so it can't return a change.",
		);
	if (!IN_HAND.includes(job.status) && job.status !== "returned")
		throw new CodingError("conflict", `That job is ${job.status}. A package for it is not accepted.`);
	// A package for another envelope is a replay, a mix-up or tampering. None of them is accepted.
	if (input.envelopeSha256 !== job.envelopeSha256)
		throw new CodingError("conflict", "That package was made under a different envelope from this job's.");

	const reasons: string[] = [];
	const baseCommit = tidy(input.baseCommit, 64).toLowerCase();
	if (baseCommit !== job.envelope.baseCommit)
		reasons.push(
			`It starts from commit ${baseCommit || "(none)"}, not the ${job.envelope.baseCommit} it was given.`,
		);
	const diff = typeof input.diff === "string" ? input.diff : "";
	if (!diff.trim()) reasons.push("It has no diff.");
	if (diff.length > 600_000) reasons.push("Its diff is larger than 600,000 characters.");
	const summary = tidy(input.summary, 2000);
	if (!summary) reasons.push("It has no summary of what was changed.");
	const checked = checkChangedFiles(input.files, {
		scope: job.envelope.changeScope,
		protectedPaths: job.envelope.protectedPaths,
	});
	reasons.push(...checked.violations);
	// The list of files has to be the whole truth about the diff.
	const listed = [
		...new Set(
			checked.files.flatMap((file) => [file.path, ...(file.previousPath ? [file.previousPath] : [])]),
		),
	].sort();
	const touched = pathsInDiff(diff);
	const unlisted = touched.filter((path) => !listed.includes(path));
	const absent = listed.filter((path) => !touched.includes(path));
	if (unlisted.length)
		reasons.push(`Its diff changes files it doesn't list: ${unlisted.slice(0, 8).join(", ")}.`);
	if (absent.length) reasons.push(`It lists files its diff doesn't touch: ${absent.slice(0, 8).join(", ")}.`);
	const buildChecks = (input.buildChecks ?? []).map((check) => ({
		runnerId: tidy(check.runnerId, 60),
		exitStatus: Number(check.exitStatus),
	}));
	for (const check of buildChecks) {
		if (!job.envelope.checkRunners.includes(check.runnerId as RunnerId))
			reasons.push(
				`It reports a check, ${check.runnerId || "(unnamed)"}, that this job wasn't allowed to run.`,
			);
		if (!Number.isInteger(check.exitStatus)) reasons.push(`Check ${check.runnerId} has no exit status.`);
	}
	if (reasons.length) return refuse(sql, job.id, reasons);

	const diffSha256 = sha256Hex(diff);
	const candidateSha256 = candidateHash(baseCommit, diffSha256, checked.files);
	const stored = await sql.transaction(async (tx) => {
		await jobById(tx, job.id, true);
		const same = await tx.query(
			`select ${PACKAGE_COLUMNS} from wai_change_packages where job_id = $1 and candidate_sha256 = $2`,
			[job.id, candidateSha256],
		);
		// The same candidate returned again is the same package.
		if (same.rows[0]) return { pkg: toPackage(same.rows[0]), fresh: false };
		await tx.query(
			`update wai_change_packages set status = 'superseded' where job_id = $1 and status = 'frozen'`,
			[job.id],
		);
		const { rows } = await tx.query(
			`insert into wai_change_packages (job_id, base_commit, candidate_sha256, diff, diff_sha256, files, summary, build_checks,
				returned_by)
			 values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9) returning ${PACKAGE_COLUMNS}`,
			[
				job.id,
				baseCommit,
				candidateSha256,
				diff,
				diffSha256,
				json(checked.files),
				summary,
				json(buildChecks),
				actorKey(worker),
			],
		);
		await tx.query(
			`update wai_coding_jobs set status = 'returned', status_detail = $2, updated_at = now() where id = $1`,
			[
				job.id,
				`A change to ${checked.files.length} file${checked.files.length === 1 ? "" : "s"} was returned and frozen.`,
			],
		);
		return { pkg: toPackage(rows[0]), fresh: true };
	});
	if (stored.fresh)
		await audit(sql, {
			actor: worker,
			action: "coding.package.return",
			subject: stored.pkg.id,
			outcome: "allowed",
			detail: { job: job.id, candidate: candidateSha256, files: checked.files.length },
		});
	return stored.pkg;
}

// ---- Verify's results and the owner's decision --------------------------------------------------------

export type Verification = {
	id: string;
	packageId: string;
	candidateSha256: string;
	runnerId: string;
	exitStatus: number;
	passed: boolean;
	environment: string;
	evidenceSha256: string | null;
	summary: string | null;
	recordedAt: string;
};

const VERIFICATION_COLUMNS = `id, package_id, candidate_sha256, runner_id, exit_status, passed, environment, evidence_sha256, summary,
	recorded_at`;

const toVerification = (r: Row): Verification => ({
	id: r.id as string,
	packageId: r.package_id as string,
	candidateSha256: r.candidate_sha256 as string,
	runnerId: r.runner_id as string,
	exitStatus: Number(r.exit_status),
	passed: r.passed === true,
	environment: r.environment as string,
	evidenceSha256: (r.evidence_sha256 as string | null) ?? null,
	summary: (r.summary as string | null) ?? null,
	recordedAt: iso(r.recorded_at) as string,
});

async function packageById(sql: Sql, id: string, lock = false): Promise<ChangePackage> {
	const { rows } = await sql.query(
		`select ${PACKAGE_COLUMNS} from wai_change_packages where id = $1 ${lock ? "for update" : ""}`,
		[tidy(id, 60)],
	);
	if (!rows[0]) throw new CodingError("not_found", "That change package doesn't exist.");
	return toPackage(rows[0]);
}

/** Refuses anything aimed at a candidate that is no longer the one on file. */
function mustBeCurrent(pkg: ChangePackage, candidateSha256: string): void {
	if (pkg.status !== "frozen")
		throw new CodingError(
			"conflict",
			"That candidate has been replaced by a newer one. Nothing more is recorded on it.",
		);
	if (tidy(candidateSha256, 80) !== pkg.candidateSha256)
		throw new CodingError(
			"conflict",
			"That isn't the candidate on file. A result or a decision is for one exact candidate and doesn't carry over.",
		);
}

/**
 * Verify records the outcome of one registered check against one exact candidate. Only Verify can: Build can't write
 * Verify's result, and neither can a person. A check that wasn't in the job's envelope isn't accepted.
 */
export async function recordVerification(
	sql: Sql,
	actor: Actor,
	input: {
		packageId: string;
		candidateSha256: string;
		runnerId: string;
		exitStatus: number;
		environment: string;
		evidenceSha256?: string;
		summary?: string;
	},
): Promise<Verification> {
	if (actor.kind !== "agent" || actor.roleId !== "verify") {
		await audit(sql, {
			actor,
			action: "coding.verification.record",
			subject: tidy(input.packageId, 60),
			outcome: "denied",
			detail: { reason: "verify only" },
		});
		throw new CodingError("forbidden", "Only Verify records the result of a check on a candidate.");
	}
	const pkg = await packageById(sql, input.packageId);
	mustBeCurrent(pkg, input.candidateSha256);
	const job = await jobById(sql, pkg.jobId);
	if (!job.envelope.checkRunners.includes(input.runnerId as RunnerId))
		throw new CodingError(
			"invalid",
			`${tidy(input.runnerId, 60) || "That"} isn't a check this job asked for.`,
		);
	if (!Number.isInteger(input.exitStatus))
		throw new CodingError(
			"invalid",
			"Record the check's real exit status. A pass is never recorded without one.",
		);
	const environment = tidy(input.environment, 300);
	if (!environment)
		throw new CodingError("invalid", "Say where the check ran: the worker image and runner version.");
	const evidence = tidy(input.evidenceSha256, 80) || null;
	if (evidence && !/^[0-9a-f]{64}$/.test(evidence))
		throw new CodingError("invalid", "The evidence checksum must be a SHA-256, 64 hexadecimal characters.");
	const { rows } = await sql.query(
		`insert into wai_package_verifications (package_id, candidate_sha256, runner_id, exit_status, passed, environment,
			evidence_sha256, summary, recorded_by)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${VERIFICATION_COLUMNS}`,
		[
			pkg.id,
			pkg.candidateSha256,
			input.runnerId,
			input.exitStatus,
			input.exitStatus === 0,
			environment,
			evidence,
			tidy(input.summary, 2000) || null,
			actorKey(actor),
		],
	);
	const verification = toVerification(rows[0]);
	await audit(sql, {
		actor,
		action: "coding.verification.record",
		subject: pkg.id,
		outcome: "allowed",
		detail: { runner: verification.runnerId, exitStatus: verification.exitStatus },
	});
	return verification;
}

export type CheckStanding = {
	runnerId: RunnerId;
	/** The newest result Verify recorded for this candidate, or null when it hasn't run. */
	latest: Verification | null;
	state: "passed" | "failed" | "not_run";
};

/** How a candidate stands against the checks its job asked for, going by Verify's newest result for each. */
export function checkStanding(
	job: CodingJob,
	pkg: ChangePackage,
	verifications: readonly Verification[],
): CheckStanding[] {
	const mine = verifications
		.filter((v) => v.packageId === pkg.id && v.candidateSha256 === pkg.candidateSha256)
		.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
	return job.envelope.checkRunners.map((runnerId) => {
		const latest = mine.find((v) => v.runnerId === runnerId) ?? null;
		return { runnerId, latest, state: latest ? (latest.passed ? "passed" : "failed") : "not_run" };
	});
}

/**
 * The owner's decision on one exact candidate. To approve, Verify's newest result for every check the job asked for has to
 * be a pass on this candidate. An approval is a recorded decision: nothing is merged, pushed or deployed by it.
 */
export async function reviewPackage(
	sql: Sql,
	actor: OperatorActor,
	input: { packageId: string; candidateSha256: string; decision: string; note: string },
): Promise<ChangePackage> {
	const decision = (["approved", "rejected"] as const).find((d) => d === input.decision);
	if (!decision) throw new CodingError("invalid", "A change is approved or rejected.");
	if (actor.role !== "owner") {
		await audit(sql, {
			actor,
			action: `coding.package.${decision}`,
			subject: tidy(input.packageId, 60),
			outcome: "denied",
			detail: { reason: "owner only" },
		});
		throw new CodingError("forbidden", "Only the owner can approve or reject a change.");
	}
	const note = tidy(input.note, 1000);
	if (!note) throw new CodingError("invalid", "Say on what basis.");
	const pkg = await sql.transaction(async (tx) => {
		const current = await packageById(tx, input.packageId, true);
		mustBeCurrent(current, input.candidateSha256);
		if (current.decision)
			throw new CodingError("conflict", `That candidate has already been ${current.decision}.`);
		if (decision === "approved") {
			const job = await jobById(tx, current.jobId);
			const recorded = await tx.query(
				`select ${VERIFICATION_COLUMNS} from wai_package_verifications where package_id = $1`,
				[current.id],
			);
			const waiting = checkStanding(job, current, recorded.rows.map(toVerification)).filter(
				(check) => check.state !== "passed",
			);
			if (waiting.length)
				throw new CodingError(
					"conflict",
					`It can't be approved yet. ${waiting
						.map(
							(check) =>
								`${CHECK_RUNNERS[check.runnerId]}: ${check.state === "failed" ? "failed" : "not run by Verify"}.`,
						)
						.join(" ")}`,
				);
		}
		const { rows } = await tx.query(
			`update wai_change_packages set decision = $2, decided_by = $3, decided_at = now(), decision_note = $4,
				decision_candidate_sha256 = candidate_sha256
			 where id = $1 and decision is null returning ${PACKAGE_COLUMNS}`,
			[current.id, decision, actorKey(actor), note],
		);
		return toPackage(rows[0]);
	});
	await audit(sql, {
		actor,
		action: `coding.package.${decision}`,
		subject: pkg.id,
		outcome: "allowed",
		detail: { candidate: pkg.candidateSha256, note },
	});
	return pkg;
}

/** One job with its candidates, newest first, and Verify's results for them. */
export async function getCodingJob(
	sql: Sql,
	id: string,
): Promise<{ job: CodingJob; packages: ChangePackage[]; verifications: Verification[] } | null> {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const found = await sql.query(`select ${JOB_COLUMNS} from wai_coding_jobs where id = $1`, [id]);
	if (!found.rows[0]) return null;
	const packages = await sql.query(
		`select ${PACKAGE_COLUMNS} from wai_change_packages where job_id = $1 order by frozen_at desc`,
		[id],
	);
	const verifications = packages.rows.length
		? await sql.query(
				`select ${VERIFICATION_COLUMNS} from wai_package_verifications where package_id = any($1::uuid[]) order by recorded_at desc`,
				[packages.rows.map((r) => r.id)],
			)
		: { rows: [] as Row[] };
	return {
		job: toJob(found.rows[0]),
		packages: packages.rows.map(toPackage),
		verifications: verifications.rows.map(toVerification),
	};
}

/** Frozen candidates nobody has decided on yet, oldest first, each with the job it belongs to. */
export async function listUndecidedPackages(
	sql: Sql,
): Promise<Array<{ job: CodingJob; pkg: ChangePackage }>> {
	const packages = await sql.query(
		`select ${PACKAGE_COLUMNS} from wai_change_packages where status = 'frozen' and decision is null order by frozen_at limit 100`,
	);
	if (packages.rows.length === 0) return [];
	const jobs = await sql.query(`select ${JOB_COLUMNS} from wai_coding_jobs where id = any($1::uuid[])`, [
		packages.rows.map((r) => r.job_id),
	]);
	const byId = new Map(jobs.rows.map((r) => [r.id as string, toJob(r)]));
	return packages.rows.flatMap((r) => {
		const job = byId.get(r.job_id as string);
		return job ? [{ job, pkg: toPackage(r) }] : [];
	});
}
