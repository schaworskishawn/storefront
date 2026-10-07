/**
 * How much any one role may do in a task. Each role has defaults in the registry; the owner can lower or raise them from the
 * dashboard, but never past the hard caps here, which live in code so no setting can lift them.
 */

export type ExecutionLimits = {
	/** Calls to the model in one task (each step of a tool loop counts). */
	maxModelCalls: number;
	/** Tool calls in one task. */
	maxToolCalls: number;
	/** Retries of a failed model call. */
	maxRetries: number;
	/** How many levels of task a role may hand on (a task created by a task created by a task…). */
	maxDelegationDepth: number;
	/** Tasks of this role running at the same time. */
	maxConcurrentTasks: number;
	/** Wall-clock seconds a task may run before it is stopped and marked outcome unknown. */
	maxTaskSeconds: number;
	/** Output tokens per model call. */
	maxOutputTokens: number;
};

export const LIMIT_KEYS = [
	"maxModelCalls",
	"maxToolCalls",
	"maxRetries",
	"maxDelegationDepth",
	"maxConcurrentTasks",
	"maxTaskSeconds",
	"maxOutputTokens",
] as const satisfies readonly (keyof ExecutionLimits)[];

export const HARD_CAPS: ExecutionLimits = {
	maxModelCalls: 8,
	maxToolCalls: 40,
	maxRetries: 3,
	maxDelegationDepth: 3,
	maxConcurrentTasks: 5,
	maxTaskSeconds: 600,
	maxOutputTokens: 4000,
};

/** The lowest each limit can be set to. Retries and delegation may be zero; everything else needs at least one. */
const FLOORS: ExecutionLimits = {
	maxModelCalls: 1,
	maxToolCalls: 1,
	maxRetries: 0,
	maxDelegationDepth: 0,
	maxConcurrentTasks: 1,
	maxTaskSeconds: 10,
	maxOutputTokens: 100,
};

export const DEFAULT_LIMITS: ExecutionLimits = {
	maxModelCalls: 3,
	maxToolCalls: 12,
	maxRetries: 2,
	maxDelegationDepth: 1,
	maxConcurrentTasks: 2,
	maxTaskSeconds: 120,
	maxOutputTokens: 1500,
};

/** Applies a role's saved overrides on top of its defaults, whole numbers only, always inside [floor, hard cap]. */
export function resolveLimits(base: ExecutionLimits, overrides: unknown): ExecutionLimits {
	const result = { ...base };
	if (overrides && typeof overrides === "object") {
		for (const key of LIMIT_KEYS) {
			const raw = (overrides as Record<string, unknown>)[key];
			if (typeof raw === "number" && Number.isFinite(raw)) {
				result[key] = Math.min(HARD_CAPS[key], Math.max(FLOORS[key], Math.floor(raw)));
			}
		}
	}
	// A registry default can't escape the caps either.
	for (const key of LIMIT_KEYS) result[key] = Math.min(HARD_CAPS[key], Math.max(FLOORS[key], result[key]));
	return result;
}

/** Cleans a limits object submitted from the dashboard down to the known keys with valid whole numbers, or explains why not. */
export function parseLimitOverrides(
	input: unknown,
): { ok: true; value: Partial<ExecutionLimits> } | { ok: false; message: string } {
	if (!input || typeof input !== "object") return { ok: false, message: "Limits must be an object." };
	const value: Partial<ExecutionLimits> = {};
	for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
		if (!(LIMIT_KEYS as readonly string[]).includes(key))
			return { ok: false, message: `"${key}" is not a limit.` };
		const k = key as keyof ExecutionLimits;
		if (typeof raw !== "number" || !Number.isInteger(raw))
			return { ok: false, message: `${key} must be a whole number.` };
		if (raw < FLOORS[k] || raw > HARD_CAPS[k])
			return { ok: false, message: `${key} must be between ${FLOORS[k]} and ${HARD_CAPS[k]}.` };
		value[k] = raw;
	}
	return { ok: true, value };
}
