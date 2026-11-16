import {
	INSTALLMENT_INTERVAL_DAYS,
	LATER_PAYMENT_COUNT,
	type InstallmentConfig,
} from "@/lib/installments/plan";

/**
 * The payments page's description of Pay in 4, the store's own buy now pay later (src/lib/installments/plan.ts), worded
 * from its settings so it can't drift from what checkout offers. Null while the plan can't be used: switched off, or not
 * offered in any channel (an empty channel list means nowhere).
 */
export function describePayIn4(config: InstallmentConfig): string | null {
	if (!config.enabled || config.channels.length === 0) return null;
	const money = (amount: number) => `$${amount.toLocaleString("en-US")}`;
	return (
		`Pay in 4: a quarter at checkout, then ${LATER_PAYMENT_COUNT} equal payments every ${INSTALLMENT_INTERVAL_DAYS} ` +
		`days, with no interest or fees. Your order ships once the last payment is in. For orders from ` +
		`${money(config.minTotal)} to ${money(config.maxTotal)}.`
	);
}
