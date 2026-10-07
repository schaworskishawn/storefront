"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { accentColors } from "@/lib/desk/art";
import {
	ACCENTS,
	NOTES_MAX,
	SHORTCUT_LABEL_MAX,
	SHORTCUT_MAX,
	addShortcut,
	isExternalHref,
	movePanel,
	reorderPanel,
	type DeskState,
	type PanelId,
} from "@/lib/desk/model";
import { useDesk, useMounted, useSecondTick } from "@/lib/desk/store";
import { CoverEditor, CoverSkeleton, DeskCover } from "./wv-desk-cover";

/**
 * My Desk: the visitor's own dashboard. A cover, and four panels (shortcuts, private notes, a clock, appearance) that can be
 * moved: dragged by their handle with a mouse, or nudged earlier or later with the buttons on each panel (which also serve touch
 * screens and keyboards: on a phone the panels simply stack and the buttons reorder them). Everything is saved in this browser
 * only; nothing is sent anywhere.
 */

const heyComic = "font-[family-name:var(--font-hey-comic)]";
const bungee = "font-[family-name:var(--font-bungee)]";
const orbitron = "font-[family-name:var(--font-orbitron)]";

const TITLES: Record<PanelId, string> = {
	shortcuts: "Shortcuts",
	notes: "Private notes",
	clock: "Clock",
	appearance: "Appearance",
};

type Update = (change: (current: DeskState) => DeskState) => void;
type PanelProps = { desk: DeskState; update: Update };

const input =
	"h-10 w-full min-w-0 rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-bg)] px-3 text-sm text-white placeholder:text-[var(--wv-muted)]";
const smallButton = `${heyComic} rounded-lg border border-[var(--desk-accent)] px-3 py-2 text-xs text-[var(--desk-accent)] disabled:opacity-40`;

/** One tap to ask, a second to do it: for anything that throws away what the visitor made. */
function useConfirm(action: () => void) {
	const [asking, setAsking] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	return {
		asking,
		press: () => {
			if (asking) {
				window.clearTimeout(timer.current);
				setAsking(false);
				action();
				return;
			}
			setAsking(true);
			timer.current = window.setTimeout(() => setAsking(false), 4000);
		},
	};
}

// ----- Panels -----

function ShortcutsPanel({ desk, update }: PanelProps) {
	const [label, setLabel] = useState("");
	const [href, setHref] = useState("");
	const [error, setError] = useState<string | null>(null);

	const add = () => {
		const id = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
		const result = addShortcut(desk.shortcuts, { label, href }, id);
		if (!result.ok) return setError(result.error);
		setError(null);
		setLabel("");
		setHref("");
		update((d) => ({ ...d, shortcuts: result.shortcuts }));
	};

	return (
		<div className="flex flex-col gap-3">
			{desk.shortcuts.length === 0 ? (
				<p className={`${orbitron} text-[13px] text-[var(--wv-text-dim)]`}>
					No shortcuts yet. Add the pages you visit most.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{desk.shortcuts.map((shortcut) => (
						<li key={shortcut.id} className="flex items-center gap-2">
							{isExternalHref(shortcut.href) ? (
								<a
									href={shortcut.href}
									target="_blank"
									rel="noopener noreferrer"
									className={`${orbitron} flex-1 truncate rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-bg)] px-3 py-2 text-[13px]`}
								>
									{shortcut.label} <span aria-hidden>↗</span>
									<span className="sr-only"> (opens in a new tab)</span>
								</a>
							) : (
								<Link
									href={shortcut.href}
									className={`${orbitron} flex-1 truncate rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-bg)] px-3 py-2 text-[13px]`}
								>
									{shortcut.label}
								</Link>
							)}
							<button
								type="button"
								aria-label={`Remove ${shortcut.label}`}
								onClick={() =>
									update((d) => ({ ...d, shortcuts: d.shortcuts.filter((s) => s.id !== shortcut.id) }))
								}
								className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--wv-purple)] text-[var(--wv-text-dim)]"
							>
								✕
							</button>
						</li>
					))}
				</ul>
			)}
			<form
				onSubmit={(event) => {
					event.preventDefault();
					add();
				}}
				className="flex flex-col gap-2"
			>
				<div className="flex flex-col gap-2 sm:flex-row">
					<input
						value={label}
						onChange={(event) => setLabel(event.target.value)}
						maxLength={SHORTCUT_LABEL_MAX}
						placeholder="Name"
						aria-label="Shortcut name"
						className={input}
					/>
					<input
						value={href}
						onChange={(event) => setHref(event.target.value)}
						placeholder="/shop or example.com"
						aria-label="Shortcut address"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						className={input}
					/>
				</div>
				<div className="flex items-center justify-between gap-3">
					<p className={`${orbitron} text-[11px] text-[var(--wv-muted)]`}>
						{desk.shortcuts.length} of {SHORTCUT_MAX}
					</p>
					<button type="submit" className={smallButton}>
						ADD SHORTCUT
					</button>
				</div>
				{error ? (
					<p role="alert" className={`${orbitron} text-xs text-[var(--wv-pink)]`}>
						{error}
					</p>
				) : null}
			</form>
		</div>
	);
}

function NotesPanel({ desk, update }: PanelProps) {
	const [draft, setDraft] = useState(desk.notes);
	const pending = useRef<string | null>(null);
	const timer = useRef<number | undefined>(undefined);
	const updateRef = useRef(update);
	useEffect(() => {
		updateRef.current = update;
	});

	const save = (value: string) => {
		window.clearTimeout(timer.current);
		pending.current = null;
		updateRef.current((d) => ({ ...d, notes: value }));
	};
	// Whatever is still waiting to be saved is saved when the panel goes away (moving to another page, say).
	useEffect(
		() => () => {
			window.clearTimeout(timer.current);
			if (pending.current !== null) updateRef.current((d) => ({ ...d, notes: pending.current ?? d.notes }));
		},
		[],
	);

	const clear = useConfirm(() => {
		setDraft("");
		save("");
	});

	return (
		<div className="flex flex-col gap-2">
			<label className="flex flex-col gap-1">
				<span className="sr-only">Private notes</span>
				<textarea
					value={draft}
					maxLength={NOTES_MAX}
					rows={7}
					placeholder="Reorder reminders, flavours to try, a quit-day plan…"
					onChange={(event) => {
						const value = event.target.value;
						setDraft(value);
						pending.current = value;
						window.clearTimeout(timer.current);
						timer.current = window.setTimeout(() => save(value), 350);
					}}
					onBlur={() => {
						if (pending.current !== null) save(pending.current);
					}}
					className="min-h-[9rem] w-full resize-y rounded-lg border border-[var(--wv-purple)] bg-[var(--wv-bg)] p-3 text-sm leading-relaxed text-white placeholder:text-[var(--wv-muted)]"
				/>
			</label>
			<div className="flex items-center justify-between gap-3">
				<p className={`${orbitron} text-[11px] text-[var(--wv-muted)]`}>
					Only on this device, never sent to us. {draft.length} / {NOTES_MAX}
				</p>
				<button
					type="button"
					onClick={clear.press}
					disabled={draft.length === 0 && !clear.asking}
					className={smallButton}
				>
					{clear.asking ? "TAP AGAIN TO CLEAR" : "CLEAR"}
				</button>
			</div>
		</div>
	);
}

function ClockPanel({ desk, update }: PanelProps) {
	const tick = useSecondTick();
	const now = new Date(tick * 1000);
	const time = new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: !desk.clock24,
	}).format(now);
	const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(
		now,
	);
	const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

	return (
		<div className="flex flex-col items-start gap-1">
			<p
				role="timer"
				className={`${bungee} text-[34px] leading-none tracking-[1px] text-[var(--desk-accent)] md:text-[40px]`}
			>
				{tick === 0 ? "--:--:--" : time}
			</p>
			<p className={`${heyComic} text-sm`}>{tick === 0 ? "" : date}</p>
			<p className={`${orbitron} text-[11px] text-[var(--wv-muted)]`}>
				{zone ? `Your time zone: ${zone}` : ""}
			</p>
			<button
				type="button"
				aria-pressed={desk.clock24}
				onClick={() => update((d) => ({ ...d, clock24: !d.clock24 }))}
				className={`${smallButton} mt-2`}
			>
				{desk.clock24 ? "24-HOUR: ON" : "24-HOUR: OFF"}
			</button>
		</div>
	);
}

function Switch({
	checked,
	onChange,
	label,
	hint,
}: {
	checked: boolean;
	onChange: (next: boolean) => void;
	label: string;
	hint: string;
}) {
	return (
		<label className="flex cursor-pointer items-start gap-3">
			<input
				type="checkbox"
				role="switch"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="peer sr-only"
			/>
			<span
				aria-hidden
				className="mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border border-[var(--wv-purple)] bg-[var(--wv-bg)] p-0.5 transition-colors peer-checked:border-[var(--desk-accent)] peer-checked:bg-[var(--desk-accent)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--wv-cyan-soft)] peer-checked:[&>span]:translate-x-5"
			>
				<span className="block size-4 rounded-full bg-white transition-transform" />
			</span>
			<span className="flex flex-col gap-0.5">
				<span className={`${heyComic} text-sm`}>{label}</span>
				<span className={`${orbitron} text-[11px] leading-snug text-[var(--wv-muted)]`}>{hint}</span>
			</span>
		</label>
	);
}

function AppearancePanel({ desk, update }: PanelProps) {
	const reset = useDeskReset();
	const set = (patch: Partial<DeskState["appearance"]>) =>
		update((d) => ({ ...d, appearance: { ...d.appearance, ...patch } }));

	return (
		<div className="flex flex-col gap-4">
			<fieldset className="flex flex-col gap-2">
				<legend className={`${heyComic} mb-1 text-xs uppercase tracking-[1px] text-[var(--wv-text-dim)]`}>
					Desk colour
				</legend>
				<div className="flex flex-wrap gap-2">
					{ACCENTS.map((accent) => {
						const colors = accentColors(accent.id);
						return (
							<label key={accent.id} className="relative">
								<input
									type="radio"
									name="desk-accent"
									value={accent.id}
									checked={desk.appearance.accent === accent.id}
									onChange={() => set({ accent: accent.id })}
									className="peer sr-only"
								/>
								<span className="block cursor-pointer rounded-full border-2 border-transparent p-0.5 peer-checked:border-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--wv-cyan-soft)]">
									<span className="block size-8 rounded-full" style={{ backgroundColor: colors.color }} />
								</span>
								<span className="sr-only">{accent.label}</span>
							</label>
						);
					})}
				</div>
			</fieldset>
			<Switch
				checked={desk.appearance.effects}
				onChange={(effects) => set({ effects })}
				label="Cursor and panel effects"
				hint="The cursor halo, click pulses, magnetic buttons and the shimmer on cards, on every page."
			/>
			<Switch
				checked={desk.appearance.compact}
				onChange={(compact) => set({ compact })}
				label="Compact desk"
				hint="Tighter panels, so more fits on the screen."
			/>
			<div className="flex items-center justify-between gap-3 border-t border-[var(--wv-purple)] pt-3">
				<p className={`${orbitron} text-[11px] text-[var(--wv-muted)]`}>
					Reset puts back the cover, notes, shortcuts and layout.
				</p>
				<button type="button" onClick={reset.press} className={smallButton}>
					{reset.asking ? "TAP AGAIN TO RESET" : "RESET MY DESK"}
				</button>
			</div>
		</div>
	);
}

function useDeskReset() {
	const { reset } = useDesk();
	return useConfirm(reset);
}

const PANELS: Record<PanelId, (props: PanelProps) => ReactNode> = {
	shortcuts: (props) => <ShortcutsPanel {...props} />,
	notes: (props) => <NotesPanel {...props} />,
	clock: (props) => <ClockPanel {...props} />,
	appearance: (props) => <AppearancePanel {...props} />,
};

// ----- The desk -----

export function DeskApp({ fallbackName }: { fallbackName?: string | null }) {
	const { desk, update } = useDesk();
	const mounted = useMounted();
	const [editing, setEditing] = useState(false);
	const [dragging, setDragging] = useState<PanelId | null>(null);
	const [over, setOver] = useState<PanelId | null>(null);
	const [announcement, setAnnouncement] = useState("");

	if (!mounted) {
		return (
			<div className="flex flex-col gap-5" aria-busy="true">
				<CoverSkeleton />
				<div aria-hidden className="grid gap-4 md:grid-cols-2">
					{[0, 1, 2, 3].map((n) => (
						<div
							key={n}
							className="h-48 animate-pulse rounded-2xl border border-[var(--wv-purple)] bg-[var(--wv-control)]"
						/>
					))}
				</div>
			</div>
		);
	}

	const accent = accentColors(desk.appearance.accent);
	const compact = desk.appearance.compact;
	const setOrder = (panels: PanelId[]) => update((d) => ({ ...d, panels }));

	const move = (id: PanelId, step: -1 | 1) => {
		const next = movePanel(desk.panels, id, step);
		if (next.join() === desk.panels.join()) return;
		setOrder(next);
		setAnnouncement(`${TITLES[id]} moved to position ${next.indexOf(id) + 1} of ${next.length}.`);
	};

	const drop = (target: PanelId) => {
		if (dragging && dragging !== target) {
			const next = reorderPanel(desk.panels, dragging, target);
			setOrder(next);
			setAnnouncement(
				`${TITLES[dragging]} moved to position ${next.indexOf(dragging) + 1} of ${next.length}.`,
			);
		}
		setDragging(null);
		setOver(null);
	};

	return (
		<div
			style={{ "--desk-accent": accent.color } as CSSProperties}
			className={`flex flex-col ${compact ? "gap-3" : "gap-5"}`}
		>
			<DeskCover
				fallbackName={fallbackName}
				actions={
					<button
						type="button"
						aria-expanded={editing}
						onClick={() => setEditing((open) => !open)}
						className={smallButton}
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

			<p role="status" aria-live="polite" className="sr-only">
				{announcement}
			</p>

			<div className={`grid md:grid-cols-2 ${compact ? "gap-3" : "gap-4"}`}>
				{desk.panels.map((id, index) => (
					<section
						key={id}
						aria-labelledby={`desk-panel-${id}`}
						onDragOver={(event: DragEvent) => {
							if (!dragging) return;
							event.preventDefault();
							setOver(id);
						}}
						onDrop={(event: DragEvent) => {
							event.preventDefault();
							drop(id);
						}}
						className={`flex flex-col rounded-2xl border bg-[var(--wv-control)] transition-colors ${compact ? "gap-2 p-3" : "gap-3 p-4 md:p-5"} ${
							over === id && dragging !== id
								? "border-[var(--desk-accent)]"
								: dragging === id
									? "border-dashed border-[var(--desk-accent)] opacity-60"
									: "border-[var(--wv-purple)]"
						}`}
					>
						<header className="flex items-center gap-2">
							<span
								aria-hidden
								draggable
								onDragStart={(event) => {
									event.dataTransfer.setData("text/plain", id);
									event.dataTransfer.effectAllowed = "move";
									const frame = event.currentTarget.closest("section");
									if (frame) event.dataTransfer.setDragImage(frame, 24, 24);
									setDragging(id);
								}}
								onDragEnd={() => {
									setDragging(null);
									setOver(null);
								}}
								title="Drag to move"
								className="cursor-grab select-none text-lg leading-none text-[var(--wv-muted)] active:cursor-grabbing"
							>
								⠿
							</span>
							<h3
								id={`desk-panel-${id}`}
								className={`${bungee} flex-1 text-sm uppercase tracking-[1px] text-[var(--desk-accent)]`}
							>
								{TITLES[id]}
							</h3>
							<button
								type="button"
								aria-label={`Move ${TITLES[id]} earlier`}
								disabled={index === 0}
								onClick={() => move(id, -1)}
								className="flex size-9 items-center justify-center rounded-lg border border-[var(--wv-purple)] text-sm disabled:opacity-30"
							>
								↑
							</button>
							<button
								type="button"
								aria-label={`Move ${TITLES[id]} later`}
								disabled={index === desk.panels.length - 1}
								onClick={() => move(id, 1)}
								className="flex size-9 items-center justify-center rounded-lg border border-[var(--wv-purple)] text-sm disabled:opacity-30"
							>
								↓
							</button>
						</header>
						{PANELS[id]({ desk, update })}
					</section>
				))}
			</div>
		</div>
	);
}
