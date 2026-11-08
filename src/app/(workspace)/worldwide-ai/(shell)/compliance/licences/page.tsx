import type { Metadata } from "next";
import Link from "next/link";
import {
	LICENCE_STANDING_LABELS,
	LICENCE_STATUSES,
	listLicences,
} from "@/lib/worldwide-ai/compliance/licences";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { complianceAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { LICENCE_FIELDS, LICENCE_TONES } from "@/ui/sections/worldwide-ai/compliance-fields";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, Notice, PageHeader, Pill, Stat } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Licences" };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;

/** The licence calendar: what the business holds, what each covers, and when each has to be renewed. */
export default async function LicencesPage() {
	const workspace = await getWorkspace();
	const today = opsDayKey(workspace.runtime.now());
	const licences = await listLicences(workspace.runtime.sql, today);
	const due = licences.filter((l) =>
		["renewal_due", "renewal_overdue", "expired"].includes(l.standing),
	).length;
	const questions = licences.reduce((sum, l) => sum + l.openQuestions, 0);

	return (
		<>
			<PageHeader
				title="Licences"
				crumbs={[{ label: "Canadian Compliance", href: COMPLIANCE }, { label: "Licences" }]}
				lead="The licences, registrations and permits the business holds or has applied for, as each reads on the document, with the renewal dates entered from it and the questions nobody has answered about what it covers."
				actions={
					<Link href={`${COMPLIANCE}/rules`} className="wai-btn">
						Rule register
					</Link>
				}
			/>
			<Notice tone="info">
				Every date here was entered by a person from the licence or the authority. Nothing is filled in from a
				rule of thumb, and there is no list of licences the business is assumed to need.
			</Notice>
			<div className="wai-grid wai-grid--3" style={{ margin: "16px 0" }}>
				<Stat value={licences.filter((l) => l.status === "held").length} label="Held" />
				<Stat value={due} label="Renewal coming up, passed, or expired" />
				<Stat value={questions} label="Open questions about scope" />
			</div>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="On record" aside={<Pill>{licences.length}</Pill>}>
						{licences.length === 0 ? (
							<Empty>No licence has been recorded yet.</Empty>
						) : (
							<DataTable
								caption="By name. Open one to record a renewal, a change or a question."
								columns={[
									"Licence",
									"Issued by",
									"Status",
									"Renewal or expiry",
									"Where it stands",
									"Questions",
								]}
								rows={licences.map((licence) => [
									<Link key="n" href={`${COMPLIANCE}/licences/${licence.id}`}>
										{licence.name}
									</Link>,
									licence.authority,
									LICENCE_STATUSES[licence.status],
									licence.renewBy
										? `Renew by ${formatDay(licence.renewBy)}`
										: licence.expiresOn
											? `Expires ${formatDay(licence.expiresOn)}`
											: "—",
									<Pill key="s" tone={LICENCE_TONES[licence.standing]}>
										{LICENCE_STANDING_LABELS[licence.standing]}
										{licence.daysLeft !== null && licence.daysLeft >= 0 ? `, ${licence.daysLeft} days` : ""}
									</Pill>,
									licence.openQuestions ? <Pill tone="warn">{licence.openQuestions} open</Pill> : "—",
								])}
							/>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Record a licence">
						{workspace.isOwner ? (
							<FieldsForm
								action={complianceAction}
								hidden={{ intent: "licence.record" }}
								idPrefix="licence"
								submit="Record it"
								initial={{ status: "held" }}
								fields={LICENCE_FIELDS}
							/>
						) : (
							<p className="wai-muted wai-small" style={{ margin: 0 }}>
								Only the owner records a licence. Anyone can ask a question about one on its page.
							</p>
						)}
					</Card>
				</div>
			</div>
		</>
	);
}
