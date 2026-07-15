import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PlasmicComponent } from "@plasmicapp/loader-nextjs";
import { PLASMIC } from "../../../../plasmic-init";
import { PlasmicClientRootProvider } from "../../../../plasmic-init-client";
import { PageContentSkeleton } from "@/ui/components/page-content-skeleton";

type PageProps = {
	params: Promise<{ catchall?: string[] }>;
};

/**
 * Sync page shell — Plasmic content streams inside a Suspense island (Cache Components / PPR).
 */
export default function PlasmicPage({ params }: PageProps) {
	return (
		<Suspense fallback={<PageContentSkeleton />}>
			<PlasmicPageContent params={params} />
		</Suspense>
	);
}

async function PlasmicPageContent({ params: paramsPromise }: PageProps) {
	const params = await paramsPromise;
	const catchall = params.catchall;
	const plasmicPath = "/" + (catchall ? catchall.join("/") : "");

	const plasmicData = await PLASMIC.maybeFetchComponentData(plasmicPath);

	if (!plasmicData) {
		notFound();
	}

	const pageMeta = plasmicData.entryCompMetas[0];

	return (
		<PlasmicClientRootProvider prefetchedData={plasmicData} pageParams={pageMeta.params}>
			<PlasmicComponent component={pageMeta.displayName} />
		</PlasmicClientRootProvider>
	);
}
