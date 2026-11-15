import { RULES } from "@/lib/community/channels";

/** The house rules, as a numbered card. Shown at the top of #rules and, in short, when someone is choosing a nickname. */
export function RulesCard() {
	return (
		<section className="mx-3 mb-4 rounded-xl border border-[var(--wv-purple)] bg-[var(--wv-control)] p-4 md:mx-4 md:p-5">
			<h2 className="font-[family-name:var(--font-bungee)] text-lg text-[var(--wv-cyan-soft)]">
				HOUSE RULES
			</h2>
			<ol className="mt-3 flex flex-col gap-3">
				{RULES.map((rule, i) => (
					<li key={rule.title} className="flex gap-3">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--wv-purple)] font-sans text-xs font-bold text-white">
							{i + 1}
						</span>
						<p className="font-sans text-sm leading-[1.45] text-[var(--wv-text-dim)]">
							<strong className="text-white">{rule.title}. </strong>
							{rule.text}
						</p>
					</li>
				))}
			</ol>
		</section>
	);
}
