"use client";

import { type FC } from "react";
import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";

type TokensEarnedNoticeProps = {
	tokens: number;
};

/** On the confirmation of a signed-in customer's order: roughly how many Vapor Tokens it earns once it is paid. */
export const TokensEarnedNotice: FC<TokensEarnedNoticeProps> = ({ tokens }) => {
	const t = useTranslations("checkout.confirmation");

	return (
		<p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
			<Coins aria-hidden className="h-4 w-4 shrink-0" />
			{t("tokensEarned", { tokens })}
		</p>
	);
};
