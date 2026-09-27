import { Section, type SectionTone } from "@/ui/sections/section";
import { SectionHeader } from "@/ui/sections/section-header";
import { NewsletterForm } from "./newsletter-form";

export interface NewsletterSectionProps {
	heading: string;
	body: string;
	placeholder: string;
	submitLabel: string;
	tone?: SectionTone;
	className?: string;
}

/**
 * Newsletter signup band. Server Component shell (heading/copy from props, per
 * `data-storefront-content`) with a single client island (`NewsletterForm`) for
 * the interactive submit state. No `Suspense` boundary needed — `NewsletterForm`
 * uses local state + a plain `fetch` to `/api/newsletter`, not a Server Action,
 * so it doesn't trigger Cache Components' dynamic-access check the way
 * `useActionState` + a Server Action did.
 */
export function NewsletterSection({
	heading,
	body,
	placeholder,
	submitLabel,
	tone = "default",
	className,
}: NewsletterSectionProps) {
	const headingId = "newsletter-heading";

	return (
		<Section tone={tone} className={className} aria-labelledby={headingId}>
			<div className="flex flex-col items-center gap-8 text-center">
				<SectionHeader id={headingId} heading={heading} intro={body} align="center" />
				<NewsletterForm placeholder={placeholder} submitLabel={submitLabel} />
			</div>
		</Section>
	);
}
