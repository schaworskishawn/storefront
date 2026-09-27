import { brandConfig } from "@/config/brand";
import { STOREFRONT_CONTENT_VERSION, type StorefrontContent } from "@/lib/content/types";

/**
 * Code fallback for all storefront marketing copy.
 * Saleor PageType overrides merge on top when CONTENT_PROVIDER=saleor.
 *
 * English SoT for editorial copy — export to Configurator seed: pnpm content:export-seed
 */
export const defaultStorefrontContent = {
	version: STOREFRONT_CONTENT_VERSION,
	// Single source of truth for channel-wide facts. Copy references these via
	// `{freeShippingThreshold}` / `{returnsWindowDays}` tokens instead of baking the
	// numbers into strings, so the cart math, announcement, and trust labels never drift.
	policies: {
		shipping: {
			freeShippingThreshold: 75,
		},
		returns: {
			windowDays: 30,
		},
	},
	chrome: {
		announcementBar: {
			id: "",
			message: "Free shipping on orders over {freeShippingThreshold}",
			href: null,
			linkLabel: null,
			dismissible: true,
		},
		nav: {
			allProductsLabel: "All",
			viewAllLabel: "View all {label}",
		},
	},
	surfaces: {
		homepage: {
			hero: {
				heading: "Discover our collection",
				subheading: brandConfig.tagline,
				primaryCtaLabel: "Shop all",
			},
			featuredCollection: {
				heading: "Featured products",
				collectionSlug: "featured-products",
				limit: 8,
			},
			categories: {
				heading: "Shop by category",
			},
			photoCredits: [],
			brandStory: {
				heading: "Built for real commerce",
				paragraphs: [
					"Paper is a minimal, production-ready storefront for Saleor — clean as a blank page, built to ship.",
					"Customize sections in code, connect your catalog, and keep checkout, cart, and product pages battle-tested out of the box.",
				],
			},
			values: {
				heading: "Why shop with us",
				columns: [
					{
						title: "Curated quality",
						text: "Every product is selected for craftsmanship and longevity — not trend-chasing.",
					},
					{
						title: "Fast fulfillment",
						text: "Orders ship from regional warehouses with tracking from checkout to delivery.",
					},
					{
						title: "Easy returns",
						text: "Hassle-free returns within {returnsWindowDays} days. We stand behind what we sell.",
					},
				],
				columnsDesktop: 3,
			},
			editorial: {
				heading: "Designed to last",
				paragraphs: [
					"Thoughtful materials and timeless silhouettes — pieces you'll reach for season after season.",
				],
				imagePosition: "right",
				ctaLabel: "Explore collections",
				image: null,
				imageAlt: "",
			},
			trustBadges: {
				badges: [
					{ icon: "⚡", title: "24/7 SUPPORT", subtitle: "Always active direct line" },
					{ icon: "🍁", title: "GLOBAL SHIPPING", subtitle: "Coming Soon, Canada Only" },
					{ icon: "🔞", title: "AGE VERIFIED CHECKOUT", subtitle: "Must Be Of Legal Age" },
					{ icon: "📦", title: "WE SHIP PACKAGES ASAP", subtitle: "No Delay standard logistics" },
				],
			},
			brandLogos: {
				heading: "Official Partners",
				// TODO: replace with real logo files. Add them to `public/images/brands/`
				// in this repo, then update these src paths — placeholders won't 404
				// the page, they'll just render broken image icons until real files
				// exist at these paths.
				logos: [
					{ src: "/images/brands/flavour-beast.png", alt: "Flavour Beast" },
					{ src: "/images/brands/stlth.png", alt: "STLTH" },
					{ src: "/images/brands/vaporesso.png", alt: "Vaporesso" },
					{ src: "/images/brands/smok.png", alt: "SMOK" },
					{ src: "/images/brands/uwell.png", alt: "Uwell" },
					{ src: "/images/brands/geekvape.png", alt: "GeekVape" },
				],
			},
			newsletter: {
				heading: "Stay Updated",
				body: "Get the latest deals, new products, and updates directly to your warehouse registry.",
				placeholder: "Enter your email address",
				submitLabel: "Subscribe",
			},
		},
		products: {
			title: "All Products",
			description: "Discover our full collection of premium products.",
		},
		cart: {
			empty: {
				title: "Your bag is empty",
				body: "Looks like you haven't added anything to your bag yet.",
				ctaLabel: "Start Shopping",
			},
			trust: {
				freeShippingPrefix: "Free delivery over",
				returnsLabel: "{returnsWindowDays}-day returns",
			},
			drawer: {
				title: "Your Bag",
				addForFreeShipping: "Add {amount} more for free shipping",
				freeShippingQualified: "You qualify for free shipping!",
			},
		},
		checkout: {
			emptyCart: {
				title: "Your cart is empty",
				body: "Looks like you haven't added anything to your cart yet.",
				startShoppingLabel: "Start Shopping",
				goBackLabel: "Go back",
			},
			emptySession: {
				title: "Your cart is empty",
				message: "Add items from the store, then return here to complete your purchase.",
			},
			marketingOptInLabel: "Email me with news and offers",
			trust: {
				secureCheckout: "Secure checkout",
				stripeProcessor: "Payments processed by Stripe",
			},
		},
	},
} satisfies StorefrontContent;
