import { initPlasmicLoader } from "@plasmicapp/loader-nextjs/react-server-conditional";

export const PLASMIC = initPlasmicLoader({
	projects: [
		{
			id: process.env.NEXT_PUBLIC_PLASMIC_PROJECT_ID!,
			token: process.env.NEXT_PUBLIC_PLASMIC_PROJECT_API_TOKEN!,
		},
	],
	preview: false,
});
