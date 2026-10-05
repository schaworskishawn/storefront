"use client";

import { useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { FlaskConical } from "lucide-react";
import { useCheckoutPaymentMessages } from "@/checkout/hooks/use-checkout-payment-messages";
import {
	DEFAULT_DUMMY_CARD,
	TEST_CARD_NUMBERS,
	getDummyCardEntry,
	setDummyCardEntry,
} from "@/checkout/lib/payment/providers/dummy-card";
import { Input } from "@/ui/components/ui/input";
import { detectBrand, formatCardNumber, formatExpiry, validateCard } from "./wvpay/card-validation";

export interface DummyPaymentPlaceholderProps {
	/** Gateway display name from Saleor (e.g. "Dummy Payment App") */
	gatewayName?: string | null;
}

/**
 * Payment UI for Saleor Dummy Payment test checkouts: a credit card form that takes no real card and makes no real charge.
 * It is pre-filled with an approved test card so Pay still completes in one click; typing one of the test decline numbers
 * makes the simulated charge fail (see `dummy-card.ts`).
 */
export const DummyPaymentPlaceholder: FC<DummyPaymentPlaceholderProps> = ({ gatewayName }) => {
	const tSteps = useTranslations("checkout.steps");
	const t = useTranslations("checkout.payment.dummyCard");
	const paymentMessages = useCheckoutPaymentMessages();
	const label = gatewayName?.trim() || paymentMessages.dummyGateway;

	return (
		<section className="space-y-3">
			<h2 className="text-lg font-semibold">{tSteps("payment")}</h2>
			<p className="flex items-start gap-2 text-sm text-muted-foreground">
				<FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
				<span>
					<span className="text-foreground">{label}</span>
					{" · "}
					{t("intro")}
				</span>
			</p>
			<TestCardForm />
		</section>
	);
};

const TEST_CARD_SHORTCUTS = [
	{ key: "approved", number: TEST_CARD_NUMBERS.approved },
	{ key: "declined", number: TEST_CARD_NUMBERS.declined },
	{ key: "insufficientFunds", number: TEST_CARD_NUMBERS.insufficientFunds },
	{ key: "incorrectCvc", number: TEST_CARD_NUMBERS.incorrectCvc },
] as const;

const BRAND_LABELS = {
	visa: "Visa",
	mastercard: "Mastercard",
	amex: "American Express",
	discover: "Discover",
	unknown: "",
};

type Touched = { number: boolean; expiry: boolean; cvv: boolean };

const TestCardForm: FC = () => {
	const t = useTranslations("checkout.payment.dummyCard");
	const tCard = useTranslations("checkout.payment.wvpay");
	// Starts from the card left by an earlier mount: Pay swaps this whole step for the "processing" screen before it reads the
	// card, and a failed attempt brings the step back — the shopper should find what they typed, not the default card.
	const [initial] = useState(() => getDummyCardEntry() ?? DEFAULT_DUMMY_CARD);
	const [number, setNumber] = useState(initial.number);
	const [expiry, setExpiry] = useState(initial.expiry);
	const [cvv, setCvv] = useState(initial.cvv);
	const [touched, setTouched] = useState<Touched>({ number: false, expiry: false, cvv: false });

	// The checkout's Pay button sits outside this form, so the card is left where `executeDummyPayment` can read it. It is
	// deliberately NOT cleared on unmount: the processing screen unmounts this form just before the card is read.
	useEffect(() => {
		setDummyCardEntry({ number, expiry, cvv });
	}, [number, expiry, cvv]);

	const errors = validateCard({ number, expiry, cvv });
	const brand = detectBrand(number);
	const touch = (field: keyof Touched) => setTouched((previous) => ({ ...previous, [field]: true }));

	return (
		<div className="wv-card space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
			<div className="space-y-1.5">
				<label htmlFor="dummy-number" className="flex items-center justify-between text-sm font-medium">
					{t("cardNumber")}
					<span className="text-xs font-normal text-muted-foreground">{BRAND_LABELS[brand]}</span>
				</label>
				<Input
					id="dummy-number"
					name="test-card-number"
					inputMode="numeric"
					autoComplete="off"
					placeholder="4242 4242 4242 4242"
					value={number}
					onChange={(event) => setNumber(formatCardNumber(event.target.value))}
					onBlur={() => touch("number")}
					aria-invalid={touched.number && Boolean(errors.number)}
					className="h-11"
				/>
				{touched.number && errors.number ? (
					<p className="text-sm text-destructive" role="alert">
						{tCard(errors.number)}
					</p>
				) : null}
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<label htmlFor="dummy-expiry" className="text-sm font-medium">
						{t("expiry")}
					</label>
					<Input
						id="dummy-expiry"
						name="test-card-expiry"
						inputMode="numeric"
						autoComplete="off"
						placeholder="MM / YY"
						value={expiry}
						onChange={(event) => setExpiry(formatExpiry(event.target.value))}
						onBlur={() => touch("expiry")}
						aria-invalid={touched.expiry && Boolean(errors.expiry)}
						className="h-11"
					/>
					{touched.expiry && errors.expiry ? (
						<p className="text-sm text-destructive" role="alert">
							{tCard(errors.expiry)}
						</p>
					) : null}
				</div>
				<div className="space-y-1.5">
					<label htmlFor="dummy-cvv" className="text-sm font-medium">
						{t("cvv")}
					</label>
					<Input
						id="dummy-cvv"
						name="test-card-cvv"
						inputMode="numeric"
						autoComplete="off"
						placeholder={brand === "amex" ? "1234" : "123"}
						maxLength={4}
						value={cvv}
						onChange={(event) => setCvv(event.target.value.replace(/\D/g, ""))}
						onBlur={() => touch("cvv")}
						aria-invalid={touched.cvv && Boolean(errors.cvv)}
						className="h-11"
					/>
					{touched.cvv && errors.cvv ? (
						<p className="text-sm text-destructive" role="alert">
							{tCard(errors.cvv)}
						</p>
					) : null}
				</div>
			</div>

			<div className="space-y-2">
				<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("testCards")}</p>
				<div className="flex flex-wrap gap-2">
					{TEST_CARD_SHORTCUTS.map((shortcut) => (
						<button
							key={shortcut.key}
							type="button"
							onClick={() => {
								setNumber(formatCardNumber(shortcut.number));
								setTouched((previous) => ({ ...previous, number: false }));
							}}
							className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{t(shortcut.key)}
						</button>
					))}
				</div>
			</div>
		</div>
	);
};
