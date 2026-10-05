"use client";

import { useMemo } from "react";
import { buildHomeSections, type HomeMembership } from "@/lib/catalog/home-collections";
import { useShuffleSeed } from "@/lib/catalog/use-shuffle-seed";
import { ProductSection, type CardProduct, type CatalogContext } from "./wv-product-section";

/**
 * The home page's product collections, in the browser so each visit gets a fresh shuffled order (the same ordering
 * the shop uses; see src/lib/catalog/home-collections.ts for what goes where). Sections with nothing in them are
 * left off.
 */
export function HomeCollections({
	products,
	membership,
	ctx,
}: {
	products: CardProduct[];
	membership: HomeMembership;
	ctx: CatalogContext;
}) {
	const seed = useShuffleSeed();
	const sections = useMemo(() => buildHomeSections(products, membership, seed), [products, membership, seed]);

	return (
		<>
			<ProductSection
				eyebrow="COLLECTION"
				title="FEATURED PRODUCTS"
				products={sections.featured}
				ctx={ctx}
				cta
			/>
			<ProductSection eyebrow="TOP PICKS" title="BEST SELLERS" products={sections.bestSellers} ctx={ctx} />
			<ProductSection eyebrow="HAND-PICKED" title="STAFF PICKS" products={sections.staffPicks} ctx={ctx} />
			<ProductSection
				eyebrow="OUR OWN BRAND"
				title="WORLDWIDE VAPOR ORIGINALS"
				products={sections.originals}
				ctx={ctx}
			/>
			<ProductSection
				eyebrow="NEW TO VAPING?"
				title="STARTER KITS"
				products={sections.starterKits}
				ctx={ctx}
			/>
			<ProductSection eyebrow="LATEST" title="NEW ARRIVALS" products={sections.newArrivals} ctx={ctx} />
		</>
	);
}
