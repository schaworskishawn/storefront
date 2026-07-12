import { Content, fetchOneEntry, isPreviewing } from "@builder.io/sdk-react";
import { notFound } from "next/navigation";

const BUILDER_API_KEY = process.env.NEXT_PUBLIC_BUILDER_API_KEY!;

export default async function BuilderPage({ params }: { params: Promise<{ slug?: string[] }> }) {
	const { slug } = await params;
	const urlPath = "/" + (slug?.join("/") || "");

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
