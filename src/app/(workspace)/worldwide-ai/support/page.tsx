import type { Metadata } from "next";
import Link from "next/link";
import { listCases } from "@/lib/worldwide-ai/support/cases";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { createCaseAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { FieldsForm } from "@/ui/sections/worldwide-ai/forms";
import { Card, DataTable, Empty, PageHeader, Pill, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Support Drafts" };

const STATUS_TONE = { open: "info", draft_ready: "good", resolved: "plain", closed: "plain" } as const;

/** Support cases, and the way in to Relay's draft workflow: pick a case, get a reply drafted from approved policy, review it, save it. */
export default async function SupportPage() {
	const workspace = await getWorkspace();
	const cases = await listCases(workspace.runtime.sql, { limit: 100 });
	const now = workspace.runtime.now();
	return (
		<>
			<PageHeader
				title="Support Drafts"
				lead="Pick a case and Relay drafts a reply from the approved policy Atlas finds for it. You review the draft and its exact sources, then save it to the case. Saving never sends anything to the customer."
			/>
			<div className="wai-split">
				<Card title="Cases">
					{cases.length === 0 ? (
						<Empty>No case is on file yet. Add one with the form beside this list.</Empty>
					) : (
						<DataTable
							caption={`${cases.length} ${cases.length === 1 ? "case" : "cases"}, newest first. These are local operational records; the customer's orders stay in Saleor.`}
							columns={["Subject", "From", "Status", "Drafts", "Received"]}
							numeric={[3]}
							rows={cases.map((c) => [
								<Link key="s" href={`${WORKSPACE_PATH}/support/cases/${c.id}`}>
									{c.subject}
								</Link>,
								c.customerName ?? "Not given",
								<Pill key="p" tone={STATUS_TONE[c.status]}>
									{c.status.replace("_", " ")}
								</Pill>,
								c.draftCount,
								<When key="w" at={c.receivedAt} now={now} />,
							])}
						/>
					)}
				</Card>
				<Card title="Add a case">
					<FieldsForm
						action={createCaseAction}
						submit="Add case"
						idPrefix="case"
						fields={[
							{ name: "subject", label: "Subject", kind: "text", required: true, maxLength: 200 },
							{
								name: "message",
								label: "The customer's message",
								kind: "textarea",
								required: true,
								rows: 6,
								help: "Paste it as written. It is treated as information, never as instructions.",
							},
							{ name: "customerName", label: "Customer name", kind: "text", maxLength: 120 },
							{ name: "customerEmail", label: "Customer email", kind: "text", maxLength: 200 },
							{
								name: "orderNumber",
								label: "Order number",
								kind: "text",
								maxLength: 40,
								help: "As the customer gave it. The order itself is not looked up here.",
							},
						]}
					/>
				</Card>
			</div>
		</>
	);
}
