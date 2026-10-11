import { HEADER_SIGNATURE, HEADER_TIMESTAMP, signRequest } from "../../../../openclaw-host/auth.mjs";
import { LIMITS } from "../../../../openclaw-host/job-spec.mjs";

/**
 * The storefront's side of the OpenClaw connection. It talks only to the restricted adapter running on the OpenClaw host
 * (never to OpenClaw directly), with every request signed using a shared secret that stays on the server. The interface
 * is small on purpose: submit a job, look a run up by the session id this application made, read a run, fetch one of its
 * files. Anything the adapter says is checked before it is believed.
 */

export type RemoteRunState = "queued" | "running" | "succeeded" | "failed" | "timed_out" | "unknown";

export type InspectionSpec = {
	type: "site.inspect";
	sessionId: string;
	urls: string[];
	viewports: ("desktop" | "mobile")[];
};

export type InspectionViewportResult = {
	viewport: "desktop" | "mobile";
	width: number;
	height: number;
	title?: string | null;
	screenshot: { file: string; sha256: string; bytes: number };
	consoleErrors: { text: string }[];
	pageErrors: { text: string }[];
	failedRequests: { url: string; status: number | null }[];
	diagnostics?: { console: boolean; pageErrors: boolean; requests: boolean };
};

export type InspectionFinding = {
	severity: "info" | "low" | "medium" | "high" | "critical";
	category: string;
	title: string;
	detail: string;
	url: string;
	viewport: string;
};

export type InspectionResult = {
	type: "site.inspect";
	sessionId: string;
	runId: string;
	startedAt: string;
	finishedAt: string;
	pages: { url: string; viewports: InspectionViewportResult[] }[];
	findings: InspectionFinding[];
};

export type RemoteRun = {
	runId: string;
	sessionId: string;
	state: RemoteRunState;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	result: InspectionResult | null;
	error: string | null;
};

export type ConnectorHealth = { ok: boolean; detail: string; latencyMs: number };

export type ConnectorErrorKind = "timeout" | "unreachable" | "rejected" | "not_found" | "bad_response";

/** `timeout` and `unreachable` are the "we don't know whether it arrived" cases; the others are answers. */
export class ConnectorError extends Error {
	constructor(
		readonly kind: ConnectorErrorKind,
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "ConnectorError";
	}
	get uncertain(): boolean {
		return this.kind === "timeout" || this.kind === "unreachable";
	}
}

export interface OpenClawConnector {
	health(): Promise<ConnectorHealth>;
	/** The run this application already started for a session id, or null. Used before submitting again after a timeout. */
	findRunBySession(sessionId: string): Promise<RemoteRun | null>;
	/** Starts a job. Asking again with the same session id returns the job already made. */
	submit(spec: InspectionSpec): Promise<RemoteRun>;
	getRun(runId: string): Promise<RemoteRun>;
	fetchFile(runId: string, name: string): Promise<Uint8Array>;
}

const RUN_ID = /^run_[0-9a-f-]{36}$/;
const STATES: readonly string[] = ["queued", "running", "succeeded", "failed", "timed_out", "unknown"];

function asRun(value: unknown, expectedSession?: string): RemoteRun {
	const r = value as Record<string, unknown> | null;
	if (
		!r ||
		typeof r !== "object" ||
		typeof r.runId !== "string" ||
		!RUN_ID.test(r.runId) ||
		typeof r.sessionId !== "string" ||
		!STATES.includes(String(r.state))
	)
		throw new ConnectorError(
			"bad_response",
			"The OpenClaw adapter sent a reply that wasn't in the expected form.",
		);
	if (expectedSession && r.sessionId !== expectedSession)
		throw new ConnectorError("bad_response", "The adapter's reply was for a different session.");
	return {
		runId: r.runId,
		sessionId: r.sessionId,
		state: r.state as RemoteRunState,
		createdAt: String(r.createdAt ?? ""),
		startedAt: (r.startedAt as string | null) ?? null,
		finishedAt: (r.finishedAt as string | null) ?? null,
		result: (r.result as InspectionResult | null) ?? null,
		error: typeof r.error === "string" ? r.error.slice(0, 500) : null,
	};
}

export type AdapterConnectorOptions = {
	url: string;
	secret: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	now?: () => number;
};

export function createAdapterConnector({
	url,
	secret,
	fetchImpl = fetch,
	timeoutMs = 15_000,
	now = Date.now,
}: AdapterConnectorOptions): OpenClawConnector {
	const base = url.replace(/\/+$/, "");

	async function request(
		method: "GET" | "POST",
		path: string,
		body?: unknown,
		options: { raw?: boolean } = {},
	): Promise<{ status: number; json?: unknown; bytes?: Uint8Array }> {
		const text = body === undefined ? "" : JSON.stringify(body);
		const timestamp = now();
		let response: Response;
		try {
			response = await fetchImpl(`${base}${path}`, {
				method,
				headers: {
					[HEADER_TIMESTAMP]: String(timestamp),
					[HEADER_SIGNATURE]: signRequest(secret, { method, path, body: text, timestamp }),
					...(text ? { "Content-Type": "application/json" } : {}),
				},
				body: text || undefined,
				cache: "no-store",
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (error) {
			const name = error instanceof Error ? error.name : "";
			throw new ConnectorError(
				name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable",
				name === "TimeoutError" || name === "AbortError"
					? "The OpenClaw adapter didn't answer in time."
					: "The OpenClaw adapter couldn't be reached.",
			);
		}
		if (response.status === 404) return { status: 404 };
		if (response.status === 401 || response.status === 403)
			throw new ConnectorError("rejected", "The OpenClaw adapter refused our credentials.", response.status);
		if (response.status === 422) {
			const detail = (await response.json().catch(() => null)) as { reasons?: string[] } | null;
			throw new ConnectorError(
				"rejected",
				`The adapter refused the job: ${(detail?.reasons ?? []).join(" ").slice(0, 300) || "not allowed"}`,
				422,
			);
		}
		if (response.status >= 500)
			throw new ConnectorError(
				"unreachable",
				`The OpenClaw adapter had a problem (${response.status}).`,
				response.status,
			);
		if (!response.ok)
			throw new ConnectorError(
				"bad_response",
				`The OpenClaw adapter answered ${response.status}.`,
				response.status,
			);
		if (options.raw) {
			const declared = Number(response.headers.get("content-length") ?? 0);
			if (declared > LIMITS.maxScreenshotBytes)
				throw new ConnectorError("bad_response", "A file was larger than allowed.");
			const bytes = new Uint8Array(await response.arrayBuffer());
			if (bytes.byteLength > LIMITS.maxScreenshotBytes)
				throw new ConnectorError("bad_response", "A file was larger than allowed.");
			return { status: response.status, bytes };
		}
		const json = await response.json().catch(() => {
			throw new ConnectorError("bad_response", "The OpenClaw adapter's reply wasn't JSON.");
		});
		return { status: response.status, json };
	}

	return {
		async health() {
			const started = now();
			try {
				const { json } = await request("GET", "/health");
				const r = json as { ok?: boolean; detail?: string };
				return {
					ok: r?.ok === true,
					detail: typeof r?.detail === "string" ? r.detail : "No detail given.",
					latencyMs: now() - started,
				};
			} catch (error) {
				return {
					ok: false,
					detail: error instanceof Error ? error.message : "The adapter couldn't be checked.",
					latencyMs: now() - started,
				};
			}
		},
		async findRunBySession(sessionId) {
			const reply = await request("GET", `/jobs?sessionId=${encodeURIComponent(sessionId)}`);
			return reply.status === 404 ? null : asRun(reply.json, sessionId);
		},
		async submit(spec) {
			const reply = await request("POST", "/jobs", spec);
			return asRun(reply.json, spec.sessionId);
		},
		async getRun(runId) {
			if (!RUN_ID.test(runId)) throw new ConnectorError("bad_response", "That isn't a run id.");
			const reply = await request("GET", `/jobs/${runId}`);
			if (reply.status === 404) throw new ConnectorError("not_found", "The adapter doesn't know that run.");
			return asRun(reply.json);
		},
		async fetchFile(runId, name) {
			if (!RUN_ID.test(runId) || !/^[a-z0-9][a-z0-9._-]{0,80}$/.test(name))
				throw new ConnectorError("bad_response", "That isn't a file the adapter serves.");
			const reply = await request("GET", `/jobs/${runId}/files/${name}`, undefined, { raw: true });
			if (reply.status === 404) throw new ConnectorError("not_found", "The adapter doesn't have that file.");
			return reply.bytes as Uint8Array;
		},
	};
}
