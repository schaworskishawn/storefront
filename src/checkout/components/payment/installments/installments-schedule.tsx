"use client";

import { useMemo, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { getFormattedMoney } from "@/checkout/lib/utils/money";
import { localeConfig } from "@/config/locale";
import { laterPaymentDates, type InstallmentPlan } from "@/lib/installments/plan";

type InstallmentsScheduleProps = {
	plan: InstallmentPlan;
	currency: string;
	/** The day the schedule counts from: the order's date. Defaults to today, which is when a checkout becomes an order. */
	orderedAt?: Date;
};

/** The four payments of a Pay in 4 plan, with dates and amounts, shown before the shopper agrees to it and after the order. */
export const InstallmentsSchedule: FC<InstallmentsScheduleProps> = ({ plan, currency, orderedAt }) => {
	const t = useTranslations("checkout.payment.installments");
	const [today] = useState(() => new Date());
	const dates = useMemo(() => laterPaymentDates(orderedAt ?? today), [orderedAt, today]);

	const formatDate = (isoDate: string) =>
		new Intl.DateTimeFormat(localeConfig.default, { dateStyle: "medium", timeZone: "UTC" }).format(
			new Date(`${isoDate}T00:00:00Z`),
		);

	const rows = [
		{ label: t("today"), amount: plan.deposit },
		...dates.map((date) => ({ label: formatDate(date), amount: plan.installment })),
	];

	return (
		<div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-4">
			<p className="text-sm font-semibold">{t("scheduleTitle")}</p>
			<ol className="space-y-1.5 text-sm">
				{rows.map((row, index) => (
					<li key={row.label} className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">
							{index + 1}/4 · {row.label}
						</span>
						<span className="font-medium tabular-nums">
							{getFormattedMoney({ amount: row.amount, currency })}
						</span>
					</li>
				))}
			</ol>
			<p className="text-xs text-muted-foreground">{t("noFees")}</p>
		</div>
	);
};
