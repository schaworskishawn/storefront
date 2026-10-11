import "server-only";

import { loadSettings } from "../agents/settings";
import { listPendingVersions } from "../atlas/service";
import { buildBriefing, type Briefing } from "../briefing";
import { listProducts, type WorkProduct } from "../functions/products";
import { teamReadiness, type TeamReadiness } from "../functions/readiness";
import { FUNCTIONS } from "../functions/registry";
import { configStatus, type ConfigStatus } from "../integrations/catalog";
import { latestHealth, type LatestHealth } from "../integrations/health";
import { listDrafts, type DraftRecord } from "../support/drafts";
import { listTasks, personalScopeOf, type TaskRecord } from "../tasks/repo";
import type { AppId } from "./apps";
import type { Workspace } from "./session";

/** What the pages read, gathered in one place. Every list is scoped to the person looking: their own personal work, and the shared work. */

export type TeamView = { team: TeamReadiness; statuses: ConfigStatus[]; health: LatestHealth[] };

export async function loadTeam(workspace: Workspace): Promise<TeamView> {
	const { sql } = workspace.runtime;
	const [settings, health] = await Promise.all([loadSettings(sql), latestHealth(sql)]);
	const statuses = configStatus(workspace.config);
	return {
		team: teamReadiness(FUNCTIONS, { statuses, health, enabled: (role) => settings[role].enabled }),
		statuses,
		health,
	};
}

export type Waiting = {
	drafts: DraftRecord[];
	products: WorkProduct[];
	versions: Awaited<ReturnType<typeof listPendingVersions>>;
};

/** Everything waiting for a person's decision that this person may see. */
export async function loadWaiting(workspace: Workspace): Promise<Waiting> {
	const { sql } = workspace.runtime;
	const [drafts, products, versions] = await Promise.all([
		listDrafts(sql, { state: "pending_review", limit: 50 }),
		listProducts(sql, { reviewState: "pending", viewer: workspace.viewer, limit: 50 }),
		listPendingVersions(sql),
	]);
	return { drafts, products, versions };
}

export async function navCounts(workspace: Workspace): Promise<Partial<Record<AppId, number>>> {
	const { sql } = workspace.runtime;
	const { rows } = await sql.query<{ drafts: number; products: number; versions: number; attention: number }>(
		`select
			(select count(*)::int from wai_drafts where state = 'pending_review') as drafts,
			(select count(*)::int from wai_work_products where review_state = 'pending' and not demo and (scope = 'business' or scope = $1)) as products,
			(select count(*)::int from wai_document_versions v join wai_documents d on d.id = v.document_id where v.status = 'draft' and d.status <> 'retired') as versions,
			(select count(*)::int from wai_tasks where state in ('failed', 'outcome_unknown') and not demo and (scope = 'business' or scope = $1)) as attention`,
		[personalScopeOf(workspace.viewer)],
	);
	const row = rows[0];
	return {
		review: Number(row.drafts) + Number(row.products) + Number(row.versions),
		tasks: Number(row.attention),
	};
}

export type TodayView = {
	briefing: Briefing;
	waiting: Waiting;
	active: TaskRecord[];
	attention: TaskRecord[];
	recent: WorkProduct[];
	team: TeamView;
};

export async function loadToday(workspace: Workspace): Promise<TodayView> {
	const { sql, now } = workspace.runtime;
	const [briefing, waiting, active, attention, recent, team] = await Promise.all([
		buildBriefing(sql, workspace.config, now()),
		loadWaiting(workspace),
		listTasks(sql, { state: ["queued", "running"], viewer: workspace.viewer, limit: 12 }),
		listTasks(sql, { state: ["failed", "outcome_unknown"], viewer: workspace.viewer, limit: 8 }),
		listProducts(sql, { viewer: workspace.viewer, limit: 6 }),
		loadTeam(workspace),
	]);
	return { briefing, waiting, active, attention, recent, team };
}
