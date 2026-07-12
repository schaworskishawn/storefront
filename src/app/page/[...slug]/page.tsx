import { Content, fetchOneEntry, isPreviewing } from "@builder.io/sdk-react";
import { notFound } from "next/navigation";

const BUILDER_API_KEY = process.env.NEXT_PUBLIC_BUILDER_API_KEY!;

export default async function BuilderPage({ params }: { params: { slug?: string[] } }) {
	const urlPath = "/" + (params.slug?.join("/") || "");

	const content = await fetchOneEntry({
		model: "page",
		apiKey: BUILDER_API_KEY,
		userAttributes: { urlPath },
	});

	if (!content && !isPreviewing()) {
		notFound();
	}

	return <Content model="page" apiKey={BUILDER_API_KEY} content={content} />;
}
