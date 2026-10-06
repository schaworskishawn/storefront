"use client";

import { type FC } from "react";
import { useTranslations } from "next-intl";
import { InstallmentsSchedule } from "@/checkout/components/payment/installments/installments-schedule";
import { getFormattedMoney } from "@/checkout/lib/utils/money";
import { type InstallmentPlan } from "@/lib/installments/plan";

type InstallmentsNoticeProps = {
	plan: InstallmentPlan;
	currency: string;
	/** When the order was placed: the due dates count from this day, so the page shows the same dates as the emails. */
	orderedAt: Date;
};

/** On the confirmation of a Pay in 4 order: what was paid today and when the rest is charged. */
export const InstallmentsNotice: FC<InstallmentsNoticeProps> = ({ plan, currency, orderedAt }) => {
	const t = useTranslations("checkout.confirmation.installments");

	return (
		<div className="space-y-3 rounded-lg border border-border bg-card p-4 md:p-5">
			<div>
				<h2 className="font-semibold">{t("title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("intro", { deposit: getFormattedMoney({ amount: plan.deposit, currency }) })}
				</p>
			</div>
			<InstallmentsSchedule plan={plan} currency={currency} orderedAt={orderedAt} />
			<p className="text-sm text-muted-foreground">{t("outro")}</p>
		</div>
	);
};
