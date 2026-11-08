import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import {
	CHECK_RUNNERS,
	JOB_TYPES,
	listCodingJobs,
	listRepositories,
	type CodingJob,
} from "@/lib/worldwide-ai/engineering/coding";
import { ALWAYS_PROTECTED } from "@/lib/worldwide-ai/engineering/scope";
import { missingForRun, readCodingConfig } from "@/lib/worldwide-ai/engineering/worker-config";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { codingAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { CodingRequestForm } from "@/ui/sections/worldwide-ai/coding-request-form";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Bullets,
	Card,
	DataTable,
	Empty,
	Notice,
	PageHeader,
	Pill,
	When,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Coding work" };

const ENGINEERING = `${WORKSPACE_PATH}/engineering`;
const STATUS: Record<CodingJob["status"], { label: string; tone: Tone }> = {
	awaiting_backend: { label: "Not started", tone: "warn" },
	queued: { label: "Queued", tone: "info" },
	running: { label: "Running", tone: "info" },
	returned: { label: "Change returned", tone: "good" },
	rejected: { label: "Change refused", tone: "bad" },
	failed: { label: "Stopped, no change", tone: "bad" },
	cancelled: { label: "Cancelled", tone: "plain" },
	outcome_unknown: { label: "Outcome unknown", tone: "warn" },
};

/** Coding work for Build: the repositories it may be asked about, the jobs asked for, and what stands between them and a result. */
export default async function CodingPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [repositories, jobs] = await Promise.all([listRepositories(sql), listCodingJobs(sql)]);
	const active = repositories.filter((repository) => repository.status === "active");
	// Names of settings only. A value is never read out here.
	const config = readCodingConfig(process.env);
	const ready = active.filter((repository) => missingForRun(config, repository.id).length === 0);
	const missing = [...new Set(active.flatMap((repository) => missingForRun(config, repository.id)))];

	return (
		<>
			<PageHeader
				title="Coding work"
				crumbs={[{ label: "Engineering", href: ENGINEERING }, { label: "Coding work" }]}
				lead="Ask Build for a change to a registered repository, see the exact change that comes back, and decide on it once Verify has checked that exact change. The rules are enforced here in code: what a job may touch, which checks it may run, and that a decision is for one candidate only."
			/>
			{active.length > 0 && missing.length === 0 ? (
				<Notice tone="info" title="The worker’s settings are in place.">
					A job can be started from its page. It runs in a throwaway machine on Vercel Sandbox, with the
					Claude Agent SDK, reaching only Anthropic’s API. Settings being in place doesn’t show that a run
					works: only a run does. Starting one spends Anthropic usage and a little Vercel Sandbox time.
				</Notice>
			) : (
				<Notice tone="warn" title="Coding jobs can be recorded, but not run yet.">
					{active.length === 0
						? "No repository is registered. "
						: ready.length > 0
							? `Ready for: ${ready.map((repository) => repository.id).join(", ")}. `
							: ""}
					A job runs in a throwaway machine on Vercel Sandbox once these are set on the server. No patch and
					no check result exists for a job until it has run, and none is ever made up.
					{missing.length > 0 && <Bullets items={missing} />}
				</Notice>
			)}
			<div className="wai-split" style={{ marginTop: 16 }}>
				<div className="wai-stack">
					<Card title="Jobs" aside={<Pill>{jobs.length}</Pill>}>
						{jobs.length === 0 ? (
							<Empty>No coding work has been asked for.</Empty>
						) : (
							<DataTable
								caption="Newest first. One job is in hand per repository at a time."
								columns={["Asked for", "Repository", "Kind", "Where it stands"]}
								rows={jobs.map((job) => [
									<Link key="j" href={`${ENGINEERING}/coding/${job.id}`}>
										<When at={job.createdAt} now={now} />
									</Link>,
									job.repositoryId,
									JOB_TYPES[job.jobType],
									<Pill key="s" tone={STATUS[job.status].tone}>
										{STATUS[job.status].label}
									</Pill>,
								])}
							/>
						)}
					</Card>
					<Card title="Registered repositories" aside={<Pill>{repositories.length}</Pill>}>
						{repositories.length === 0 ? (
							<Empty>No repository is registered, so no coding work can be asked for.</Empty>
						) : (
							<DataTable
								caption="A job names a repository by its id. Its address is the worker's own configuration and is never entered here."
								columns={[
									"Id",
									"Which",
									"Branch",
									"A change may touch",
									"Never, as well as the built-in list",
								]}
								rows={repositories.map((repository) => [
									<span key="i" className="wai-mono">
										{repository.id}
									</span>,
									repository.label,
									repository.defaultBranch,
									repository.changeScope.join(", "),
									repository.protectedPaths.join(", ") || "—",
								])}
							/>
						)}
						{workspace.isOwner ? (
							<details style={{ marginTop: 12 }} open={repositories.length === 0}>
								<summary className="wai-small">Register a repository</summary>
								<div style={{ marginTop: 8 }}>
									<FieldsForm
										action={codingAction}
										hidden={{ intent: "repo.register" }}
										idPrefix="repo"
										submit="Register"
										fields={[
											{
												name: "id",
												label: "Short id",
												kind: "text",
												required: true,
												maxLength: 49,
												placeholder: "storefront",
												help: "Lower-case letters, digits and dashes. Not its address: that is never entered here.",
											},
											{
												name: "label",
												label: "Which repository it is",
												kind: "text",
												required: true,
												maxLength: 160,
											},
											{
												name: "defaultBranch",
												label: "Default branch",
												kind: "text",
												required: true,
												maxLength: 100,
												placeholder: "main",
											},
											{
												name: "changeScope",
												label: "Paths a change may touch",
												kind: "textarea",
												required: true,
												rows: 3,
												placeholder: "src/ui/**",
												help: "One pattern to a line. * is anything within a folder, ** anything across folders. Nothing is in scope unless it is listed.",
											},
											{
												name: "protectedPaths",
												label: "Paths a change may never touch",
												kind: "textarea",
												rows: 2,
												help: "On top of the built-in list beside this form.",
											},
										]}
									/>
								</div>
							</details>
						) : (
							<p className="wai-muted wai-small">Only the owner can register a repository.</p>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Ask for coding work" accent={active.length > 0}>
						{active.length === 0 ? (
							<Empty>Register a repository first.</Empty>
						) : (
							<CodingRequestForm
								action={codingAction}
								idempotencyKey={randomUUID()}
								repositories={active.map((repository) => ({ id: repository.id, label: repository.label }))}
								jobTypes={Object.entries(JOB_TYPES)
									.filter(([id]) => id !== "acceptance_verification")
									.map(([id, label]) => ({ id, label }))}
								checks={Object.entries(CHECK_RUNNERS).map(([id, label]) => ({ id, label }))}
							/>
						)}
					</Card>
					<Card title="Never changed by a coding job">
						<p className="wai-help" style={{ marginTop: 0 }}>
							Whatever a repository’s scope says, a returned change that touches any of these is refused
							whole: secrets, the checks that gate a merge, database migrations, and the code that decides who
							may do what, including these rules.
						</p>
						<ul className="wai-small wai-mono" style={{ margin: 0, paddingLeft: 18 }}>
							{ALWAYS_PROTECTED.map((pattern) => (
								<li key={pattern}>{pattern}</li>
							))}
						</ul>
					</Card>
				</div>
			</div>
		</>
	);
}
