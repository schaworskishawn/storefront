import type { Metadata } from "next";
import Link from "next/link";
import { MOVEMENT_LABELS, listMovements, verifyLedger } from "@/lib/worldwide-ai/lab/inventory";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import {
	Bullets,
	Card,
	DataTable,
	Empty,
	Notice,
	PageHeader,
	Pill,
	When,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Stock movements" };

const LAB = `${WORKSPACE_PATH}/lab`;

/** The ledger: every movement of ingredient stock, newest first, and a check that it still adds up to the balances. */
export default async function MovementsPage() {
	const workspace = await getWorkspace();
	const { sql } = workspace.runtime;
	const now = workspace.runtime.now();
	const [movements, problems] = await Promise.all([listMovements(sql, { limit: 200 }), verifyLedger(sql)]);

	return (
		<>
			<PageHeader
				title="Stock movements"
				crumbs={[{ label: "E-Liquid Lab", href: LAB }, { label: "Stock movements" }]}
				lead="Every receipt, reservation, use, return, loss, move and correction of ingredient stock. A line is never changed or removed. Only a person can add one."
				actions={
					<Link href={`${LAB}/ingredients`} className="wai-btn">
						Ingredients
					</Link>
				}
			/>
			<div className="wai-stack">
				{problems.length === 0 ? (
					<Notice tone="good" title="The ledger adds up.">
						For every lot, the movements recorded here add up to the balance shown for it.
					</Notice>
				) : (
					<Notice tone="bad" title="A balance doesn't match its ledger.">
						<Bullets items={problems.map((problem) => `Lot ${problem.lotCode}: ${problem.problem}.`)} />
						Don’t rely on these lots until the owner has looked into it.
					</Notice>
				)}
				<Card title="Movements" aside={<Pill>{movements.length}</Pill>}>
					{movements.length === 0 ? (
						<Empty>Nothing has moved yet.</Empty>
					) : (
						<DataTable
							caption="The newest 200. Balances are the lot's own, straight after each line."
							columns={[
								"When",
								"Ingredient",
								"Lot",
								"What",
								"Quantity",
								"On hand after",
								"Reserved after",
								"By",
								"For / why",
							]}
							rows={movements.map((m) => [
								<When key="w" at={m.at} now={now} />,
								<Link key="i" href={`${LAB}/ingredients/${m.ingredientId}`}>
									{m.ingredientName}
								</Link>,
								m.lotCode,
								MOVEMENT_LABELS[m.kind],
								m.kind === "transfer"
									? `${m.fromLocation ?? "—"} → ${m.toLocation}`
									: m.quantity === "0"
										? "—"
										: `${m.kind === "correction" ? m.deltaOnHand : m.quantity} ${m.unit}`,
								`${m.onHandAfter} ${m.unit}`,
								`${m.reservedAfter} ${m.unit}`,
								"A person",
								<span key="r">
									{[m.reference, m.reason].filter(Boolean).join(" · ") || "—"}
									{m.discrepancy && (
										<>
											<br />
											<Pill tone="warn">Check</Pill> {m.discrepancy}
										</>
									)}
								</span>,
							])}
						/>
					)}
				</Card>
			</div>
		</>
	);
}
