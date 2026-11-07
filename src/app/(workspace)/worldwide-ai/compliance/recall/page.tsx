import type { Metadata } from "next";
import Link from "next/link";
import {
	START_KINDS,
	listRecallChecks,
	recallStartingPoints,
	traceRecall,
	type RecallTrace,
	type StartKind,
} from "@/lib/worldwide-ai/compliance/recall";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { complianceAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { RecallTraceView } from "@/ui/sections/worldwide-ai/recall-trace";
import { Card, DataTable, Empty, Notice, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Recall trace" };

type Props = { searchParams: Promise<{ kind?: string; id?: string }> };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;
const who = (key: string) => key.replace(/^operator:/, "");

/** Recall tracing: pick a lot, a batch or a packaging run, see everything the records link it to, and save it as a check. */
export default async function RecallPage({ searchParams }: Props) {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const { kind, id } = await searchParams;
	const [points, checks] = await Promise.all([recallStartingPoints(sql), listRecallChecks(sql)]);
	const now = workspace.runtime.now();
	let trace: RecallTrace | null = null;
	let problem: string | null = null;
	if (typeof kind === "string" && typeof id === "string" && id) {
		try {
			trace = await traceRecall(sql, kind, id);
		} catch (error) {
			problem = error instanceof Error ? error.message : "That trace couldn't be worked out.";
		}
	}

	return (
		<>
			<PageHeader
				title="Recall trace"
				crumbs={[{ label: "Canadian Compliance", href: COMPLIANCE }, { label: "Recall trace" }]}
				lead="From an ingredient or packaging lot, a batch, or a packaging run, everything the records link it to: the batches that used a lot, the runs packaged from them, and the lots that went into a run. The trace follows the records and nothing else."
				actions={
					<Link href={`${COMPLIANCE}/stamps`} className="wai-btn">
						Excise stamps
					</Link>
				}
			/>
			<Notice tone="info" title="A trace is not a recall.">
				Deciding on a recall, and telling anyone outside the business, is a person’s decision made outside
				this workspace. The owner can hold every batch a trace reaches, which stops them being packaged or
				released here until the holds are lifted. No notice is sent to anyone.
			</Notice>
			<div className="wai-split" style={{ marginTop: 16 }}>
				<div className="wai-stack">
					{problem && <Notice tone="bad">{problem}</Notice>}
					{trace ? (
						<>
							<h2 className="wai-h2" style={{ margin: 0 }}>
								From {trace.start.label}
							</h2>
							<RecallTraceView trace={trace} />
						</>
					) : (
						<Card title="Start a trace">
							<p className="wai-help" style={{ marginTop: 0 }}>
								Choose where it starts. From a lot it runs downstream, to what used the lot. From a batch or a
								packaging run it also runs back, to the lots that went into it.
							</p>
							{(Object.keys(START_KINDS) as StartKind[]).map((startKind) => (
								<form
									key={startKind}
									method="get"
									className="wai-row"
									style={{ gap: 8, flexWrap: "wrap", marginBottom: 12 }}
								>
									<input type="hidden" name="kind" value={startKind} />
									<label htmlFor={`start-${startKind}`} className="wai-small" style={{ minWidth: 200 }}>
										{START_KINDS[startKind]}
									</label>
									<select
										id={`start-${startKind}`}
										name="id"
										className="wai-input"
										style={{ flex: "1 1 220px" }}
									>
										{points[startKind].length === 0 ? (
											<option value="">None on record</option>
										) : (
											points[startKind].map((point) => (
												<option key={point.id} value={point.id}>
													{point.label}
												</option>
											))
										)}
									</select>
									<button type="submit" className="wai-btn" disabled={points[startKind].length === 0}>
										Trace
									</button>
								</form>
							))}
						</Card>
					)}
				</div>
				<div className="wai-stack">
					{trace && (
						<Card title="Save this trace" accent>
							<FieldsForm
								action={complianceAction}
								hidden={{ intent: "recall.save", startKind: trace.start.kind, startId: trace.start.id }}
								idPrefix="recall"
								submit="Save it"
								fields={[
									{
										name: "reason",
										label: "Why it was run",
										kind: "text",
										required: true,
										maxLength: 1000,
										placeholder: "A complaint, a supplier notice, a practice run",
									},
									...(workspace.isOwner
										? ([
												{
													name: "hold",
													label: "Also hold every batch it reaches",
													kind: "select",
													options: [
														{ value: "no", label: "No, save the trace only" },
														{ value: "yes", label: "Yes, hold them" },
													],
													help: "A batch already held, or cancelled, is left as it is.",
												},
											] as const)
										: []),
								]}
							/>
							<p className="wai-muted wai-small">
								It is saved as it stands now, and doesn’t change when the records do.{" "}
								<Link href={`${COMPLIANCE}/recall`}>Start another trace</Link>
							</p>
						</Card>
					)}
					<Card title="Saved checks" aside={<Pill>{checks.length}</Pill>}>
						{checks.length === 0 ? (
							<Empty>None saved yet.</Empty>
						) : (
							<DataTable
								caption="Newest first."
								columns={["When", "From", "Why", "Holds placed", "By"]}
								rows={checks.map((check) => [
									<Link key="w" href={`${COMPLIANCE}/recall/${check.id}`}>
										<When at={check.runAt} now={now} />
									</Link>,
									check.startLabel,
									check.reason,
									String(check.holdsPlaced),
									who(check.runBy),
								])}
							/>
						)}
					</Card>
				</div>
			</div>
		</>
	);
}
