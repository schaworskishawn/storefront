"use client";

import {
	Activity,
	BookOpen,
	CalendarDays,
	ClipboardCheck,
	Code2,
	Factory,
	FlaskConical,
	LayoutDashboard,
	LayoutGrid,
	LifeBuoy,
	ListChecks,
	Newspaper,
	PenLine,
	Plug,
	Radio,
	Scale,
	Search,
	Settings,
	ShieldCheck,
	Sparkles,
	TrendingUp,
	Users,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { APPS, APP_BY_ID, APP_GROUPS, MOBILE_APPS, type AppId } from "@/lib/worldwide-ai/web/apps";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";

const ICONS: Record<AppId, LucideIcon> = {
	today: CalendarDays,
	nexus: Sparkles,
	overview: LayoutDashboard,
	team: Users,
	tasks: ListChecks,
	reports: Newspaper,
	support: LifeBuoy,
	knowledge: BookOpen,
	review: ClipboardCheck,
	lab: FlaskConical,
	rfid: Radio,
	content: PenLine,
	engineering: Code2,
	manufacturing: Factory,
	quality: ShieldCheck,
	compliance: Scale,
	integrations: Plug,
	activity: Activity,
	improvement: TrendingUp,
	settings: Settings,
};

/** Whether a navigation link is the page being viewed (Today only on its exact address; the rest on anything beneath them). */
const isCurrent = (pathname: string, href: string) =>
	href === WORKSPACE_PATH ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export type NavCounts = Partial<Record<AppId, number>>;

export function SideNav({ counts }: { counts: NavCounts }) {
	const pathname = usePathname() ?? "";
	return (
		<nav className="wai-nav" aria-label="Applications">
			{APP_GROUPS.map((group) => (
				<div key={group}>
					<p className="wai-nav-group">{group}</p>
					{APPS.filter((app) => app.group === group).map((app) => {
						const Icon = ICONS[app.id];
						const count = counts[app.id] ?? 0;
						return (
							<Link
								key={app.id}
								href={app.href}
								aria-current={isCurrent(pathname, app.href) ? "page" : undefined}
							>
								<Icon aria-hidden />
								<span>{app.label}</span>
								{count > 0 && (
									<span className="wai-count" aria-label={`${count} waiting`}>
										{count}
									</span>
								)}
							</Link>
						);
					})}
				</div>
			))}
		</nav>
	);
}

export function MobileNav({ counts }: { counts: NavCounts }) {
	const pathname = usePathname() ?? "";
	return (
		<nav className="wai-mobile-nav" aria-label="Main">
			{MOBILE_APPS.map((id) => {
				const app = APP_BY_ID[id];
				const Icon = ICONS[id];
				const count = counts[id] ?? 0;
				return (
					<Link key={id} href={app.href} aria-current={isCurrent(pathname, app.href) ? "page" : undefined}>
						<Icon aria-hidden />
						<span>
							{app.short}
							{count > 0 ? ` (${count})` : ""}
						</span>
					</Link>
				);
			})}
			<Launcher agents={[]} variant="mobile" />
		</nav>
	);
}

export type LauncherAgent = { id: string; name: string; title: string; action: string };

/**
 * The command bar: find an application or an agent and go to it. It only ever navigates to pages of this workspace. It is
 * not a shell and runs nothing by itself. Opens with "/" or Ctrl+K (⌘K on a Mac), closes with Escape.
 */
export function Launcher({
	agents,
	variant = "bar",
}: {
	agents: readonly LauncherAgent[];
	variant?: "bar" | "mobile";
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const router = useRouter();
	const [query, setQuery] = useState("");

	const open = () => {
		setQuery("");
		dialog.current?.showModal();
		input.current?.focus();
	};

	useEffect(() => {
		if (variant !== "bar") return;
		const onKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing = target?.closest("input, textarea, select, [contenteditable=true]");
			if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
				event.preventDefault();
				dialog.current?.showModal();
				input.current?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [variant]);

	const results = useMemo(() => {
		const q = query.trim().toLowerCase();
		const apps = APPS.filter((app) => !q || `${app.label} ${app.summary}`.toLowerCase().includes(q)).map(
			(app) => ({
				key: `app-${app.id}`,
				href: app.href,
				label: app.label,
				hint: app.summary,
			}),
		);
		const people = agents
			.filter((agent) => q && `${agent.name} ${agent.title} ${agent.action}`.toLowerCase().includes(q))
			.map((agent) => ({
				key: `agent-${agent.id}`,
				href: `${WORKSPACE_PATH}/team/${agent.id}`,
				label: `${agent.name}: ${agent.action}`,
				hint: agent.title,
			}));
		return [...people, ...apps].slice(0, 14);
	}, [query, agents]);

	const go = (href: string) => {
		dialog.current?.close();
		router.push(href);
	};

	return (
		<>
			{variant === "bar" ? (
				<button type="button" className="wai-search" onClick={open} aria-haspopup="dialog">
					<Search size={16} aria-hidden />
					<span>Find an app or an agent</span>
					<kbd>/</kbd>
				</button>
			) : (
				<a
					href="#apps"
					onClick={(event) => {
						event.preventDefault();
						open();
					}}
				>
					<LayoutGrid aria-hidden />
					<span>Apps</span>
				</a>
			)}
			<dialog ref={dialog} className="wai-dialog" aria-label="Find an application or an agent">
				<form
					className="wai-dialog-body"
					onSubmit={(event) => {
						event.preventDefault();
						if (results[0]) go(results[0].href);
					}}
				>
					<label className="wai-label" htmlFor={`wai-find-${variant}`}>
						Find an application or an agent
					</label>
					<input
						id={`wai-find-${variant}`}
						ref={input}
						className="wai-input"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Type a name: tasks, Vault, reconcile…"
						autoComplete="off"
					/>
					<ul className="wai-results">
						{results.map((result) => (
							<li key={result.key}>
								<a
									href={result.href}
									onClick={(event) => {
										event.preventDefault();
										go(result.href);
									}}
								>
									<span>{result.label}</span>
									<span className="wai-muted wai-small">{result.hint}</span>
								</a>
							</li>
						))}
						{results.length === 0 && (
							<li className="wai-muted wai-small">
								Nothing matches. This only opens pages of the workspace.
							</li>
						)}
					</ul>
					<p className="wai-help">
						<span className="wai-kbd">/</span> or <span className="wai-kbd">Ctrl K</span> opens this.{" "}
						<span className="wai-kbd">Enter</span> opens the first result.{" "}
						<span className="wai-kbd">Esc</span> closes it. <span className="wai-kbd">Tab</span> moves between
						results.
					</p>
				</form>
			</dialog>
		</>
	);
}
