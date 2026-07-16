"use client";
import { PlasmicRootProvider } from "@plasmicapp/loader-nextjs";
import { PLASMIC } from "./plasmic-init";
import React from "react";
import { HeroBanner } from "@/ui/sections/hero-banner/hero-banner";
import { ProductCard } from "@/ui/components/plp/product-card";

PLASMIC.registerComponent(HeroBanner, {
	name: "HeroBanner",
	props: {
		heading: {
			type: "string",
			defaultValue: "New collection",
		},
		subheading: {
			type: "string",
			defaultValue: "Shop the latest arrivals.",
		},
		backgroundImage: {
			type: "string",
			helpText: "Background image URL",
		},
		backgroundImageAlt: {
			type: "string",
		},
		height: {
			type: "choice",
			options: ["compact", "default", "large"],
			defaultValue: "default",
		},
		primaryCta: {
			type: "object",
			fields: {
				label: "string",
				href: "string",
				variant: {
					type: "choice",
					options: ["primary", "secondary"],
				},
			},
			defaultValue: { label: "Shop Now", href: "/" },
		},
		secondaryCta: {
			type: "object",
			fields: {
				label: "string",
				href: "string",
				variant: {
					type: "choice",
					options: ["primary", "secondary"],
				},
			},
		},
	},
	importPath: "@/ui/sections/hero-banner/hero-banner",
});

PLASMIC.registerComponent(ProductCard, {
	name: "ProductCard",
	props: {
		product: {
			type: "object",
			fields: {
				id: "string",
				name: "string",
				slug: "string",
				brand: "string",
				price: "number",
				priceStop: "number",
				compareAtPrice: "number",
				discountPercent: "number",
				currency: "string",
				localeBcp47: "string",
				image: "string",
				imageAlt: "string",
				hoverImage: "string",
				href: "string",
				badge: {
					type: "choice",
					options: ["Sale", "New"],
				},
				isBestseller: "boolean",
				colors: {
					type: "array",
					itemType: {
						type: "object",
						fields: {
							name: "string",
							hex: "string",
						},
					},
				},
				sizes: {
					type: "array",
				},
				category: {
					type: "object",
					fields: {
						id: "string",
						name: "string",
						slug: "string",
					},
				},
				createdAt: "string",
				hasVariants: "boolean",
			},
			defaultValue: {
				id: "sample-product",
				name: "Sample Product",
				slug: "sample-product",
				price: 49,
				currency: "USD",
				image: "https://placehold.co/600x800",
				imageAlt: "Sample product",
				href: "/products/sample-product",
			},
		},
		priority: {
			type: "boolean",
			defaultValue: false,
		},
		imageSizes: {
			type: "string",
		},
	},
	importPath: "@/ui/components/plp/product-card",
});

export function PlasmicClientRootProvider(
	props: Omit<React.ComponentProps<typeof PlasmicRootProvider>, "loader">,
) {
	return <PlasmicRootProvider loader={PLASMIC} {...props} />;
}
