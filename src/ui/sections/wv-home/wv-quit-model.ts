/**
 * Data model + pure logic for the /quit nicotine reduction program.
 * Everything is stored in the visitor's own browser (localStorage) — nothing is sent to a server.
 */

export const STORAGE_KEY = "wv-quit-v3";

/** The strongest e-liquid Worldwide Vapor sells (mg/mL). The setup never offers or suggests anything above it. */
export const MAX_STRENGTH = 20;
/** Strengths offered to someone who already vapes. */
export const STRENGTHS = [3, 6, 12, 18, MAX_STRENGTH];

export type Stage = {
	name: string;
	strength: number;
	days: number;
	taper?: boolean;
	/**
	 * Daily puff allowance as a share of the baseline, moving in a straight line from `from` on the first day of the
	 * stage to `to` on the last. Plans saved before this existed have none and just show the baseline.
	 */
	puffs?: { from: number; to: number };
};

export type Plan = {
	stages: Stage[];
	/** Index of the current stage; equals `stages.length` once the program is complete. */
	currentIndex: number;
	/** Local date (YYYY-MM-DD) the current stage started. */
	stageStartedAt: string;
	startedAt: string;
};

export type Log = { date: string; strength: number; puffs: number };

export type QuitData = {
	v: 3;
	plan: Plan;
	logs: Record<string, Log>;
	/** True once the visitor has completed the setup wizard. */
	setup: boolean;
	/** What the visitor uses, chosen during onboarding. */
	product: string;
	/** Daily puffs baseline collected during onboarding, before any reduction. */
	baselinePuffs: number;
	sample: boolean;
	/** When this copy last changed (ms since epoch). The newest copy wins when this browser and the account disagree. */
	savedAt?: number;
};

/* ---------- dates (local time) ---------- */

export function toDateStr(d = new Date()): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseLocal(s: string): Date {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(y, m - 1, d);
}
export function addDays(s: string, n: number): string {
	const d = parseLocal(s);
	d.setDate(d.getDate() + n);
	return toDateStr(d);
}
export function daysBetween(a: string, b: string): number {
	return Math.round((parseLocal(b).getTime() - parseLocal(a).getTime()) / 86_400_000);
}
export function dayLabel(s: string): string {
	return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(
		parseLocal(s),
	);
}

/* ---------- defaults ---------- */

export type Pace = { id: "gentle" | "steady" | "faster"; label: string; days: number; blurb: string };
export const PACES: Pace[] = [
	{ id: "gentle", label: "Gentle", days: 14, blurb: "Two weeks per step. Easiest on cravings." },
	{ id: "steady", label: "Steady", days: 7, blurb: "One week per step. Recommended for most people." },
	{
		id: "faster",
		label: "Faster",
		days: 5,
		blurb: "Five days per step. Quicker, but expect stronger cravings.",
	},
];

/** How far each step lowers the nicotine strength (mg/mL). */
export const STRENGTH_STEP = 2;
/** How much higher the daily puff allowance starts, as a share of the baseline, each time the strength drops. */
export const PUFF_BUMP = 0.2;

/**
 * Builds the plan from the starting strength: it drops `STRENGTH_STEP` mg at a time until it reaches 0 mg. Every time
 * the strength drops the puff allowance goes up by `PUFF_BUMP` (people puff more on a weaker liquid), then eases back
 * to the baseline over the stage, before the next drop. At 0 mg the puffs ease all the way down to none.
 */
export function generateStages(strength: number, daysPerStage: number): Stage[] {
	const start = Math.max(1, Math.round(strength));
	const levels: number[] = [];
	for (let v = start; v > 0; v -= STRENGTH_STEP) levels.push(v);
	levels.push(0);
	return levels.map((level, i): Stage => {
		if (i === 0) return { name: "Baseline", strength: level, days: daysPerStage, puffs: { from: 1, to: 1 } };
		if (level === 0) {
			return {
				name: "Final Taper",
				strength: 0,
				days: daysPerStage * 2,
				taper: true,
				puffs: { from: 1 + PUFF_BUMP, to: 0 },
			};
		}
		return { name: "Reduction", strength: level, days: daysPerStage, puffs: { from: 1 + PUFF_BUMP, to: 1 } };
	});
}

/** The puff allowance for day `dayInStage` (0 = the first day) of a stage, or null when there is nothing to base it on. */
export function puffTargetFor(stage: Stage | undefined, baseline: number, dayInStage: number): number | null {
	if (!stage?.puffs || baseline <= 0) return null;
	const span = Math.max(1, stage.days - 1);
	const t = Math.min(1, Math.max(0, dayInStage / span));
	return Math.round(baseline * (stage.puffs.from + (stage.puffs.to - stage.puffs.from) * t));
}

export function defaultData(today = toDateStr()): QuitData {
	return {
		v: 3,
		plan: { stages: generateStages(20, 7), currentIndex: 0, stageStartedAt: today, startedAt: today },
		logs: {},
		setup: false,
		product: "Vape",
		baselinePuffs: 0,
		sample: false,
	};
}

/** The saved data for a brand-new plan. Nothing is logged yet, so today starts at 0 puffs and climbs as you log. */
export function startingData(
	today: string,
	o: { product: string; baselinePuffs: number; stages: Stage[] },
): QuitData {
	const base = defaultData(today);
	return {
		...base,
		setup: true,
		product: o.product,
		baselinePuffs: o.baselinePuffs,
		plan: { ...base.plan, stages: o.stages },
		logs: {},
	};
}

/* ---------- storage ---------- */

/** Most steps and most logged days a stored plan may have (keeps what is saved to an account a sensible size). */
export const MAX_STAGES = 60;
export const MAX_LOG_DAYS = 800;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isDate = (x: unknown): x is string => typeof x === "string" && DATE_RE.test(x);

/**
 * Reads a stored plan (from this browser or from the account) and returns a clean copy, or null when it isn't one.
 * It rebuilds the object field by field, so nothing unexpected is carried along, and drops malformed log entries.
 */
export function parseQuitData(raw: string | null | undefined): QuitData | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const o = parsed as Record<string, unknown>;
	if (o.v !== 3) return null;

	const plan = o.plan as Record<string, unknown> | null | undefined;
	if (!plan || !Array.isArray(plan.stages) || plan.stages.length < 1 || plan.stages.length > MAX_STAGES)
		return null;
	const stages: Stage[] = [];
	for (const item of plan.stages as unknown[]) {
		if (!item || typeof item !== "object") return null;
		const st = item as Record<string, unknown>;
		if (
			typeof st.name !== "string" ||
			!isNum(st.strength) ||
			!isNum(st.days) ||
			st.strength < 0 ||
			st.days < 1
		) {
			return null;
		}
		const stage: Stage = { name: st.name.slice(0, 40), strength: st.strength, days: Math.round(st.days) };
		if (st.taper === true) stage.taper = true;
		const puffs = st.puffs as Record<string, unknown> | null | undefined;
		if (puffs && isNum(puffs.from) && isNum(puffs.to) && puffs.from >= 0 && puffs.to >= 0) {
			stage.puffs = { from: puffs.from, to: puffs.to };
		}
		stages.push(stage);
	}
	const index = plan.currentIndex;
	if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > stages.length)
		return null;
	if (!isDate(plan.stageStartedAt) || !isDate(plan.startedAt)) return null;

	const logs: Record<string, Log> = {};
	const entries =
		o.logs && typeof o.logs === "object" ? Object.values(o.logs as Record<string, unknown>) : [];
	for (const entry of entries) {
		const l = entry as Record<string, unknown> | null;
		if (!l || !isDate(l.date) || !isNum(l.strength) || !isNum(l.puffs) || l.puffs < 0) continue;
		logs[l.date] = { date: l.date, strength: l.strength, puffs: Math.round(l.puffs) };
	}
	const days = Object.keys(logs).sort();
	for (const old of days.slice(0, Math.max(0, days.length - MAX_LOG_DAYS))) delete logs[old];

	return {
		v: 3,
		plan: { stages, currentIndex: index, stageStartedAt: plan.stageStartedAt, startedAt: plan.startedAt },
		logs,
		setup: o.setup === true,
		product: typeof o.product === "string" ? o.product.slice(0, 30) : "Vape",
		baselinePuffs: isNum(o.baselinePuffs) && o.baselinePuffs > 0 ? Math.round(o.baselinePuffs) : 0,
		sample: o.sample === true,
		...(isNum(o.savedAt) ? { savedAt: o.savedAt } : {}),
	};
}

/** Marks a copy as changed now. */
export function stamp(d: QuitData, now = Date.now()): QuitData {
	return { ...d, savedAt: now };
}

/** When a copy last changed. Copies saved before timestamps existed fall back to their latest activity date. */
export function updatedAt(d: QuitData): number {
	if (d.savedAt !== undefined) return d.savedAt;
	const dates = [d.plan.startedAt, d.plan.stageStartedAt, ...Object.keys(d.logs)];
	return Math.max(...dates.map((x) => parseLocal(x).getTime()));
}

export type Picked = { data: QuitData | null; source: "local" | "account" | "none" };

/** Of this browser's copy and the account's copy, the one that changed last (a tie keeps this browser's). */
export function pickNewest(local: QuitData | null, account: QuitData | null): Picked {
	if (!local && !account) return { data: null, source: "none" };
	if (!account) return { data: local, source: "local" };
	if (!local) return { data: account, source: "account" };
	return updatedAt(account) > updatedAt(local)
		? { data: account, source: "account" }
		: { data: local, source: "local" };
}

/** True when the account's copy is missing or older than the one in hand, so it should be saved to the account. */
export function needsUpload(mine: QuitData, account: QuitData | null): boolean {
	return !account || updatedAt(mine) > updatedAt(account);
}

export function loadData(): QuitData | null {
	try {
		return parseQuitData(localStorage.getItem(STORAGE_KEY));
	} catch {
		return null;
	}
}
export function saveData(d: QuitData): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
	} catch {
		/* storage unavailable (private mode / full) — the app still works for this session */
	}
}

/* ---------- plan logic ---------- */

export const isComplete = (p: Plan) => p.currentIndex >= p.stages.length;

export function daysInStage(p: Plan, today: string): number {
	return Math.max(0, daysBetween(p.stageStartedAt, today));
}

export function currentStrength(p: Plan): number {
	return isComplete(p) ? 0 : p.stages[p.currentIndex].strength;
}

/** Average puffs over the days that have a log (0 when there are none). */
function averageLoggedPuffs(d: QuitData): number {
	const used = Object.values(d.logs)
		.map((l) => l.puffs)
		.filter((n) => n > 0);
	return used.length ? Math.round(used.reduce((a, n) => a + n, 0) / used.length) : 0;
}

export function advanceStage(d: QuitData, today: string): QuitData {
	const p = d.plan;
	if (isComplete(p)) return d;
	const next = p.currentIndex + 1;
	// Someone switching from cigarettes starts with no puff baseline; what they logged so far becomes it.
	const baselinePuffs = d.baselinePuffs > 0 ? d.baselinePuffs : averageLoggedPuffs(d);
	return { ...d, baselinePuffs, plan: { ...p, currentIndex: next, stageStartedAt: today } };
}

export function goBackStage(d: QuitData, today: string): QuitData {
	const p = d.plan;
	if (p.currentIndex <= 0) return d;
	return { ...d, plan: { ...p, currentIndex: p.currentIndex - 1, stageStartedAt: today } };
}

/** Today's puff allowance for the current stage, or null when the plan is done or there is no baseline yet. */
export function todayPuffTarget(d: QuitData, today: string): number | null {
	const p = d.plan;
	if (isComplete(p)) return null;
	return puffTargetFor(p.stages[p.currentIndex], d.baselinePuffs, daysInStage(p, today));
}

/** Quick-log a puff count against today, creating today's entry if it doesn't exist yet. */
export function addPuffsToday(d: QuitData, today: string, n: number): QuitData {
	const cur = d.logs[today];
	const strength = currentStrength(d.plan) || d.plan.stages[0]?.strength || 0;
	const next: Log = cur
		? { ...cur, puffs: Math.max(0, cur.puffs + n) }
		: { date: today, strength, puffs: Math.max(0, n) };
	return { ...d, logs: { ...d.logs, [today]: next } };
}

export function resetPuffsToday(d: QuitData, today: string): QuitData {
	const cur = d.logs[today];
	if (!cur) return d;
	return { ...d, logs: { ...d.logs, [today]: { ...cur, puffs: 0 } } };
}

/* ---------- stats ---------- */

export function logsBetween(d: QuitData, from: string, to: string): Log[] {
	return Object.values(d.logs)
		.filter((l) => l.date >= from && l.date <= to)
		.sort((a, b) => a.date.localeCompare(b.date));
}

export function streak(d: QuitData, today: string): number {
	let day = d.logs[today] ? today : addDays(today, -1);
	let count = 0;
	while (d.logs[day]) {
		count++;
		day = addDays(day, -1);
	}
	return count;
}

export function computeStats(d: QuitData, today: string) {
	const p = d.plan;
	const n = p.stages.length;
	const complete = isComplete(p);
	const inStage = complete ? 0 : daysInStage(p, today);
	const stageDays = complete ? 0 : p.stages[p.currentIndex].days;
	const remainingCurrent = Math.max(0, stageDays - inStage);
	const remainingLater = complete ? 0 : p.stages.slice(p.currentIndex + 1).reduce((a, s) => a + s.days, 0);
	const progress = complete ? 1 : (p.currentIndex + Math.min(1, stageDays ? inStage / stageDays : 0)) / n;
	return {
		n,
		complete,
		strength: currentStrength(p),
		remainingDays: remainingCurrent + remainingLater,
		remainingCurrent,
		progress,
		pct: Math.round(progress * 100),
		inStage,
		stageDays,
		ready: !complete && remainingCurrent === 0,
	};
}
