import { getDefaultLocaleSlug, resolveLocaleFromSlug } from "@/config/locale";
import type { Bulletin } from "@/lib/bulletin/bulletin";
import { getOwnerBulletin } from "@/lib/bulletin/get-bulletin";

/**
 * The owner's "From the desk of…" panel: a short message with a real update date, so the site feels personally kept. It reads
 * a Saleor page the owner edits in the Dashboard (see `docs/owner-bulletin.md`) and renders nothing until one exists.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";
const marker = "font-[family-name:var(--font-permanent-marker)]";

/** `YYYY-MM-DD` as a long date in the visitor-facing language, without the timezone shifting the day. */
function formatDay(day: string, bcp47: string): string {
	return new Intl.DateTimeFormat(bcp47, { dateStyle: "long", timeZone: "UTC" }).format(
		new Date(`${day}T00:00:00Z`),
	);
}

/** The panel itself, with no data fetching, so it can be rendered with a sample bulletin and tested. */
export function BulletinCard({ bulletin, bcp47 }: { bulletin: Bulletin; bcp47: string }) {
	return (
		<aside
			aria-label={`From the desk of ${bulletin.author}`}
			className="relative mx-auto flex w-full max-w-[760px] flex-col gap-3 rounded-2xl border-2 border-dashed border-[var(--wv-pink)] bg-[var(--wv-control)] p-5 md:gap-4 md:p-7"
		>
			<span aria-hidden className="absolute -top-3 left-5 text-2xl md:left-7">
				📌
			</span>
			<div className="flex flex-col gap-1 pt-1">
				<p className={`${marker} text-sm uppercase tracking-[2px] text-[var(--wv-pink)] md:text-base`}>
					From the desk of
				</p>
				<h2 className={`${bungee} text-xl text-[var(--wv-cyan-soft)] md:text-2xl`}>{bulletin.author}</h2>
			</div>
			<div
				className={`${orbitron} flex flex-col gap-3 text-[13px] leading-[1.7] text-[var(--wv-text-dim)] md:text-sm`}
			>
				{bulletin.paragraphs.map((paragraph) => (
					<p key={paragraph}>{paragraph}</p>
				))}
			</div>
			{bulletin.updatedOn ? (
				<p className={`${heyComic} self-end text-[11px] uppercase tracking-[1.5px] text-[var(--wv-muted)]`}>
					Updated <time dateTime={bulletin.updatedOn}>{formatDay(bulletin.updatedOn, bcp47)}</time>
				</p>
			) : null}
		</aside>
	);
}

/** The bulletin as a band on a page, or nothing when there is no bulletin. */
export async function WvBulletin() {
	const bulletin = await getOwnerBulletin();
	if (!bulletin) return null;
	const { bcp47 } = resolveLocaleFromSlug(getDefaultLocaleSlug());
	return (
		<section className="border-b border-[var(--wv-purple)] bg-[var(--wv-bg)] px-4 py-8 md:px-8 md:py-10 xl:px-20">
			<BulletinCard bulletin={bulletin} bcp47={bcp47} />
		</section>
	);
}
