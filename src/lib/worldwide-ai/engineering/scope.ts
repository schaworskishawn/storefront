/**
 * Which files a change may touch. Pure, so it can be tested without a repository, and used both when a job is described and
 * when a package comes back.
 *
 * A path is relative to the repository root, with forward slashes and nothing that could climb out of it. A pattern is a
 * path with `*` (anything within one folder), `**` (anything, across folders) and `?` (one character). Everything a package
 * changes has to match the job's scope and none of it may match a protected pattern. One file out of place refuses the
 * whole package: a change is taken whole or not at all.
 */

export class ScopeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScopeError";
	}
}

/**
 * Paths no coding job may change, whatever its scope says: secrets, the checks that gate a merge, and the code that decides
 * who may do what, including this file. A change to any of these is a person's to make.
 */
export const ALWAYS_PROTECTED: readonly string[] = [
	".env",
	".env.*",
	"**/.env",
	"**/.env.*",
	".git/**",
	".github/**",
	".husky/**",
	"vercel.json",
	"trigger.config.*",
	"supabase/migrations/**",
	"src/lib/worldwide-ai/auth/**",
	"src/lib/worldwide-ai/agents/**",
	"src/lib/worldwide-ai/engineering/**",
	"src/lib/worldwide-ai/skills/**",
];

/** A path as it is compared and stored. Refuses anything absolute, climbing, or oddly written. */
export function normalizeRepoPath(raw: unknown): string {
	if (typeof raw !== "string" || raw.length === 0) throw new ScopeError("A file path is missing.");
	if (raw.length > 400) throw new ScopeError("A file path is too long.");
	if (/[\u0000-\u001f\u007f]/.test(raw)) throw new ScopeError(`"${raw}" has a control character in it.`);
	if (raw.includes("\\")) throw new ScopeError(`"${raw}" uses backslashes. Paths use forward slashes.`);
	if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.startsWith("~"))
		throw new ScopeError(`"${raw}" is not a path inside the repository.`);
	const parts = raw.split("/");
	if (parts.some((part) => part === ".." || part === "." || part === ""))
		throw new ScopeError(`"${raw}" isn't a plain path: it has an empty, "." or ".." part.`);
	if (parts.some((part) => part !== part.trim() || part.endsWith(".")))
		throw new ScopeError(`"${raw}" has a part that begins or ends with a space or ends with a dot.`);
	return parts.join("/");
}

/** A pattern as it is stored. The same rules as a path, plus the wildcard characters. */
export function normalizePattern(raw: unknown): string {
	if (typeof raw !== "string") throw new ScopeError("A path pattern is missing.");
	const text = raw.trim();
	if (!/^[A-Za-z0-9._@()\[\]\-+/*?]+$/.test(text))
		throw new ScopeError(
			`"${text}" isn't a path pattern. Use letters, digits, . _ - / and the wildcards * ** ?.`,
		);
	// A pattern is checked as a path with its wildcards stood in for, so it can't climb out either.
	normalizeRepoPath(text.replace(/\*\*/g, "x").replace(/[*?]/g, "x"));
	return text;
}

/** Reads patterns typed one to a line. */
export function parsePatterns(text: unknown): string[] {
	const lines = (typeof text === "string" ? text : "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	return [...new Set(lines.map(normalizePattern))];
}

function toRegExp(pattern: string): RegExp {
	let source = "";
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === "*" && pattern[i + 1] === "*") {
			// "**/" also matches nothing, so "src/**/a.ts" matches "src/a.ts".
			if (pattern[i + 2] === "/") {
				source += "(?:.*/)?";
				i += 2;
			} else {
				source += ".*";
				i += 1;
			}
		} else if (char === "*") source += "[^/]*";
		else if (char === "?") source += "[^/]";
		else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${source}$`);
}

/** Whether a path matches any of the patterns. Case matters, as it does in the repository. */
export const matchesAny = (path: string, patterns: readonly string[]): boolean =>
	patterns.some((pattern) => toRegExp(pattern).test(path));

export type ChangedFile = {
	path: string;
	change: "added" | "modified" | "deleted" | "renamed";
	/** The file mode Git records. 120000 is a symbolic link and 160000 a submodule; neither is accepted. */
	mode?: string;
	/** Where a renamed file was before. Both ends of a rename have to be in scope. */
	previousPath?: string;
};

export type ScopePolicy = { scope: readonly string[]; protectedPaths: readonly string[] };

/**
 * Checks every file a package says it changes. Returns the files with their paths normalized, and every reason the package
 * can't be accepted. An empty list of reasons is the only pass.
 */
export function checkChangedFiles(
	files: readonly ChangedFile[],
	policy: ScopePolicy,
): { files: ChangedFile[]; violations: string[] } {
	const violations: string[] = [];
	const normalized: ChangedFile[] = [];
	const seen = new Set<string>();
	const guarded = [...ALWAYS_PROTECTED, ...policy.protectedPaths];
	const check = (path: string, what: string) => {
		if (matchesAny(path, guarded))
			violations.push(`${path} is protected and can't be ${what} by a coding job.`);
		else if (!matchesAny(path, policy.scope)) violations.push(`${path} is outside what this job may change.`);
	};
	if (files.length === 0) violations.push("The package lists no changed files.");
	if (files.length > 400) violations.push("The package changes more than 400 files.");
	for (const file of files.slice(0, 400)) {
		let path: string;
		try {
			path = normalizeRepoPath(file.path);
		} catch (error) {
			violations.push(error instanceof Error ? error.message : "A path can't be read.");
			continue;
		}
		if (!["added", "modified", "deleted", "renamed"].includes(file.change)) {
			violations.push(`${path}: "${String(file.change)}" isn't a kind of change.`);
			continue;
		}
		if (seen.has(path)) violations.push(`${path} is listed twice.`);
		seen.add(path);
		if (file.mode === "120000") violations.push(`${path} is a symbolic link. Links are not accepted.`);
		if (file.mode === "160000") violations.push(`${path} is a submodule. Submodules are not accepted.`);
		check(path, file.change === "deleted" ? "deleted" : "changed");
		let previousPath: string | undefined;
		if (file.change === "renamed") {
			try {
				previousPath = normalizeRepoPath(file.previousPath);
				check(previousPath, "moved");
			} catch (error) {
				violations.push(
					`${path}: ${error instanceof Error ? error.message : "its earlier path can't be read."}`,
				);
			}
		}
		normalized.push({
			path,
			change: file.change,
			...(file.mode ? { mode: file.mode } : {}),
			...(previousPath ? { previousPath } : {}),
		});
	}
	return { files: normalized, violations };
}

/**
 * The paths a unified diff says it touches, from its "diff --git" lines. A package's list of files has to be exactly these:
 * a list that leaves one out would let a change through unseen.
 */
export function pathsInDiff(diff: string): string[] {
	const paths = new Set<string>();
	for (const line of diff.split(/\r?\n/)) {
		const header = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
		if (header) {
			paths.add(header[1]);
			paths.add(header[2]);
		}
	}
	return [...paths].sort();
}
