import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { describeProgram } from "@/lib/rewards/program-copy";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { WvRewards } from "@/ui/sections/wv-home/wv-rewards";
import { RewardsAccount, RewardsAccountSkeleton } from "@/ui/sections/wv-home/wv-rewards-account";

export const metadata: Metadata = {
	title: "Vapor Tokens Rewards — Worldwide Vapor",
	description: describeProgram(readRewardsConfig()),
};

/** The program page. Like the account's token history and the checkout panel, it only exists while rewards are switched on. */
export default function RewardsPage() {
	const config = readRewardsConfig();
	if (!config.enabled) notFound();

	return (
		<WvRewards
			config={config}
			account={
				<Suspense fallback={<RewardsAccountSkeleton />}>
					<RewardsAccount />
				</Suspense>
			}
		/>
	);
}
