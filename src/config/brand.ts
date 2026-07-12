/**
 * Brand Configuration
 *
 * Centralized branding settings for the storefront.
 * Update these values when customizing for a new store.
 *
 * @example
 * ```tsx
 * import { brandConfig } from "@/config/brand";
 *
 * <title>{brandConfig.siteName}</title>
 * <p>© {new Date().getFullYear()} {brandConfig.copyrightHolder}</p>
 * ```
 */

export const brandConfig = {
	/** Site name used in titles, metadata, and headers */
	siteName: "The Vape Store",

	/** Legal entity name for copyright notices */
	copyrightHolder: "The Vape Store",

	/** Organization name for structured data (JSON-LD) */
	organizationName: "The Vape Store",

	/** Default brand name for products without a brand */
	defaultBrand: "The Vape Store",

	/** Tagline/description for the store */
	tagline: "Winnipeg's top vape shop — huge selection, unbeatable prices, fast local delivery.",

	/** Homepage meta description */
	description:
		"Winnipeg & Manitoba's best vape shop online. Huge selection of disposables, e-juice & accessories. Low prices, in stock now.",

	/** Logo aria-label for accessibility */
	logoAriaLabel: "The Vape Store",

	/** Title template - %s will be replaced with page title */
	titleTemplate: "%s | The Vape Store",

	/** Social media handles */
	social: {
		/** Twitter/X handle (without @) - set to null to disable */
		twitter: null as string | null,
		/** Instagram handle (without @) - set to null to disable */
		instagram: null as string | null,
		/** Facebook page URL - set to null to disable */
		facebook: null as string | null,
	},
} as const;

/**
 * Helper to format page title using brand template.
 */
export function formatPageTitle(title: string): string {
	return brandConfig.titleTemplate.replace("%s", title);
}

/**
 * Get copyright text with specified year.
 * Use CopyrightText component for dynamic year in Server Components.
 */
export function getCopyrightText(year: number = new Date().getFullYear()): string {
	return `© ${year} ${brandConfig.copyrightHolder}. All rights reserved.`;
}
