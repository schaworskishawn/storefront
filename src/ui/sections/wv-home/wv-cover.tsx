"use client";

import { useState, type ReactNode } from "react";
import { BANNERS, GLYPHS, accentColors } from "@/lib/cover/art";
import {
	ACCENTS,
	BANNER_IDS,
	DEFAULT_PROFILE,
	GLYPH_IDS,
	NAME_MAX,
	STATUS_MAX,
	cleanLine,
	coverName,
	initialsOf,
	type Profile,
} from "@/lib/cover/model";
import { useCover, useMounted } from "@/lib/cover/store";

/**
 * The visitor's cover: an abstract banner, an avatar (their initials or a picture), a display name and a short status line. It is
 * kept in this browser only (see `useCover`), shown at the top of the account page, and edited with `CoverEditor`.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const outlineButton = `${heyComic} rounded-lg border border-[var(--wv-cyan)] px-3 py-2 text-xs text-[var(--wv-cyan)]`;

export function AvatarBadge({ profile, name }: { profile: Profile; name: string }) {
	const base =
		"flex size-20 shrink-0 items-center justify-center rounded-full border-4 border-[var(--wv-control)] text-3xl md:size-24 md:text-4xl";
	const avatar = profile.avatar;
	if (avatar.kind === "glyph") {
		const glyph = GLYPHS[avatar.glyph];
		return (
			<span role="img" aria-label={glyph.label} className={`${base} bg-[var(--wv-section)]`}>
				{glyph.emoji}
			</span>
		);
	}
	const { color, ink } = accentColors(avatar.accent);
	return (
		<span aria-hidden className={`${base} ${bungee}`} style={{ backgroundColor: color, color: ink }}>
			{initialsOf(name)}
		</span>
	);
}

/** A grey block the size of the cover, shown until the saved cover can be read from the browser. */
export function CoverSkeleton() {
	return (
		<div
			aria-hidden
			className="h-[216px] animate-pulse rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-control)] md:h-[264px]"
		/>
	);
}

/** The cover itself. `fallbackName` is shown until the visitor picks a display name (the account's name, say). */
export function ProfileCover({
	fallbackName,
	actions,
}: {
	fallbackName?: string | null;
	actions?: ReactNode;
}) {
	const { profile } = useCover();
	const mounted = useMounted();
	if (!mounted) return <CoverSkeleton />;
	const name = coverName(profile, fallbackName);

	return (
		<section
			aria-label="Your cover"
			className="overflow-hidden rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-control)]"
		>
			<div aria-hidden className="h-28 md:h-40" style={{ background: BANNERS[profile.banner].css }} />
			<div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-end md:gap-5 md:px-6 md:pb-5">
				<div className="-mt-10 md:-mt-12">
					<AvatarBadge profile={profile} name={name} />
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<h2 className={`${bungee} break-words text-xl md:text-2xl`}>{name}</h2>
					{profile.status ? (
						<p className={`${orbitron} break-words text-[13px] text-[var(--wv-text-dim)]`}>
							{profile.status}
						</p>
					) : (
						<p className={`${orbitron} text-[13px] text-[var(--wv-muted)]`}>No status yet</p>
					)}
				</div>
				{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
			</div>
		</section>
	);
}

const field =
	"h-11 w-full rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-bg)] px-3 text-sm text-white placeholder:text-[var(--wv-muted)]";
const choice =
	"block cursor-pointer rounded-lg border-2 border-transparent p-1 text-center text-[11px] peer-checked:border-[var(--wv-cyan)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--wv-cyan-soft)]";

/** The form for the cover. Every change shows on the cover straight away and is saved as it is made. */
export function CoverEditor() {
	const { profile, update } = useCover();
	// What is typed is kept as typed (so a space between words can be entered); the saved copy is the cleaned one.
	const [name, setName] = useState(profile.displayName);
	const [status, setStatus] = useState(profile.status);
	const avatar = profile.avatar;

	return (
		<form
			onSubmit={(event) => event.preventDefault()}
			className="flex flex-col gap-5 rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-surface)] p-4 md:p-6"
		>
			<div className="grid gap-4 md:grid-cols-2">
				<label className="flex flex-col gap-1">
					<span className={`${heyComic} text-xs uppercase tracking-[1px] text-[var(--wv-cyan-soft)]`}>
						Display name
					</span>
					<input
						value={name}
						maxLength={NAME_MAX}
						placeholder="What should we call you?"
						autoComplete="nickname"
						onChange={(event) => {
							setName(event.target.value);
							update({ displayName: cleanLine(event.target.value, NAME_MAX) });
						}}
						onBlur={() => setName(cleanLine(name, NAME_MAX))}
						className={field}
					/>
				</label>
				<label className="flex flex-col gap-1">
					<span className={`${heyComic} text-xs uppercase tracking-[1px] text-[var(--wv-cyan-soft)]`}>
						Status line
					</span>
					<input
						value={status}
						maxLength={STATUS_MAX}
						placeholder="A few words about today"
						onChange={(event) => {
							setStatus(event.target.value);
							update({ status: cleanLine(event.target.value, STATUS_MAX) });
						}}
						onBlur={() => setStatus(cleanLine(status, STATUS_MAX))}
						className={field}
					/>
				</label>
			</div>

			<fieldset className="flex flex-col gap-2">
				<legend className={`${heyComic} mb-1 text-xs uppercase tracking-[1px] text-[var(--wv-cyan-soft)]`}>
					Banner
				</legend>
				<div className="grid grid-cols-3 gap-2 md:grid-cols-6">
					{BANNER_IDS.map((id) => (
						<label key={id} className="relative">
							<input
								type="radio"
								name="cover-banner"
								value={id}
								checked={profile.banner === id}
								onChange={() => update({ banner: id })}
								className="peer sr-only"
							/>
							<span className={choice}>
								<span className="block h-12 rounded-md" style={{ background: BANNERS[id].css }} />
								<span className={`${orbitron} mt-1 block text-[var(--wv-text-dim)]`}>
									{BANNERS[id].label}
								</span>
							</span>
						</label>
					))}
				</div>
			</fieldset>

			<fieldset className="flex flex-col gap-3">
				<legend className={`${heyComic} mb-1 text-xs uppercase tracking-[1px] text-[var(--wv-cyan-soft)]`}>
					Avatar
				</legend>
				<div className="flex flex-wrap gap-2">
					{(["monogram", "glyph"] as const).map((kind) => (
						<label key={kind} className="relative">
							<input
								type="radio"
								name="cover-avatar-kind"
								value={kind}
								checked={avatar.kind === kind}
								onChange={() =>
									update({
										avatar:
											kind === "glyph"
												? { kind: "glyph", glyph: GLYPH_IDS[0] }
												: { kind: "monogram", accent: ACCENTS[0].id },
									})
								}
								className="peer sr-only"
							/>
							<span
								className={`${choice} ${orbitron} px-4 py-2 text-xs text-[var(--wv-text-dim)] peer-checked:text-white`}
							>
								{kind === "monogram" ? "My initials" : "A picture"}
							</span>
						</label>
					))}
				</div>
				{avatar.kind === "monogram" ? (
					<div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Initials colour">
						{ACCENTS.map((accent) => (
							<label key={accent.id} className="relative">
								<input
									type="radio"
									name="cover-avatar-colour"
									value={accent.id}
									checked={avatar.accent === accent.id}
									onChange={() => update({ avatar: { kind: "monogram", accent: accent.id } })}
									className="peer sr-only"
								/>
								<span className={choice}>
									<span
										aria-hidden
										className="flex size-10 items-center justify-center rounded-full text-xs"
										style={{
											backgroundColor: accentColors(accent.id).color,
											color: accentColors(accent.id).ink,
										}}
									>
										{initialsOf(coverName(profile))}
									</span>
									<span className="sr-only">{accent.label}</span>
								</span>
							</label>
						))}
					</div>
				) : (
					<div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar picture">
						{GLYPH_IDS.map((id) => (
							<label key={id} className="relative">
								<input
									type="radio"
									name="cover-avatar-glyph"
									value={id}
									checked={avatar.glyph === id}
									onChange={() => update({ avatar: { kind: "glyph", glyph: id } })}
									className="peer sr-only"
								/>
								<span className={choice}>
									<span
										role="img"
										aria-label={GLYPHS[id].label}
										className="flex size-10 items-center justify-center rounded-full bg-[var(--wv-section)] text-xl"
									>
										{GLYPHS[id].emoji}
									</span>
								</span>
							</label>
						))}
					</div>
				)}
			</fieldset>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className={`${orbitron} text-[11px] text-[var(--wv-muted)]`}>
					Saved on this device only. Nothing here is sent to the site.
				</p>
				<button
					type="button"
					onClick={() => {
						setName("");
						setStatus("");
						update({ ...DEFAULT_PROFILE });
					}}
					className={`${heyComic} rounded-lg border border-[var(--wv-pink)] px-4 py-2 text-xs text-[var(--wv-pink)]`}
				>
					RESET COVER
				</button>
			</div>
		</form>
	);
}

/** The cover at the top of the account page, with a button that opens the editor right below it. */
export function AccountCover({ fallbackName }: { fallbackName?: string | null }) {
	const [editing, setEditing] = useState(false);
	return (
		<div className="flex flex-col gap-4">
			<ProfileCover
				fallbackName={fallbackName}
				actions={
					<button
						type="button"
						aria-expanded={editing}
						onClick={() => setEditing((open) => !open)}
						className={outlineButton}
					>
						{editing ? "DONE" : "CUSTOMIZE COVER"}
					</button>
				}
			/>
			{editing ? (
				<div className="wv-unfold">
					<CoverEditor />
				</div>
			) : null}
		</div>
	);
}
