import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";
import { deriveFindings } from "./findings.mjs";
import { LIMITS, SCREENSHOT_EXTENSIONS, VIEWPORTS } from "./job-spec.mjs";
import { findScreenshotPath, readFailedRequests, readMessages, readTitle } from "./parse-cli.mjs";

/**
 * Runs one site inspection by driving OpenClaw's dedicated browser through its `openclaw browser` commands, one fixed
 * command at a time, with no shell and no arguments taken from anywhere but the validated job. It records only what the
 * browser reported. A step that fails, a screenshot that can't be found, or a deadline that passes ends the job as failed or
 * timed out: nothing is filled in.
 */

export class RunnerError extends Error {
	/** @param {"failed" | "timed_out"} kind @param {string} message */
	constructor(kind, message) {
		super(message);
		this.name = "RunnerError";
		this.kind = kind;
	}
}

/** @type {(bin: string, args: string[], options: { timeoutMs: number }) => Promise<{ stdout: string, stderr: string }>} */
export const defaultExec = (bin, args, { timeoutMs }) =>
	new Promise((resolve, reject) => {
		execFile(
			bin,
			args,
			{ timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024, shell: false, windowsHide: true },
			(error, stdout, stderr) => {
				if (error) reject(Object.assign(error, { stdout, stderr }));
				else resolve({ stdout, stderr });
			},
		);
	});

const defaultFiles = { realpath, stat, readFile, writeFile, mkdir };

const isInside = (dir, target) => {
	const rel = relative(dir, target);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

const wasTimeout = (error) =>
	Boolean(
		error &&
		(error.killed === true || error.code === "ETIMEDOUT" || /timed out/i.test(String(error.message))),
	);

/**
 * @param {{
 *   exec?: typeof defaultExec,
 *   bin?: string,
 *   profile: string,
 *   mediaDirs: string[],
 *   files?: typeof defaultFiles,
 *   now?: () => number,
 * }} options
 */
export function createRunner({
	exec = defaultExec,
	bin = "openclaw",
	profile,
	mediaDirs,
	files = defaultFiles,
	now = Date.now,
}) {
	/**
	 * @param {{ runId: string, spec: { sessionId: string, urls: string[], viewports: ("desktop" | "mobile")[] } }} job
	 * @param {string} jobDir where this job's files are kept
	 */
	async function inspect(job, jobDir) {
		const startedAt = new Date(now()).toISOString();
		const deadline = now() + LIMITS.maxSeconds * 1000;
		/** @param {string[]} args @param {{ ignoreDeadline?: boolean }} [opts] */
		const step = async (args, opts = {}) => {
			const remaining = opts.ignoreDeadline ? LIMITS.stepSeconds * 1000 : deadline - now();
			if (remaining <= 1000)
				throw new RunnerError("timed_out", `The inspection ran past its ${LIMITS.maxSeconds}-second limit.`);
			try {
				const { stdout } = await exec(bin, ["browser", "--browser-profile", profile, "--json", ...args], {
					timeoutMs: Math.min(LIMITS.stepSeconds * 1000, remaining),
				});
				return stdout;
			} catch (error) {
				if (wasTimeout(error))
					throw new RunnerError("timed_out", `OpenClaw didn't answer "${args[0]}" in time.`);
				throw new RunnerError("failed", `OpenClaw's "${args[0]}" command failed.`);
			}
		};

		/** Saves the screenshot where this job's files are kept, after checking it is where OpenClaw is allowed to write. */
		async function saveEvidence(source, name) {
			const real = await files.realpath(source).catch(() => null);
			if (!real) throw new RunnerError("failed", "OpenClaw reported a screenshot file that doesn't exist.");
			const roots = await Promise.all(mediaDirs.map((d) => files.realpath(d).catch(() => d)));
			if (!roots.some((dir) => isInside(dir, real)))
				throw new RunnerError(
					"failed",
					"The screenshot was saved outside the folders the adapter reads from.",
				);
			const info = await files.stat(real);
			if (!info.isFile() || info.size <= 0 || info.size > LIMITS.maxScreenshotBytes)
				throw new RunnerError("failed", "The screenshot file is empty or too large.");
			const bytes = await files.readFile(real);
			await files.mkdir(join(jobDir, "screenshots"), { recursive: true });
			await files.writeFile(join(jobDir, "screenshots", name), bytes);
			return { file: name, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
		}

		/** @type {any[]} */
		const pages = [];
		try {
			// Starting an already-running browser may report an error; if the browser really isn't there, the next step fails.
			await step(["start", "--headless"]).catch((error) => {
				if (error instanceof RunnerError && error.kind === "timed_out") throw error;
			});
			for (const [pageIndex, url] of job.spec.urls.entries()) {
				const viewports = [];
				for (const viewport of job.spec.viewports) {
					const size = VIEWPORTS[viewport];
					await step(["resize", String(size.width), String(size.height)]);
					const opened = await step(["open", url]);
					const title = readTitle(opened);
					const sourcePath = findScreenshotPath(await step(["screenshot", "--full-page"]));
					if (!sourcePath)
						throw new RunnerError(
							"failed",
							`OpenClaw didn't say where it saved the ${viewport} screenshot of ${url}.`,
						);
					const extension = extname(sourcePath).slice(1).toLowerCase();
					if (!SCREENSHOT_EXTENSIONS.includes(extension))
						throw new RunnerError("failed", "The screenshot isn't an image file.");
					const screenshot = await saveEvidence(
						sourcePath,
						`${pageIndex + 1}-${viewport}.${extension === "jpeg" ? "jpg" : extension}`,
					);

					// What the browser saw. If a diagnostic can't be read, say it is unavailable rather than reporting "none".
					const read = async (args, reader) => {
						try {
							return { ok: true, value: reader(await step(args)) };
						} catch (error) {
							if (error instanceof RunnerError && error.kind === "timed_out") throw error;
							return { ok: false, value: [] };
						}
					};
					const consoleOut = await read(["console", "--level", "error"], readMessages);
					const errorsOut = await read(["errors"], readMessages);
					const requestsOut = await read(["requests"], readFailedRequests);
					await step(["close"]).catch(() => undefined);

					viewports.push({
						viewport,
						width: size.width,
						height: size.height,
						title,
						screenshot,
						consoleErrors: consoleOut.value,
						pageErrors: errorsOut.value,
						failedRequests: requestsOut.value,
						diagnostics: { console: consoleOut.ok, pageErrors: errorsOut.ok, requests: requestsOut.ok },
					});
				}
				pages.push({ url, viewports });
			}
		} finally {
			await step(["stop"], { ignoreDeadline: true }).catch(() => undefined);
		}

		const findings = deriveFindings(pages);
		for (const page of pages)
			for (const v of page.viewports) {
				const missing = Object.entries(v.diagnostics)
					.filter(([, ok]) => !ok)
					.map(([name]) => name);
				if (missing.length)
					findings.push({
						severity: "low",
						category: "site-inspection",
						title: `Some diagnostics couldn't be read (${v.viewport})`,
						detail: `Could not read: ${missing.join(", ")}. The absence of errors there is not confirmed.`,
						url: page.url,
						viewport: v.viewport,
					});
			}
		return {
			type: "site.inspect",
			sessionId: job.spec.sessionId,
			runId: job.runId,
			startedAt,
			finishedAt: new Date(now()).toISOString(),
			pages,
			findings,
		};
	}

	return { inspect };
}
