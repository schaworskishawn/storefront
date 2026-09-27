/** Suspense fallback for `NewsletterForm` — matches its layout to avoid shift when the real form streams in. */
export function NewsletterFormSkeleton() {
	return (
		<div className="flex w-full max-w-lg flex-col items-center gap-3 sm:flex-row" aria-hidden="true">
			<div className="h-12 w-full animate-pulse rounded-button bg-muted" />
			<div className="h-12 w-full shrink-0 animate-pulse rounded-button bg-muted sm:w-32" />
		</div>
	);
}
