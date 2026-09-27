/**
 * Data model + pure logic for the /quit nicotine reduction program.
 * Everything is stored in the visitor's own browser (localStorage) — nothing is sent to a server.
 */

export const STORAGE_KEY = "wv-quit-v3";

export type Stage = { name: string; strength: number; days: number; taper?: boolean };

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

/** Builds a step-down plan from the current strength: roughly 20% cuts each stage, then a longer final taper. */
export function generateStages(strength: number, daysPerStage: number): Stage[] {
	const s = Math.max(1, Math.round(strength));
	const raw = [1, 0.8, 0.6, 0.45, 0.3, 0.15].map((f) => Math.max(1, Math.round(s * f)));
	const values: number[] = [];
	for (const v of raw) if (values[values.length - 1] !== v) values.push(v);
	if (values.length < 2) values.push(0);
	const names = (i: number, n: number) =>
		i === 0 ? "Baseline" : i === n - 1 ? "Final Taper" : i === 3 ? "Stabilize" : "Reduction";
	return values.map((strength, i) => ({
		name: names(i, values.length),
		strength,
		days: i === values.length - 1 ? daysPerStage * 2 : daysPerStage,
		...(i === values.length - 1 ? { taper: true } : {}),
	}));
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

/** The mockup's example state (a few days into stage 4, a downward puff trend). */
export function sampleData(today = toDateStr()): QuitData {
	const base = defaultData(addDays(today, -18));
	const stages = generateStages(20, 7);
	const puffs = [182, 176, 171, 174, 169, 166, 163, 168, 170, 165, 162, 167, 160, 158];
	const logs: Record<string, Log> = {};
	for (let i = 0; i < 14; i++) {
		const date = addDays(today, -(13 - i));
		logs[date] = {
			date,
			strength: i < 7 ? (stages[2]?.strength ?? 16) : (stages[3]?.strength ?? 14),
			puffs: puffs[i],
		};
	}
	return {
		...base,
		setup: true,
		product: "Vape",
		baselinePuffs: 182,
		plan: { stages, currentIndex: 3, stageStartedAt: addDays(today, -4), startedAt: addDays(today, -18) },
		logs,
		sample: true,
	};
}

/* ---------- storage ---------- */

export function loadData(): QuitData | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const d = JSON.parse(raw) as QuitData;
		if (d?.v !== 3 || !d.plan?.stages?.length) return null;
		return d;
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

export function advanceStage(d: QuitData, today: string): QuitData {
	const p = d.plan;
	if (isComplete(p)) return d;
	const next = p.currentIndex + 1;
	return { ...d, plan: { ...p, currentIndex: next, stageStartedAt: today } };
}

export function goBackStage(d: QuitData, today: string): QuitData {
	const p = d.plan;
	if (p.currentIndex <= 0) return d;
	return { ...d, plan: { ...p, currentIndex: p.currentIndex - 1, stageStartedAt: today } };
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
