import { Fragment, type ReactNode } from "react";

/**
 * Small, safe Markdown renderer for Learn articles. Output is built from React elements only
 * (no raw HTML is ever injected), so article text cannot inject markup.
 * Supports: # / ## / ### headings, paragraphs, - lists, 1. lists, > quotes, --- rules,
 * **bold**, *italic*, `code`, [links](url) and ![images](url).
 */

const outfit = "font-[family-name:var(--font-outfit)]";

function safeHref(href: string): string {
	return /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? href : "#";
}

function safeSrc(src: string): string | null {
	return /^(https:\/\/|\/)/i.test(src) ? src : null;
}

const INLINE =
	/(!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;

function renderInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let last = 0;
	let i = 0;
	for (const m of text.matchAll(INLINE)) {
		const index = m.index ?? 0;
		if (index > last) nodes.push(text.slice(last, index));
		const key = `i${i++}`;
		if (m[2] !== undefined && m[3] !== undefined) {
			const src = safeSrc(m[3]);
			 
			nodes.push(
				src ? <img key={key} src={src} alt={m[2]} className="my-6 h-auto max-w-full rounded-2xl" /> : null,
			);
		} else if (m[4] !== undefined && m[5] !== undefined) {
			const href = safeHref(m[5]);
			const external = /^https?:/i.test(href);
			nodes.push(
				<a
					key={key}
					href={href}
					className="font-semibold text-[var(--wv-cyan-soft)] underline underline-offset-2"
					{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
				>
					{m[4]}
				</a>,
			);
		} else if (m[6] !== undefined) {
			nodes.push(<strong key={key}>{m[6]}</strong>);
		} else if (m[7] !== undefined) {
			nodes.push(<em key={key}>{m[7]}</em>);
		} else if (m[8] !== undefined) {
			nodes.push(
				<code key={key} className="rounded bg-[var(--wv-control)] px-1.5 py-0.5 font-mono text-[0.9em]">
					{m[8]}
				</code>,
			);
		}
		last = index + m[0].length;
	}
	if (last < text.length) nodes.push(text.slice(last));
	return nodes;
}

type Block =
	| { type: "h"; level: 1 | 2 | 3; text: string }
	| { type: "p"; text: string }
	| { type: "ul" | "ol"; items: string[] }
	| { type: "quote"; text: string }
	| { type: "hr" }
	| { type: "code"; text: string };

function parseBlocks(source: string): Block[] {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.trim()) {
			i++;
			continue;
		}
		if (line.trim().startsWith("```")) {
			const code: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
			i++;
			blocks.push({ type: "code", text: code.join("\n") });
			continue;
		}
		if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
			blocks.push({ type: "hr" });
			i++;
			continue;
		}
		const h = line.match(/^(#{1,3})\s+(.*)$/);
		if (h) {
			blocks.push({ type: "h", level: h[1].length as 1 | 2 | 3, text: h[2].trim() });
			i++;
			continue;
		}
		if (line.startsWith(">")) {
			const q: string[] = [];
			while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
			blocks.push({ type: "quote", text: q.join(" ").trim() });
			continue;
		}
		if (/^\s*[-*]\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
				items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
			blocks.push({ type: "ul", items });
			continue;
		}
		if (/^\s*\d+\.\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]))
				items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
			blocks.push({ type: "ol", items });
			continue;
		}
		const p: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() &&
			!/^(#{1,3}\s|>|\s*[-*]\s+|\s*\d+\.\s+|```)/.test(lines[i]) &&
			!/^\s*(-{3,}|\*{3,})\s*$/.test(lines[i])
		) {
			p.push(lines[i++].trim());
		}
		blocks.push({ type: "p", text: p.join(" ") });
	}
	return blocks;
}

export function Markdown({ source }: { source: string }) {
	const blocks = parseBlocks(source);
	return (
		<div className="flex flex-col gap-5 text-base leading-[1.75] md:text-[17px]">
			{blocks.map((b, idx) => {
				switch (b.type) {
					case "h":
						return b.level === 3 ? (
							<h3 key={idx} className={`${outfit} mt-2 text-lg font-bold md:text-xl`}>
								{renderInline(b.text)}
							</h3>
						) : (
							<h2 key={idx} className={`${outfit} mt-4 text-xl font-extrabold md:text-2xl`}>
								{renderInline(b.text)}
							</h2>
						);
					case "p":
						return <p key={idx}>{renderInline(b.text)}</p>;
					case "ul":
						return (
							<ul key={idx} className="list-disc space-y-2 pl-6 marker:text-[var(--wv-cyan-soft)]">
								{b.items.map((it, j) => (
									<li key={j}>{renderInline(it)}</li>
								))}
							</ul>
						);
					case "ol":
						return (
							<ol key={idx} className="list-decimal space-y-2 pl-6 marker:text-[var(--wv-cyan-soft)]">
								{b.items.map((it, j) => (
									<li key={j}>{renderInline(it)}</li>
								))}
							</ol>
						);
					case "quote":
						return (
							<blockquote
								key={idx}
								className="rounded-r-xl border-l-4 border-[var(--wv-cyan-soft)] bg-[var(--wv-control)] px-5 py-4 text-[var(--wv-text-dim)]"
							>
								{renderInline(b.text)}
							</blockquote>
						);
					case "hr":
						return <hr key={idx} className="border-[var(--wv-disabled)]" />;
					case "code":
						return (
							<pre
								key={idx}
								className="overflow-x-auto rounded-xl bg-[var(--wv-control)] p-4 font-mono text-sm"
							>
								<code>{b.text}</code>
							</pre>
						);
					default:
						return <Fragment key={idx} />;
				}
			})}
		</div>
	);
}
