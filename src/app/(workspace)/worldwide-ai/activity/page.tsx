import type { Metadata } from "next";
import { listAudit } from "@/lib/worldwide-ai/audit";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { DataTable, Empty, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Activity" };

/** Who did what, newest first, including what was refused. Details are redacted before they are stored. */
export default async function ActivityPage() {
	const workspace = await getWorkspace();
	const entries = await listAudit(workspace.runtime.sql, 200);
	const now = workspace.runtime.now();
	const who = (actor: string) =>
		actor === workspace.viewer
			? "You"
			: actor.startsWith("operator:")
				? "A person"
				: actor.startsWith("agent:")
					? `Agent ${actor.slice(6)}`
					: actor.startsWith("system:")
						? `System (${actor.slice(7)})`
						: "Not signed in";
	const denied = entries.filter((entry) => entry.outcome === "denied").length;

	return (
		<>
			<PageHeader
				title="Activity"
				lead={`The last ${entries.length} recorded actions. ${denied} ${denied === 1 ? "was" : "were"} refused. Secrets and personal details are removed before anything is written here.`}
			/>
			{entries.length === 0 ? (
				<Empty>Nothing has been recorded yet.</Empty>
			) : (
				<DataTable
					caption="Refused attempts are recorded as well as allowed ones."
					columns={["When", "Who", "Role", "Action", "Subject", "Outcome"]}
					rows={entries.map((entry) => [
						<When key="w" at={entry.at} now={now} />,
						who(entry.actor),
						entry.actorRole ?? "—",
						<span key="a" className="wai-mono">
							{entry.action}
						</span>,
						<span key="s" className="wai-mono">
							{entry.subject
								? entry.subject.length > 24
									? `${entry.subject.slice(0, 8)}…`
									: entry.subject
								: "—"}
						</span>,
						<Pill key="o" tone={entry.outcome === "allowed" ? "good" : "bad"}>
							{entry.outcome === "allowed" ? "Allowed" : "Refused"}
						</Pill>,
					])}
				/>
			)}
		</>
	);
}
