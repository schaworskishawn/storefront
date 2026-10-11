import type { Metadata } from "next";
import Link from "next/link";
import {
	EXCEPTION_LABELS,
	SCAN_SOURCES,
	TECHNOLOGIES,
	WORKFLOWS,
	listExceptions,
	listScans,
} from "@/lib/worldwide-ai/rfid/registry";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { rfidAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, Notice, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Scans and exceptions" };

const RFID = `${WORKSPACE_PATH}/rfid`;

/** Scans as they were recorded, and the ones the registry couldn't account for. */
export default async function ScansPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [scans, exceptions] = await Promise.all([listScans(sql, { limit: 100 }), listExceptions(sql)]);

	return (
		<>
			<PageHeader
				title="Scans and exceptions"
				crumbs={[{ label: "RFID & NFC", href: RFID }, { label: "Scans and exceptions" }]}
				lead="A scan is an observation: this tag was read at this place at this time. It moves no stock, puts nothing on a shelf, and says nothing about whether a product is genuine. A tag nobody registered, or one that was revoked or retired, becomes an exception for a person to resolve."
				actions={
					<Link href={`${RFID}/tags`} className="wai-btn">
						Tags
					</Link>
				}
			/>
			<Notice tone="info" title="No reader is connected.">
				Scans are typed in here, one at a time, or reconciled from a reader’s export by Link on the RFID &amp;
				NFC page. Nothing on this page talks to a reader.
			</Notice>
			<div className="wai-split" style={{ marginTop: 16 }}>
				<div className="wai-stack">
					<Card
						title="Open exceptions"
						aside={<Pill tone={exceptions.length ? "warn" : "plain"}>{exceptions.length}</Pill>}
						accent={exceptions.length > 0}
					>
						{exceptions.length === 0 ? (
							<Empty>Every scan on record is of a registered tag that is in use.</Empty>
						) : (
							<ul className="wai-list">
								{exceptions.map((exception) => (
									<li key={exception.id} style={{ display: "block" }}>
										<div className="wai-row" style={{ gap: 8, flexWrap: "wrap" }}>
											<strong className="wai-mono">{exception.uid}</strong>
											<Pill tone={exception.kind === "revoked_seen" ? "bad" : "warn"}>
												{EXCEPTION_LABELS[exception.kind]}
											</Pill>
											<Pill>{TECHNOLOGIES[exception.technology]}</Pill>
										</div>
										<p className="wai-small" style={{ margin: "4px 0" }}>
											{exception.detail}
										</p>
										<p className="wai-muted wai-small" style={{ margin: "4px 0" }}>
											Seen {exception.seen} time{exception.seen === 1 ? "" : "s"}, last{" "}
											<When at={exception.lastSeenAt} now={now} />.
										</p>
										<ButtonForm
											action={rfidAction}
											hidden={{ intent: "exception.resolve", exceptionId: exception.id }}
											label="Resolve"
											small
											note={{ label: "What it turned out to be, and what was done", required: true }}
											idPrefix={`resolve-${exception.id}`}
										/>
									</li>
								))}
							</ul>
						)}
					</Card>
					<Card title="Recent scans" aside={<Pill>{scans.length}</Pill>}>
						{scans.length === 0 ? (
							<Empty>No scan has been recorded.</Empty>
						) : (
							<DataTable
								caption="Newest first, by when the tag was read, up to 100. A simulated read is labelled as one."
								columns={["Read", "Tag", "Where", "For", "Came from", "Outcome"]}
								rows={scans.map((scan) => [
									<When key="w" at={scan.observedAt} now={now} />,
									scan.tagId ? (
										<Link key="t" href={`${RFID}/tags/${scan.tagId}`} className="wai-mono">
											{scan.uid}
										</Link>
									) : (
										<span key="t" className="wai-mono">
											{scan.uid}
										</span>
									),
									scan.station,
									WORKFLOWS[scan.workflow],
									SCAN_SOURCES[scan.source],
									scan.exceptionId ? <Pill tone="warn">Exception</Pill> : <Pill tone="good">Observed</Pill>,
								])}
							/>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Record a scan">
						<FieldsForm
							action={rfidAction}
							hidden={{ intent: "scan.record" }}
							idPrefix="scan"
							submit="Record the observation"
							fields={[
								{
									name: "technology",
									label: "Kind of tag",
									kind: "select",
									required: true,
									options: Object.entries(TECHNOLOGIES).map(([value, label]) => ({ value, label })),
								},
								{
									name: "uid",
									label: "Identifier read",
									kind: "text",
									required: true,
									maxLength: 200,
								},
								{
									name: "station",
									label: "Where it was read",
									kind: "text",
									required: true,
									maxLength: 160,
									placeholder: "Dock handheld",
								},
								{
									name: "workflow",
									label: "What the scan was for",
									kind: "select",
									required: true,
									options: Object.entries(WORKFLOWS).map(([value, label]) => ({ value, label })),
								},
								{
									name: "source",
									label: "Where it came from",
									kind: "select",
									required: true,
									options: Object.entries(SCAN_SOURCES).map(([value, label]) => ({ value, label })),
									help: "Say so when it is a made-up read for a test. Simulated reads are kept labelled.",
								},
								{
									name: "eventId",
									label: "The reader’s own id for the read",
									kind: "text",
									maxLength: 200,
									help: "If it has one. The same id recorded twice counts once.",
								},
								{ name: "evidence", label: "Evidence", kind: "text", maxLength: 500 },
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
