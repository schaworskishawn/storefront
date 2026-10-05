"use client";

export type PaymentMethodOption<T extends string> = {
	id: T;
	label: string;
	description?: string;
};

type PaymentMethodTabsProps<T extends string> = {
	options: ReadonlyArray<PaymentMethodOption<T>>;
	value: T;
	onChange: (id: T) => void;
	disabled?: boolean;
	ariaLabel: string;
};

/** Picks between the payment methods on offer (e.g. card vs Interac e-Transfer). Rendered only when there is a choice. */
export function PaymentMethodTabs<T extends string>({
	options,
	value,
	onChange,
	disabled,
	ariaLabel,
}: PaymentMethodTabsProps<T>) {
	return (
		<div role="radiogroup" aria-label={ariaLabel} className="grid gap-3 sm:grid-cols-2">
			{options.map((option) => {
				const selected = option.id === value;
				return (
					<button
						key={option.id}
						type="button"
						role="radio"
						aria-checked={selected}
						disabled={disabled}
						onClick={() => onChange(option.id)}
						className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${
							selected
								? "border-primary bg-primary/10 shadow-[0_0_14px_var(--wv-cyan-soft)]"
								: "border-border bg-card hover:border-primary/50"
						}`}
					>
						<span className={`block font-semibold ${selected ? "text-primary" : "text-foreground"}`}>
							{option.label}
						</span>
						{option.description ? (
							<span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}
