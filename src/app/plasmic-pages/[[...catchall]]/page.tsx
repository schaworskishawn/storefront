import { notFound } from "next/navigation";
import { PlasmicComponent } from "@plasmicapp/loader-nextjs";
import { PLASMIC } from "../../../../plasmic-init";
import { PlasmicClientRootProvider } from "../../../../plasmic-init-client";

type PageProps = {
	params: Promise<{ catchall?: string[] }>;
};

export default async function PlasmicPage({ params }: PageProps) {
	const { catchall } = await params;
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
