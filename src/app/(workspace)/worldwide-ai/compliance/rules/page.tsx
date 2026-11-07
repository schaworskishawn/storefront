import type { Metadata } from "next";
import Link from "next/link";
import {
	RULE_KINDS,
	STANDING_LABELS,
	STARTING_SOURCES,
	listRules,
	type RuleStanding,
} from "@/lib/worldwide-ai/compliance/rules";
import { formatDay, opsDayKey } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { complianceAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { VERSION_FIELDS } from "@/ui/sections/worldwide-ai/compliance-fields";
import { ButtonForm, FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Card,
	DataTable,
	Empty,
	Notice,
	PageHeader,
	Pill,
	Stat,
	type Tone,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Rule register" };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;
const TONES: Record<RuleStanding, Tone> = {
	approved: "good",
	review_due: "warn",
	not_in_effect: "plain",
	awaiting_review: "info",
	not_approved: "warn",
	withdrawn: "plain",
};

/** The rule register: what the business tracks, where each rule was read, and whether an approved reading of it applies. */
export default async function RulesPage() {
	const workspace = await getWorkspace();
	const today = opsDayKey(workspace.runtime.now());
	const rules = await listRules(workspace.runtime.sql, today);
	const count = (standing: RuleStanding) => rules.filter((rule) => rule.standing === standing).length;
	const queued = STARTING_SOURCES.filter((source) => rules.some((rule) => rule.code === source.code)).length;

	return (
		<>
			<PageHeader
				title="Rule register"
				crumbs={[{ label: "Canadian Compliance", href: COMPLIANCE }, { label: "Rule register" }]}
				lead="The requirements the business tracks, each read from a named source by a person, in versions. A draft guides nothing. Only the owner approves a version, with a decision on whether it applies here, why, from when, and when it is next looked at."
				actions={
					<Link href={`${COMPLIANCE}/licences`} className="wai-btn">
						Licences
					</Link>
				}
			/>
			<Notice tone="info" title="This is a register, not advice.">
				It holds what people read and decided, so that work relying on a rule can name the version it relied
				on. It doesn’t decide what the law requires or that the business complies with it, and the list is not
				every rule that may apply.
			</Notice>
			<div className="wai-grid wai-grid--3" style={{ margin: "16px 0" }}>
				<Stat value={count("approved") + count("review_due")} label="Approved" />
				<Stat value={count("awaiting_review")} label="Drafts waiting for the owner" />
				<Stat value={count("review_due")} label="Due to be looked at again" />
			</div>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Rules" aside={<Pill>{rules.length}</Pill>}>
						{rules.length === 0 ? (
							<Empty>No rule has been recorded yet.</Empty>
						) : (
							<DataTable
								caption="By code. Open a rule to see every version and decide on a draft."
								columns={["Code", "Rule", "Whose", "Kind", "Where it stands", "Next review"]}
								rows={rules.map((rule) => [
									<Link key="c" href={`${COMPLIANCE}/rules/${rule.id}`} className="wai-mono">
										{rule.code}
									</Link>,
									rule.title,
									rule.jurisdiction,
									RULE_KINDS[(rule.current ?? rule.draft)?.kind ?? "guidance"],
									<Pill key="s" tone={TONES[rule.standing]}>
										{STANDING_LABELS[rule.standing]}
									</Pill>,
									rule.current?.nextReviewOn ? formatDay(rule.current.nextReviewOn) : "—",
								])}
							/>
						)}
					</Card>
					<Card title="Starting sources">
						<p className="wai-help" style={{ marginTop: 0 }}>
							The workspace’s brief names {STARTING_SOURCES.length} official pages as places to start. They
							can go into the register as drafts that say they haven’t been read: someone reads the current
							version and writes down what it asks, and the owner decides whether it applies. Manitoba and
							other destination rules are not among them and have to be found separately.
						</p>
						<ul className="wai-small">
							{STARTING_SOURCES.map((source) => (
								<li key={source.code}>
									{source.sourceTitle}
									{rules.some((rule) => rule.code === source.code) ? " (in the register)" : ""}
								</li>
							))}
						</ul>
						{workspace.isOwner && queued < STARTING_SOURCES.length ? (
							<ButtonForm
								action={complianceAction}
								hidden={{ intent: "rule.queue" }}
								label="Add them as unread drafts"
								idPrefix="queue"
							/>
						) : (
							!workspace.isOwner && <p className="wai-muted wai-small">Only the owner can add them.</p>
						)}
					</Card>
				</div>
				<div className="wai-stack">
					<Card title="Record a rule">
						<FieldsForm
							action={complianceAction}
							hidden={{ intent: "rule.create" }}
							idPrefix="rule"
							submit="Record as a draft"
							fields={[
								{
									name: "code",
									label: "Code",
									kind: "text",
									required: true,
									maxLength: 48,
									placeholder: "CRA-VAPING-RETURNS",
								},
								{ name: "title", label: "Title", kind: "text", required: true, maxLength: 300 },
								{
									name: "jurisdiction",
									label: "Whose rule",
									kind: "text",
									required: true,
									maxLength: 120,
									placeholder: "Canada (federal), Manitoba, our own",
								},
								{
									name: "ownerLabel",
									label: "Who looks after it",
									kind: "text",
									required: true,
									maxLength: 120,
									placeholder: "Comply, Duty, a person",
								},
								...VERSION_FIELDS,
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
