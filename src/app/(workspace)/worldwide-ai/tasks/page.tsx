import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_BY_ID } from "@/lib/worldwide-ai/agents/registry";
import { countTasksByState, listTasks } from "@/lib/worldwide-ai/tasks/repo";
import { TASK_STATES, WORKSPACE_PATH, isRoleId, type TaskState } from "@/lib/worldwide-ai/types";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import {
	DataTable,
	Empty,
	PageHeader,
	TaskStatePill,
	When,
	agentHref,
	taskHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Tasks" };

type Props = { searchParams: Promise<{ state?: string; owner?: string; demo?: string }> };

const isState = (value: string | undefined): value is TaskState =>
	TASK_STATES.some((state) => state === value);

/** Every task: one owning agent each, with its state. Personal tasks appear only to their owner; demonstration runs only when asked for. */
export default async function TasksPage({ searchParams }: Props) {
	const workspace = await getWorkspace();
	const { state, owner, demo } = await searchParams;
	const { sql, now } = workspace.runtime;
	const showDemo = demo === "1";
	const [counts, tasks] = await Promise.all([
		countTasksByState(sql),
		listTasks(sql, {
			state: isState(state) ? state : undefined,
			ownerRole: isRoleId(owner) ? owner : undefined,
			viewer: workspace.viewer,
			demo: showDemo ? "only" : undefined,
			limit: 100,
		}),
	]);
	const link = (next: { state?: string; demo?: boolean }) => {
		const query = new URLSearchParams();
		if (next.state) query.set("state", next.state);
		if (isRoleId(owner)) query.set("owner", owner);
		if (next.demo) query.set("demo", "1");
		const text = query.toString();
		return `${WORKSPACE_PATH}/tasks${text ? `?${text}` : ""}`;
	};

	return (
		<>
			<PageHeader
				title="Tasks"
				lead="Each task has one owning agent, says in advance what done means, and is only completed with evidence. A task that couldn't be confirmed is shown as outcome unknown, never as done."
			/>
			<nav className="wai-tabs" aria-label="Filter by state">
				<Link href={link({})} aria-current={!isState(state) && !showDemo ? "page" : undefined}>
					All
				</Link>
				{TASK_STATES.map((s) => (
					<Link
						key={s}
						href={link({ state: s })}
						aria-current={state === s && !showDemo ? "page" : undefined}
					>
						{s === "needs_review"
							? "Awaiting review"
							: s.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}{" "}
						({counts[s]})
					</Link>
				))}
				<Link href={link({ demo: true })} aria-current={showDemo ? "page" : undefined}>
					Demonstration runs
				</Link>
			</nav>
			{isRoleId(owner) && (
				<p className="wai-small">
					Showing tasks owned by <Link href={agentHref(owner)}>{ROLE_BY_ID[owner].name}</Link>.{" "}
					<Link href={`${WORKSPACE_PATH}/tasks`}>Show every agent</Link>
				</p>
			)}
			{tasks.length === 0 ? (
				<Empty>{showDemo ? "No demonstration run is on record." : "No task matches."}</Empty>
			) : (
				<DataTable
					caption={`${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}, newest first. Counts above leave out personal and demonstration work.`}
					columns={["Task", "Owner", "State", "Requested by", "Created"]}
					rows={tasks.map((task) => [
						<Link key="t" href={taskHref(task.id)}>
							{task.title}
						</Link>,
						<Link key="o" href={agentHref(task.ownerRole)}>
							{ROLE_BY_ID[task.ownerRole].name}
						</Link>,
						<TaskStatePill key="s" state={task.state} />,
						task.requestedByLabel ?? task.requestedBy,
						<When key="w" at={task.createdAt} now={now()} />,
					])}
				/>
			)}
		</>
	);
}
