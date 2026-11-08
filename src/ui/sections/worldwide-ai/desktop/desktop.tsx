import {
	Activity,
	BarChart3,
	BookOpen,
	Box,
	CalendarDays,
	CircleDot,
	ClipboardCheck,
	CodeXml,
	Factory,
	FileText,
	Folder,
	FlaskConical,
	Home,
	LayoutGrid,
	LifeBuoy,
	Link2,
	ListChecks,
	MessageSquare,
	Newspaper,
	PenLine,
	Plug,
	Radio,
	Scale,
	Search,
	Settings,
	ShieldCheck,
	Terminal,
	TrendingUp,
	Users,
	type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { AREA_LABELS, ROLES } from "@/lib/worldwide-ai/agents/registry";
import { buildBriefing, type BriefingItem } from "@/lib/worldwide-ai/briefing";
import { READINESS_LABELS } from "@/lib/worldwide-ai/functions/readiness";
import { primaryFunctionOf } from "@/lib/worldwide-ai/functions/registry";
import { INTEGRATIONS } from "@/lib/worldwide-ai/integrations/catalog";
import { OPS_TIME_ZONE } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { APPS, type AppId } from "@/lib/worldwide-ai/web/apps";
import { loadTeam, navCounts } from "@/lib/worldwide-ai/web/queries";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import {
	AskBar,
	Clock,
	DesktopStage,
	NetworkState,
	NexusCompose,
	PowerMenu,
	TeamGrid,
	type Destination,
	type DockItem,
	type TeamMember,
} from "./desktop-client";
import "../worldwide-ai.css";
import "./desktop.css";

/**
 * Worldwide AI OS: the desktop, after the owner's design concept. A top bar, a rail of the main applications, the
 * Command Center and Nexus windows, and a dock, over the Worldwide AI OS wallpaper.
 *
 * Everything on it is read from the workspace when the page is drawn: the person's name, all 49 agents and whether each
 * one's main function can run now, what is waiting for review, which services are connected, and the briefing's next
 * actions. Nothing is sample data, and nothing on it starts work by itself: every button opens a page of the workspace,
 * and a goal for Nexus opens Nexus to be planned.
 */

const path = (suffix = "") => `${WORKSPACE_PATH}${suffix}`;

const RAIL: ReadonlyArray<{ label: string; href: string; icon: LucideIcon; pink?: boolean }> = [
	{ label: "Today", href: path(), icon: CalendarDays },
	{ label: "Agents", href: path("/team"), icon: Users, pink: true },
	{ label: "Lab", href: path("/lab"), icon: FlaskConical },
	{ label: "Inventory", href: path("/lab/ingredients"), icon: Box, pink: true },
	{ label: "Files", href: path("/knowledge"), icon: FileText },
	{ label: "Settings", href: path("/settings"), icon: Settings },
];

const WORKSPACE_APPS: ReadonlyArray<{ id: AppId; icon: LucideIcon }> = [
	{ id: "knowledge", icon: BookOpen },
	{ id: "engineering", icon: CodeXml },
	{ id: "rfid", icon: Radio },
	{ id: "quality", icon: ShieldCheck },
	{ id: "manufacturing", icon: Factory },
	{ id: "compliance", icon: Scale },
	{ id: "support", icon: LifeBuoy },
	{ id: "content", icon: PenLine },
	{ id: "reports", icon: Newspaper },
	{ id: "improvement", icon: TrendingUp },
	{ id: "integrations", icon: Plug },
];

const LEVEL_ORDER: Record<BriefingItem["level"], number> = { action: 0, attention: 1, info: 2 };
const LEVEL_ICON: Record<BriefingItem["level"], LucideIcon> = {
	action: ClipboardCheck,
	attention: Activity,
	info: FileText,
};

function greeting(now: Date): string {
	const hour = Number(
		new Intl.DateTimeFormat("en-CA", { timeZone: OPS_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(
			now,
		),
	);
	return hour < 5
		? "Good evening"
		: hour < 12
			? "Good morning"
			: hour < 18
				? "Good afternoon"
				: "Good evening";
}

/** The Worldwide AI mark: a W in the brand's cyan. */
function Mark() {
	return (
		<svg width="30" height="24" viewBox="0 0 30 24" aria-hidden className="wos-cyan">
			<path
				d="M2 3 L8.5 21 L15 7 L21.5 21 L28 3"
				fill="none"
				stroke="currentColor"
				strokeWidth="2.6"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/** Nexus's orb. Decoration only: it turns slowly unless the person has asked for less motion, and means nothing by it. */
function Orb() {
	return (
		<svg viewBox="0 0 200 200" role="img" aria-label="Nexus">
			<defs>
				<radialGradient id="wos-orb-core" cx="42%" cy="38%" r="65%">
					<stop offset="0" stopColor="var(--wv-cyan-soft)" stopOpacity="0.95" />
					<stop offset="0.55" stopColor="var(--wv-pink)" stopOpacity="0.55" />
					<stop offset="1" stopColor="var(--wv-bg)" stopOpacity="0.2" />
				</radialGradient>
				<radialGradient id="wos-orb-glow" cx="50%" cy="50%" r="50%">
					<stop offset="0.6" stopColor="var(--wv-pink)" stopOpacity="0.35" />
					<stop offset="1" stopColor="var(--wv-pink)" stopOpacity="0" />
				</radialGradient>
			</defs>
			<circle cx="100" cy="100" r="98" fill="url(#wos-orb-glow)" />
			<circle cx="100" cy="100" r="70" fill="url(#wos-orb-core)" />
			<circle
				cx="100"
				cy="100"
				r="70"
				fill="none"
				stroke="var(--wv-cyan-soft)"
				strokeOpacity="0.8"
				strokeWidth="1.5"
			/>
			<g className="wos-orb-rings" fill="none" strokeWidth="2.2">
				<ellipse cx="100" cy="100" rx="78" ry="26" stroke="var(--wv-pink)" transform="rotate(-28 100 100)" />
				<ellipse
					cx="100"
					cy="100"
					rx="78"
					ry="34"
					stroke="var(--wv-cyan-soft)"
					transform="rotate(38 100 100)"
				/>
				<ellipse
					cx="100"
					cy="100"
					rx="26"
					ry="74"
					stroke="var(--wv-pink)"
					strokeOpacity="0.7"
					transform="rotate(12 100 100)"
				/>
			</g>
		</svg>
	);
}

export async function Desktop() {
	const workspace = await getWorkspace();
	const { sql, now } = workspace.runtime;
	const [counts, { team, statuses }, briefing] = await Promise.all([
		navCounts(workspace),
		loadTeam(workspace),
		buildBriefing(sql, workspace.config, now()),
	]);
	const name = workspace.actor.label.split(/\s+/)[0] || workspace.actor.label;
	const services = statuses.filter((status) => INTEGRATIONS[status.id].hasConnector);
	const connected = services.filter((status) => status.configured).length;
	const review = counts.review ?? 0;

	const members: TeamMember[] = team.agents.map(({ role, enabled, primary }) => {
		const status = enabled ? primary.status : "disabled";
		return {
			id: role.id,
			name: role.name,
			title: role.title,
			area: role.area,
			areaLabel: AREA_LABELS[role.area],
			status,
			statusLabel: READINESS_LABELS[status],
			href: path(`/team/${role.id}`),
		};
	});
	const destinations: Destination[] = [
		...ROLES.map((role) => {
			const action = primaryFunctionOf(role.id)?.action ?? "";
			return {
				key: `agent-${role.id}`,
				label: `${role.name}, ${role.title}`,
				hint: action,
				href: path(`/team/${role.id}`),
				words: `${role.name} ${role.title} ${action}`.toLowerCase(),
			};
		}),
		...APPS.map((app) => ({
			key: `app-${app.id}`,
			label: app.label,
			hint: app.summary,
			href: app.href,
			words: `${app.label} ${app.short} ${app.summary}`.toLowerCase(),
		})),
	];
	const nextActions = [...briefing.items]
		.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
		.slice(0, 3);
	const appsById = new Map(APPS.map((app) => [app.id, app]));

	const dock: DockItem[] = [
		{
			key: "home",
			label: "Home: show the Command Center and Nexus",
			href: null,
			icon: <Home size={26} aria-hidden />,
		},
		{ key: "nexus", label: "Nexus", href: null, pink: true, icon: <MessageSquare size={26} aria-hidden /> },
		{
			key: "files",
			label: "Files and knowledge",
			href: path("/knowledge"),
			icon: <Folder size={26} aria-hidden />,
		},
		{
			key: "overview",
			label: "Overview",
			href: path("/overview"),
			icon: <BarChart3 size={26} aria-hidden />,
		},
		{
			key: "inventory",
			label: "Inventory",
			href: path("/lab/ingredients"),
			pink: true,
			icon: <Box size={26} aria-hidden />,
		},
		{
			key: "reports",
			label: "Daily reports",
			href: path("/reports"),
			icon: <Newspaper size={26} aria-hidden />,
		},
		{
			key: "activity",
			label: "Activity log",
			href: path("/activity"),
			icon: <Terminal size={26} aria-hidden />,
		},
		{
			key: "rfid",
			label: "RFID and NFC scans",
			href: path("/rfid/scans"),
			pink: true,
			icon: <CircleDot size={26} aria-hidden />,
		},
	];

	const command = (
		<div className="wos-command">
			<div className="wos-main">
				<p className="wos-kicker">Worldwide AI</p>
				<p className="wos-greeting">
					{greeting(now())}, {name}
				</p>
				<AskBar destinations={destinations} />
				<nav className="wos-chips" aria-label="At a glance">
					<Link href={path("/team")}>
						<Users size={20} aria-hidden /> {team.totals.agents} agent roles
					</Link>
					<Link href={path("/review")}>
						<ListChecks size={20} aria-hidden /> Review queue
						{review > 0 && <span className="wos-count">{review}</span>}
					</Link>
					<Link href={path("/integrations")}>
						<Link2 size={20} aria-hidden /> Connected services
						<span className="wos-count" title={`${connected} of ${services.length} services connected`}>
							{connected}/{services.length}
						</span>
					</Link>
				</nav>
				<TeamGrid members={members} />
				<div className="wos-actions">
					<h2>Next actions</h2>
					{nextActions.length === 0 ? (
						<p className="wos-quiet">Nothing is waiting on you right now.</p>
					) : (
						nextActions.map((item) => {
							const Icon = LEVEL_ICON[item.level];
							return (
								<Link key={`${item.href}-${item.text}`} href={item.href} className="wos-action">
									<Icon size={22} className={item.level === "action" ? "wos-pink" : "wos-cyan"} aria-hidden />
									<span>{item.text}</span>
								</Link>
							);
						})
					)}
				</div>
			</div>
			<nav className="wos-side" aria-label="Workspace">
				<h2>Workspace</h2>
				{WORKSPACE_APPS.map(({ id, icon: Icon }) => {
					const app = appsById.get(id);
					if (!app) return null;
					return (
						<Link key={id} href={app.href}>
							<Icon size={20} className="wos-cyan" aria-hidden />
							<span>{app.short}</span>
						</Link>
					);
				})}
			</nav>
		</div>
	);

	const nexus = (
		<div className="wos-nexus">
			<div className="wos-orb">
				<Orb />
				<p>Master coordinator</p>
			</div>
			<h2>What would you like to work on?</h2>
			<nav className="wos-quick" aria-label="Quick actions">
				<Link href={path("/actions")}>
					<CalendarDays size={20} className="wos-cyan" aria-hidden /> Plan my day
				</Link>
				<Link href={path("/tasks")}>
					<ListChecks size={20} className="wos-cyan" aria-hidden /> Review tasks
				</Link>
				<Link href={path("/knowledge")}>
					<Search size={20} className="wos-cyan" aria-hidden /> Find a document
				</Link>
			</nav>
			<NexusCompose />
		</div>
	);

	return (
		<div className="wos">
			<header className="wos-top">
				<Link href={path("/desktop")} className="wos-brand" aria-label="Worldwide AI OS">
					<Mark />
					<span>
						WORLDWIDE <strong>AI</strong> OS
					</span>
				</Link>
				<div className="wos-centre">
					Private workspace
					{workspace.demo && <span className="wos-demo">Demonstration data</span>}
				</div>
				<div className="wos-status">
					<NetworkState />
					<PowerMenu name={workspace.actor.label} />
					<span className="wos-divider" aria-hidden />
					<Clock />
				</div>
			</header>
			<nav className="wos-rail" aria-label="Applications">
				{RAIL.map(({ label, href, icon: Icon, pink }) => (
					<Link key={label} href={href} className={pink ? "wos-pink" : "wos-cyan"}>
						<Icon size={34} strokeWidth={1.5} aria-hidden />
						<span style={{ color: "var(--wos-text)" }}>{label}</span>
					</Link>
				))}
			</nav>
			<DesktopStage
				command={command}
				nexus={nexus}
				commandIcon={<LayoutGrid size={18} aria-hidden />}
				nexusIcon={<MessageSquare size={18} className="wos-cyan" aria-hidden />}
				dock={dock}
			/>
		</div>
	);
}
