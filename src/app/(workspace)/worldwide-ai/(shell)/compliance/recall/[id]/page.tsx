import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRecallCheck } from "@/lib/worldwide-ai/compliance/recall";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { RecallTraceView } from "@/ui/sections/worldwide-ai/recall-trace";
import { Card, KeyValues, PageHeader, When } from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Recall check" };

type Props = { params: Promise<{ id: string }> };

const COMPLIANCE = `${WORKSPACE_PATH}/compliance`;

/** A saved recall check: the trace exactly as it stood when it was saved, and the holds it placed. */
export default async function RecallCheckPage({ params }: Props) {
	const workspace = await getWorkspace();
	const { id } = await params;
	const check = await getRecallCheck(workspace.runtime.sql, id);
	if (!check) notFound();
	const now = workspace.runtime.now();

	return (
		<>
			<PageHeader
				title={`Recall check from ${check.startLabel}`}
				crumbs={[
					{ label: "Canadian Compliance", href: COMPLIANCE },
					{ label: "Recall trace", href: `${COMPLIANCE}/recall` },
					{ label: "Saved check" },
				]}
				lead="As it stood when it was saved. The records may have changed since: run the trace again to see them as they are now."
			/>
			<div className="wai-stack">
				<Card title="The check">
					<KeyValues
						items={[
							["Saved", <When key="w" at={check.runAt} now={now} />],
							["By", check.runBy.replace(/^operator:/, "")],
							["Why", check.reason],
							["Holds placed", String(check.holdsPlaced)],
							[
								"Checksum of what was saved",
								<span key="s" className="wai-mono">
									{check.resultSha256.slice(0, 16)}…
								</span>,
							],
						]}
					/>
				</Card>
				<RecallTraceView trace={check.result} />
			</div>
		</>
	);
}
