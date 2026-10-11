import Link from "next/link";
import type { ReactNode } from "react";
import { READINESS_LABELS, type ReadinessStatus } from "@/lib/worldwide-ai/functions/readiness";
import { formatAge, formatOpsDateTime } from "@/lib/worldwide-ai/time";
import { TASK_STATE_LABELS, WORKSPACE_PATH, type TaskState } from "@/lib/worldwide-ai/types";

/** The small pieces every workspace page is built from. Server components: no state, no handlers. */

export type Tone = "good" | "warn" | "bad" | "info" | "pink" | "plain";

export function Pill({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
	return <span className={`wai-pill${tone === "plain" ? "" : ` wai-pill--${tone}`}`}>{children}</span>;
}

const TASK_TONE: Record<TaskState, Tone> = {
	queued: "plain",
	running: "info",
	needs_review: "pink",
	completed: "good",
	failed: "bad",
	cancelled: "plain",
	outcome_unknown: "warn",
};

/** A task's state, in words. "Needs review" is shown as "Awaiting review": the same state, a friendlier label. */
export function TaskStatePill({ state }: { state: TaskState }) {
	return (
		<Pill tone={TASK_TONE[state]}>
			{state === "needs_review" ? "Awaiting review" : TASK_STATE_LABELS[state]}
		</Pill>
	);
}

const READINESS_TONE: Record<ReadinessStatus, Tone> = {
	ready: "good",
	awaiting_configuration: "warn",
	blocked: "warn",
	disabled: "plain",
	unhealthy: "bad",
	planned: "plain",
};

export function ReadinessPill({ status }: { status: ReadinessStatus }) {
	return <Pill tone={READINESS_TONE[status]}>{READINESS_LABELS[status]}</Pill>;
}

export function PageHeader({
	title,
	lead,
	crumbs = [],
	actions,
}: {
	title: string;
	lead?: ReactNode;
	crumbs?: Array<{ label: string; href?: string }>;
	actions?: ReactNode;
}) {
	return (
		<header className="wai-page-head">
			<div>
				{crumbs.length > 0 && (
					<nav className="wai-crumbs" aria-label="Breadcrumb">
						<Link href={WORKSPACE_PATH}>Today</Link>
						{crumbs.map((crumb) => (
							<span key={crumb.label} className="wai-row" style={{ gap: 6 }}>
								<span aria-hidden>/</span>
								{crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span>{crumb.label}</span>}
							</span>
						))}
					</nav>
				)}
				<h1 className="wai-h1">{title}</h1>
				{lead && <p className="wai-lead">{lead}</p>}
			</div>
			{actions && <div className="wai-row">{actions}</div>}
		</header>
	);
}

export function Card({
	title,
	aside,
	accent,
	children,
	id,
}: {
	title?: ReactNode;
	aside?: ReactNode;
	accent?: boolean;
	children: ReactNode;
	id?: string;
}) {
	return (
		<section className={`wai-card${accent ? " wai-card--accent" : ""}`} id={id}>
			{(title || aside) && (
				<div className="wai-card-head">
					{title ? (
						<h2 className="wai-h2" style={{ margin: 0 }}>
							{title}
						</h2>
					) : (
						<span />
					)}
					{aside}
				</div>
			)}
			{children}
		</section>
	);
}

export function Notice({
	tone = "info",
	title,
	children,
}: {
	tone?: Exclude<Tone, "plain" | "pink">;
	title?: string;
	children?: ReactNode;
}) {
	return (
		<div className={`wai-notice wai-notice--${tone}`} role={tone === "bad" ? "alert" : "status"}>
			{title && <strong>{title}</strong>}
			{title && children ? " " : null}
			{children}
		</div>
	);
}

export function Empty({ children }: { children: ReactNode }) {
	return (
		<p className="wai-muted wai-small" style={{ margin: 0 }}>
			{children}
		</p>
	);
}

export function Stat({ value, label, href }: { value: ReactNode; label: string; href?: string }) {
	const body = (
		<div className="wai-stat">
			<span className="wai-stat-value">{value}</span>
			<span className="wai-stat-label">{label}</span>
		</div>
	);
	return href ? (
		<Link href={href} className="wai-card wai-card--link">
			{body}
		</Link>
	) : (
		<div className="wai-card">{body}</div>
	);
}

/** A time in Winnipeg, with how long ago it was. Stored times are UTC; this is the only place they become local wording. */
export function When({ at, now }: { at: string | null; now: Date }) {
	if (!at) return <span className="wai-muted">—</span>;
	return (
		<time dateTime={at} title={at}>
			{formatOpsDateTime(at)} <span className="wai-muted">({formatAge(at, now)})</span>
		</time>
	);
}

export function KeyValues({ items }: { items: Array<[string, ReactNode]> }) {
	return (
		<dl className="wai-kv">
			{items.map(([key, value]) => (
				<div key={key} style={{ display: "contents" }}>
					<dt>{key}</dt>
					<dd>{value}</dd>
				</div>
			))}
		</dl>
	);
}

export function Bullets({ items, empty }: { items: readonly ReactNode[]; empty?: string }) {
	if (items.length === 0) return empty ? <Empty>{empty}</Empty> : null;
	return (
		<ul className="wai-bullets">
			{items.map((item, index) => (
				<li key={index}>{item}</li>
			))}
		</ul>
	);
}

/** A table that can be scrolled sideways on a narrow screen without the page itself scrolling. */
export function DataTable({
	caption,
	columns,
	rows,
	numeric = [],
}: {
	caption: string;
	columns: readonly string[];
	rows: ReadonlyArray<readonly ReactNode[]>;
	numeric?: readonly number[];
}) {
	return (
		<div className="wai-table-wrap" role="region" aria-label={caption} tabIndex={0}>
			<table className="wai-table">
				<caption>{caption}</caption>
				<thead>
					<tr>
						{columns.map((column, index) => (
							<th key={column} scope="col" className={numeric.includes(index) ? "wai-num" : undefined}>
								{column}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, r) => (
						<tr key={r}>
							{row.map((cell, c) => (
								<td key={c} className={numeric.includes(c) ? "wai-num" : undefined}>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export const taskHref = (id: string) => `${WORKSPACE_PATH}/tasks/${id}`;
export const resultHref = (id: string) => `${WORKSPACE_PATH}/results/${id}`;
export const agentHref = (id: string) => `${WORKSPACE_PATH}/team/${id}`;
