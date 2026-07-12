import { PlasmicComponent, ComponentRenderData } from "@plasmicapp/loader-nextjs";
import { notFound } from "next/navigation";
import { PLASMIC } from "../../../../plasmic-init";
import { PlasmicClientRootProvider } from "../../../../plasmic-init-client";

export default async function PlasmicPage({ params }: { params: Promise<{ catchall?: string[] }> }) {
	const { catchall } = await params;
	const plasmicPath = "/" + (catchall?.join("/") || "");
	const plasmicData: ComponentRenderData | null = await PLASMIC.maybeFetchComponentData(plasmicPath);

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
