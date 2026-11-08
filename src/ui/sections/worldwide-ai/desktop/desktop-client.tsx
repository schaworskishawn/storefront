"use client";

import {
	BookOpen,
	Box,
	ChevronRight,
	CodeXml,
	Database,
	Layers,
	LifeBuoy,
	Lock,
	Maximize2,
	Megaphone,
	Minus,
	Orbit,
	PenLine,
	Power,
	Scale,
	Send,
	Sparkles,
	Users,
	Wifi,
	WifiOff,
	X,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The parts of the Worldwide AI OS desktop that respond to the person: the clock, the network state, the power menu, the
 * ask bar, the message to Nexus, the windows and the dock, and the team filter. Everything here only navigates to pages of
 * the workspace. Nothing runs work by itself: a goal typed for Nexus opens Nexus with that goal filled in.
 */

const NEXUS_PATH = "/worldwide-ai/nexus";
const nexusWith = (goal: string) => `${NEXUS_PATH}?goal=${encodeURIComponent(goal.trim().slice(0, 500))}`;

// ---- Top bar ----------------------------------------------------------------------------------------------

/** The time on this computer, written as the design shows it. Drawn after it loads, so it is never the server's. */
export function Clock() {
	const [now, setNow] = useState<Date | null>(null);
	useEffect(() => {
		const tick = () => setNow(new Date());
		const first = setTimeout(tick, 0);
		const timer = setInterval(tick, 20_000);
		return () => {
			clearTimeout(first);
			clearInterval(timer);
		};
	}, []);
	if (!now) return <span aria-hidden>&nbsp;</span>;
	const date = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
	const time = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	return (
		<time dateTime={now.toISOString()}>
			{date.replace(",", "")}&nbsp;&nbsp;{time}
		</time>
	);
}

/** Whether this computer is online, as the browser knows it. */
export function NetworkState() {
	const [online, setOnline] = useState(true);
	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		update();
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	const Icon = online ? Wifi : WifiOff;
	const label = online ? "Online" : "Offline: the workspace can't be reached";
	return (
		<span title={label} aria-label={label} role="img">
			<Icon size={19} aria-hidden />
		</span>
	);
}

/** Lock and power. In the workspace, locking is signing out; restarting the computer is the system's own menu. */
export function PowerMenu({ name }: { name: string }) {
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const close = (event: MouseEvent | KeyboardEvent) => {
			if (
				event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)
			)
				setOpen(false);
		};
		window.addEventListener("mousedown", close);
		window.addEventListener("keydown", close);
		return () => {
			window.removeEventListener("mousedown", close);
			window.removeEventListener("keydown", close);
		};
	}, [open]);
	return (
		<>
			<Link href="/logout" className="wos-icon-button" title="Lock: sign out of the workspace">
				<Lock size={18} aria-hidden />
				<span className="wos-sr">Lock: sign out of the workspace</span>
			</Link>
			<div className="wos-power" ref={box}>
				<button
					type="button"
					className="wos-icon-button wos-pink"
					aria-haspopup="menu"
					aria-expanded={open}
					onClick={() => setOpen((value) => !value)}
				>
					<Power size={19} aria-hidden />
					<span className="wos-sr">Session</span>
				</button>
				{open && (
					<div className="wos-menu" role="menu">
						<p>Signed in as {name}</p>
						<Link href="/worldwide-ai" role="menuitem">
							Open the workspace pages
						</Link>
						<Link href="/logout" role="menuitem">
							Sign out
						</Link>
						<p>On Worldwide AI OS, F11 leaves full screen. Restart and shut down are in the system menu.</p>
					</div>
				)}
			</div>
		</>
	);
}

// ---- Ask bar ---------------------------------------------------------------------------------------------

export type Destination = { key: string; label: string; hint: string; href: string; words: string };

/**
 * Ask Nexus or open an app. Typing finds applications and agents; choosing one opens it. Anything else is a goal for
 * Nexus, which opens with it filled in to be planned. Nothing is started from here.
 */
export function AskBar({ destinations }: { destinations: readonly Destination[] }) {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(-1);
	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return destinations.filter((d) => d.words.includes(q)).slice(0, 7);
	}, [query, destinations]);
	const go = (href: string) => {
		setQuery("");
		router.push(href);
	};
	return (
		<div className="wos-ask">
			<form
				role="search"
				onSubmit={(event) => {
					event.preventDefault();
					if (active >= 0 && matches[active]) go(matches[active].href);
					else if (query.trim()) go(nexusWith(query));
				}}
			>
				<Sparkles size={20} className="wos-pink" aria-hidden />
				<label htmlFor="wos-ask" className="wos-sr">
					Ask Nexus or open an app
				</label>
				<input
					id="wos-ask"
					value={query}
					placeholder="Ask Nexus or open an app…"
					autoComplete="off"
					role="combobox"
					aria-expanded={matches.length > 0}
					aria-controls="wos-ask-results"
					aria-activedescendant={active >= 0 ? `wos-ask-${active}` : undefined}
					onChange={(event) => {
						setQuery(event.target.value);
						setActive(-1);
					}}
					onKeyDown={(event) => {
						if (event.key === "ArrowDown") {
							event.preventDefault();
							setActive((i) => Math.min(i + 1, matches.length - 1));
						} else if (event.key === "ArrowUp") {
							event.preventDefault();
							setActive((i) => Math.max(i - 1, -1));
						} else if (event.key === "Escape") setQuery("");
					}}
				/>
				<button type="submit" className="wos-icon-button" aria-label="Go">
					<ChevronRight size={20} aria-hidden />
				</button>
			</form>
			{query.trim() && (
				<ul id="wos-ask-results" className="wos-suggestions" role="listbox">
					{matches.map((match, index) => (
						<li key={match.key} role="presentation">
							<a
								id={`wos-ask-${index}`}
								href={match.href}
								role="option"
								aria-selected={index === active}
								onClick={(event) => {
									event.preventDefault();
									go(match.href);
								}}
							>
								{match.label}
								<span>{match.hint}</span>
							</a>
						</li>
					))}
					<li role="presentation">
						<a
							href={nexusWith(query)}
							role="option"
							aria-selected={active === -1}
							onClick={(event) => {
								event.preventDefault();
								go(nexusWith(query));
							}}
						>
							Plan “{query.trim().slice(0, 60)}” with Nexus
							<span>Opens Nexus with this goal</span>
						</a>
					</li>
				</ul>
			)}
		</div>
	);
}

/** A message for Nexus: it opens Nexus with the goal filled in, to be planned there. */
export function NexusCompose() {
	const router = useRouter();
	const [text, setText] = useState("");
	return (
		<div className="wos-compose">
			<form
				onSubmit={(event) => {
					event.preventDefault();
					if (text.trim()) router.push(nexusWith(text));
				}}
			>
				<label htmlFor="wos-nexus-message" className="wos-sr">
					Message Nexus
				</label>
				<input
					id="wos-nexus-message"
					value={text}
					placeholder="Message Nexus…"
					autoComplete="off"
					onChange={(event) => setText(event.target.value)}
				/>
				<button type="submit" className="wos-send" aria-label="Send to Nexus">
					<Send size={18} aria-hidden />
				</button>
			</form>
			<p className="wos-help">Nexus plans the goal with you and starts nothing by itself.</p>
		</div>
	);
}

// ---- Windows and dock ------------------------------------------------------------------------------------

type WindowId = "command" | "nexus";
type WindowState = "open" | "minimized" | "closed";

export type DockItem = { key: string; label: string; href: string | null; pink?: boolean; icon: ReactNode };

function WindowFrame({
	id,
	title,
	icon,
	wide,
	state,
	maximized,
	onState,
	onMaximize,
	children,
}: {
	id: WindowId;
	title: string;
	icon: ReactNode;
	wide?: boolean;
	state: WindowState;
	maximized: boolean;
	onState: (state: WindowState) => void;
	onMaximize: () => void;
	children: ReactNode;
}) {
	return (
		<section
			className={`wos-window wos-window--${id}`}
			data-state={state}
			aria-labelledby={`wos-title-${id}`}
		>
			<header className="wos-titlebar">
				{icon}
				<h1
					id={`wos-title-${id}`}
					className={`wos-title${wide ? " wos-title--wide" : ""}`}
					style={{ margin: 0, fontSize: "inherit", fontWeight: 400 }}
				>
					{title}
				</h1>
				<div className="wos-controls">
					<button
						type="button"
						className="wos-icon-button"
						onClick={() => onState("minimized")}
						aria-label={`Minimize ${title}`}
					>
						<Minus size={16} aria-hidden />
					</button>
					<button
						type="button"
						className="wos-icon-button"
						onClick={onMaximize}
						aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`}
						aria-pressed={maximized}
					>
						<Maximize2 size={15} aria-hidden />
					</button>
					<button
						type="button"
						className="wos-icon-button"
						onClick={() => onState("closed")}
						aria-label={`Close ${title}`}
					>
						<X size={17} aria-hidden />
					</button>
				</div>
			</header>
			<div className="wos-body">{children}</div>
		</section>
	);
}

/**
 * The two windows of the desktop and the dock beneath them. Minimizing or closing a window hides it; Home on the dock
 * brings both back, and the chat button brings back Nexus. The rest of the dock opens applications.
 */
export function DesktopStage({
	command,
	nexus,
	commandIcon,
	nexusIcon,
	dock,
}: {
	command: ReactNode;
	nexus: ReactNode;
	commandIcon: ReactNode;
	nexusIcon: ReactNode;
	dock: readonly DockItem[];
}) {
	const [states, setStates] = useState<Record<WindowId, WindowState>>({ command: "open", nexus: "open" });
	const [maximized, setMaximized] = useState<WindowId | null>(null);
	const set = (id: WindowId) => (state: WindowState) => {
		setStates((current) => ({ ...current, [id]: state }));
		if (state !== "open" && maximized === id) setMaximized(null);
	};
	const toggle = (id: WindowId) => () => setMaximized((current) => (current === id ? null : id));
	const show = (...ids: WindowId[]) =>
		setStates((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, "open" as const])) }));
	return (
		<div className="wos-stage" data-maximized={maximized ?? undefined}>
			<WindowFrame
				id="command"
				title="Command Center"
				icon={commandIcon}
				state={states.command}
				maximized={maximized === "command"}
				onState={set("command")}
				onMaximize={toggle("command")}
			>
				{command}
			</WindowFrame>
			<WindowFrame
				id="nexus"
				title="Nexus"
				wide
				icon={nexusIcon}
				state={states.nexus}
				maximized={maximized === "nexus"}
				onState={set("nexus")}
				onMaximize={toggle("nexus")}
			>
				{nexus}
			</WindowFrame>
			{states.command !== "open" && states.nexus !== "open" && (
				<p className="wos-quiet" style={{ margin: "auto" }}>
					Both windows are closed. Home, on the dock, brings them back.
				</p>
			)}
			<nav className="wos-dock" aria-label="Dock">
				{dock.map((item) =>
					item.href ? (
						<Link
							key={item.key}
							href={item.href}
							title={item.label}
							className={item.pink ? "wos-pink" : undefined}
						>
							{item.icon}
							<span className="wos-sr">{item.label}</span>
						</Link>
					) : (
						<button
							key={item.key}
							type="button"
							title={item.label}
							className={item.pink ? "wos-pink" : undefined}
							data-open={item.key === "home" ? states.command === "open" : states.nexus === "open"}
							aria-current={item.key === "home" ? "page" : undefined}
							onClick={() => (item.key === "home" ? show("command", "nexus") : show("nexus"))}
						>
							{item.icon}
							<span className="wos-sr">{item.label}</span>
						</button>
					),
				)}
			</nav>
		</div>
	);
}

// ---- The team --------------------------------------------------------------------------------------------

export type TeamMember = {
	id: string;
	name: string;
	title: string;
	area: string;
	areaLabel: string;
	status: string;
	statusLabel: string;
	href: string;
};

const AREA_ICONS: Record<string, { icon: LucideIcon; pink: boolean }> = {
	operations: { icon: Orbit, pink: false },
	support: { icon: LifeBuoy, pink: false },
	finance: { icon: Database, pink: true },
	knowledge: { icon: BookOpen, pink: false },
	commerce: { icon: Megaphone, pink: true },
	content: { icon: PenLine, pink: true },
	people: { icon: Users, pink: true },
	engineering: { icon: CodeXml, pink: false },
	inventory: { icon: Box, pink: false },
	manufacturing: { icon: Layers, pink: true },
	compliance: { icon: Scale, pink: true },
};

/** All 49 agents, each with whether its main function can run now. A filter narrows them to one area. */
export function TeamGrid({ members }: { members: readonly TeamMember[] }) {
	const [area, setArea] = useState<string | null>(null);
	const areas = useMemo(() => {
		const seen = new Map<string, string>();
		for (const member of members) seen.set(member.area, member.areaLabel);
		return [...seen.entries()];
	}, [members]);
	const shown = area ? members.filter((member) => member.area === area) : members;
	return (
		<>
			<div className="wos-section-head">
				<h2>Your AI team</h2>
				<span className="wos-quiet">{members.length} agents</span>
				<div className="wos-tabs" role="group" aria-label="Show agents from">
					<button type="button" aria-pressed={area === null} onClick={() => setArea(null)}>
						All
					</button>
					{areas.map(([id, label]) => (
						<button key={id} type="button" aria-pressed={area === id} onClick={() => setArea(id)}>
							{label}
						</button>
					))}
				</div>
			</div>
			<div className="wos-team">
				{shown.map((member) => {
					const look = AREA_ICONS[member.area] ?? { icon: Orbit, pink: false };
					const Icon = look.icon;
					return (
						<Link key={member.id} href={member.href} className="wos-agent">
							<Icon size={30} strokeWidth={1.4} className={look.pink ? "wos-pink" : "wos-cyan"} aria-hidden />
							<span>
								<strong>{member.name}</strong>
								<small>{member.title}</small>
								<small>
									<span className="wos-dot" data-status={member.status} aria-hidden />
									{member.statusLabel}
								</small>
							</span>
							<ChevronRight size={18} aria-hidden />
						</Link>
					);
				})}
			</div>
		</>
	);
}
