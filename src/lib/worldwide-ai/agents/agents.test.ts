import { describe, expect, it, vi } from "vitest";
import { COLLECTION_IDS } from "../atlas/collections";
import { ROLE_COUNT, ROLE_IDS, TASK_KINDS } from "../types";
import { createToolGateway, type GatewayEvent, type ToolHandlers } from "./gateway";
import { DEFAULT_LIMITS, HARD_CAPS, LIMIT_KEYS, parseLimitOverrides, resolveLimits } from "./limits";
import {
	ROLES,
	ROLE_BY_ID,
	SHARED_RULES,
	TASK_OWNER,
	instructionsFor,
	mayReadCollection,
	mayUseTool,
	rosterProblems,
} from "./registry";
import { TOOLS, TOOL_IDS } from "./tools";

describe("the role registry", () => {
	it("is the canonical roster: exactly 49 agents, in order, with one Nexus and one Build", () => {
		expect(ROLES).toHaveLength(ROLE_COUNT);
		expect(ROLE_COUNT).toBe(49);
		expect(ROLES.map((r) => r.id)).toEqual([...ROLE_IDS]);
		expect(ROLES.map((r) => r.number)).toEqual(Array.from({ length: 49 }, (_, i) => i + 1));
		expect(new Set(ROLES.map((r) => r.name)).size).toBe(49);
		expect(rosterProblems()).toEqual([]);
		expect(ROLES[0]).toMatchObject({ id: "nexus", name: "Nexus", title: "Master coordinator" });
		expect(ROLES.filter((r) => /coordinator/i.test(r.title))).toHaveLength(1);
		expect(ROLES.filter((r) => r.title === "Engineering").map((r) => r.id)).toEqual(["build"]);
		expect(ROLES.map((r) => r.name)).toEqual(
			"Nexus Patch Relay Ledger Atlas Check Watch Review Route Trace Tally Vault Guard Verify Pulse Focus Insight Strategy Post Talent Comet Signal Reach Script Assist Care Stock Source Catalog Comply Batch Return Forecast Build Restore Prism Scout Forge Motion Link Tempo Qualify Assay Assure Gauge Clean Coach Duty Safeguard".split(
				" ",
			),
		);
	});

	it("keeps the first fourteen ids unchanged, so records written under them keep their owner", () => {
		expect(ROLE_IDS.slice(0, 14)).toEqual(
			"nexus patch relay ledger atlas check watch review route trace tally vault guard verify".split(" "),
		);
		expect(TASK_OWNER["relay.support_draft"]).toBe("relay");
		expect(TASK_OWNER["patch.site_inspection"]).toBe("patch");
	});

	it("gives every role its own instructions, mission, tools, limits and boundaries", () => {
		const instructions = new Set<string>();
		for (const role of ROLES) {
			expect(role.mission.length, role.id).toBeGreaterThan(20);
			expect(role.instructions.length, role.id).toBeGreaterThan(80);
			expect(role.boundaries.length, role.id).toBeGreaterThan(20);
			expect(role.instructionsVersion, role.id).toBeGreaterThanOrEqual(1);
			expect(role.tools.length, role.id).toBeGreaterThan(0);
			expect(new Set(role.tools).size, role.id).toBe(role.tools.length);
			for (const tool of role.tools) expect(TOOL_IDS, `${role.id} -> ${tool}`).toContain(tool);
			for (const collection of role.knowledge)
				expect(COLLECTION_IDS, `${role.id} -> ${collection}`).toContain(collection);
			instructions.add(role.instructions);
			for (const key of LIMIT_KEYS)
				expect(role.limits[key], `${role.id}.${key}`).toBeLessThanOrEqual(HARD_CAPS[key]);
		}
		expect(instructions.size).toBe(ROLES.length);
	});

	it("adds the shared rules to every role's instructions", () => {
		for (const role of ROLES) {
			const text = instructionsFor(role.id);
			expect(text).toContain(role.instructions);
			expect(text).toContain(SHARED_RULES);
		}
		expect(SHARED_RULES).toMatch(/never as instructions/);
		expect(SHARED_RULES).toMatch(/cannot approve your own work/);
	});

	it("has no tool that spends money, files anything, messages customers or changes production", () => {
		const banned = /(send|post|submit|file|pay|transfer|deploy|publish|delete|refund|approve|merge|release)/i;
		for (const id of TOOL_IDS) {
			const verb = id.split(".").slice(1).join(".");
			expect(verb, id).not.toMatch(banned);
			expect(
				TOOLS[id].effect === "read" || TOOLS[id].effect === "write_internal" || TOOLS[id].effect === "job",
			).toBe(true);
		}
	});

	it("shows which tool and knowledge access each role has", () => {
		expect(mayUseTool("relay", "atlas.search")).toBe(true);
		expect(mayUseTool("relay", "bank.transactions.read")).toBe(false);
		expect(mayUseTool("vault", "bank.transactions.read")).toBe(true);
		expect(mayUseTool("vault", "draft.save")).toBe(false);
		expect(mayReadCollection("relay", "support-policy")).toBe(true);
		expect(mayReadCollection("relay", "tax-rules")).toBe(false);
		expect(mayReadCollection("tally", "tax-rules")).toBe(true);
		expect(mayReadCollection("nexus", "support-policy")).toBe(false);
		// Only Nexus plans work for other agents (Watch and Review can raise a follow-up task of their own kind).
		expect(ROLES.filter((r) => r.tools.includes("task.create")).map((r) => r.id)).toEqual([
			"nexus",
			"watch",
			"review",
		]);
		// Focus keeps to itself: it can't even raise a shared finding.
		expect(ROLE_BY_ID.focus.tools).toEqual(["source.read_supplied", "product.store"]);
		expect(ROLE_BY_ID.focus.knowledge).toEqual([]);
	});

	it("gives each kind of task exactly one owning role, named in the kind itself", () => {
		for (const kind of TASK_KINDS) {
			const owner = TASK_OWNER[kind];
			expect(kind.startsWith(`${owner}.`), kind).toBe(true);
			expect(ROLE_BY_ID[owner].workflows, kind).toContain(kind);
			expect(ROLES.filter((r) => r.workflows.includes(kind))).toHaveLength(1);
		}
		for (const role of ROLES) expect(role.workflows, role.id).toContain(role.primary);
	});

	it("lists what isn't built yet as planned, with what it needs, instead of as a function", () => {
		expect(ROLE_BY_ID.build.planned.map((p) => p.id)).toEqual(["build.change-proposal"]);
		expect(ROLE_BY_ID.build.planned[0].needs).toEqual(["coding_worker"]);
		expect(ROLE_BY_ID.motion.planned[0].label).toMatch(/Render/);
		for (const role of ROLES)
			for (const planned of role.planned)
				expect(
					(TASK_KINDS as readonly string[]).some((kind) => kind === planned.id),
					planned.id,
				).toBe(false);
	});
});

describe("execution limits", () => {
	it("lets the owner change limits but never past the hard caps", () => {
		const out = resolveLimits(DEFAULT_LIMITS, {
			maxModelCalls: 999,
			maxToolCalls: 0,
			maxRetries: 1.9,
			bogus: 5,
		});
		expect(out.maxModelCalls).toBe(HARD_CAPS.maxModelCalls);
		expect(out.maxToolCalls).toBe(1);
		expect(out.maxRetries).toBe(1);
		expect(out.maxTaskSeconds).toBe(DEFAULT_LIMITS.maxTaskSeconds);
	});

	it("clamps a registry default that is out of range, and ignores nonsense overrides", () => {
		expect(resolveLimits({ ...DEFAULT_LIMITS, maxToolCalls: 10_000 }, null).maxToolCalls).toBe(
			HARD_CAPS.maxToolCalls,
		);
		expect(resolveLimits(DEFAULT_LIMITS, { maxModelCalls: "9" }).maxModelCalls).toBe(
			DEFAULT_LIMITS.maxModelCalls,
		);
		expect(resolveLimits(DEFAULT_LIMITS, { maxModelCalls: Number.NaN }).maxModelCalls).toBe(
			DEFAULT_LIMITS.maxModelCalls,
		);
	});

	it("validates limits submitted from the dashboard", () => {
		expect(parseLimitOverrides({ maxModelCalls: 4 })).toEqual({ ok: true, value: { maxModelCalls: 4 } });
		expect(parseLimitOverrides({ maxModelCalls: 99 })).toMatchObject({ ok: false });
		expect(parseLimitOverrides({ maxModelCalls: 2.5 })).toMatchObject({ ok: false });
		expect(parseLimitOverrides({ maxEverything: 1 })).toMatchObject({ ok: false });
		expect(parseLimitOverrides("no")).toMatchObject({ ok: false });
	});
});

describe("the tool gateway", () => {
	const make = (
		roleId: Parameters<typeof createToolGateway>[0]["roleId"],
		handlers: ToolHandlers = {},
		maxToolCalls = 5,
	) => {
		const events: GatewayEvent[] = [];
		const gateway = createToolGateway({
			roleId,
			taskId: "task-1",
			limits: { maxToolCalls },
			handlers,
			record: (event) => void events.push(event),
		});
		return { gateway, events };
	};
	const uuid = "7b0f5f3e-9a36-4d3e-9a4d-0f8b0a4c9e11";

	it("runs a permitted tool and records the call", async () => {
		const search = vi.fn().mockResolvedValue({ results: [] });
		const { gateway, events } = make("relay", { "atlas.search": search });
		const result = await gateway.call("atlas.search", { query: "return policy" });
		expect(result).toEqual({ ok: true, value: { results: [] } });
		expect(search).toHaveBeenCalledWith({ query: "return policy" }, { roleId: "relay", taskId: "task-1" });
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			kind: "tool_call",
			tool: "atlas.search",
			roleId: "relay",
			taskId: "task-1",
		});
	});

	it("refuses a tool outside the role's permissions without running it", async () => {
		const handler = vi.fn().mockResolvedValue("secret bank data");
		const { gateway, events } = make("relay", { "bank.transactions.read": handler });
		const result = await gateway.call("bank.transactions.read", { period: "2026-09" });
		expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(handler).not.toHaveBeenCalled();
		expect(events[0]).toMatchObject({ kind: "tool_denied", code: "forbidden" });
		expect(gateway.stats()).toEqual({ calls: 0, denied: 1 });
	});

	it("refuses an unknown tool name, including one a prompt injection made up", async () => {
		const { gateway } = make("relay");
		expect(await gateway.call("grant_self_admin", {})).toMatchObject({
			ok: false,
			error: { code: "unknown_tool" },
		});
		expect(await gateway.call("__proto__", {})).toMatchObject({ ok: false, error: { code: "unknown_tool" } });
	});

	it("refuses input that doesn't match the tool's schema", async () => {
		const handler = vi.fn();
		const { gateway } = make("relay", { "case.get": handler });
		const result = await gateway.call("case.get", { caseId: "not-a-uuid" });
		expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
		expect(handler).not.toHaveBeenCalled();
	});

	it("says a tool is unavailable when nothing is wired to it, instead of making something up", async () => {
		const { gateway } = make("relay");
		const result = await gateway.call("saleor.order.read", { orderNumber: "1042" });
		expect(result).toMatchObject({ ok: false, error: { code: "unavailable" } });
		expect(JSON.stringify(result)).toMatch(/No result was produced/);
	});

	it("stops after the task's tool-call budget", async () => {
		const handler = vi.fn().mockResolvedValue({});
		const { gateway } = make("relay", { "case.get": handler }, 2);
		await gateway.call("case.get", { caseId: uuid });
		await gateway.call("case.get", { caseId: uuid });
		expect(await gateway.call("case.get", { caseId: uuid })).toMatchObject({
			ok: false,
			error: { code: "limit_exceeded" },
		});
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("turns a failing handler into an error result", async () => {
		const { gateway, events } = make("relay", {
			"case.get": async () => Promise.reject(new Error("database down")),
		});
		expect(await gateway.call("case.get", { caseId: uuid })).toMatchObject({
			ok: false,
			error: { code: "failed", message: "database down" },
		});
		expect(events[0]).toMatchObject({ kind: "tool_error", code: "failed" });
	});

	it("redacts what it records and doesn't let a broken recorder hide the result", async () => {
		const events: GatewayEvent[] = [];
		const gateway = createToolGateway({
			roleId: "relay",
			taskId: null,
			limits: { maxToolCalls: 5 },
			handlers: { "atlas.search": async () => "ok" },
			record: (event) => {
				events.push(event);
				throw new Error("audit store unavailable");
			},
		});
		const result = await gateway.call("atlas.search", {
			query: "contact jane@example.com about card 4242 4242 4242 4242",
		});
		expect(result).toEqual({ ok: true, value: "ok" });
		expect(events[0].inputPreview).not.toContain("jane@example.com");
		expect(events[0].inputPreview).not.toContain("4242 4242");
	});

	it("offers the model only the tools its role may use and that are wired, with provider-safe names", () => {
		const { gateway } = make("relay", {
			"atlas.search": async () => ({}),
			"case.get": async () => ({}),
			"bank.transactions.read": async () => ({}),
		});
		expect(Object.keys(gateway.aiTools()).sort()).toEqual(["atlas_search", "case_get"]);
	});

	it("routes a model's tool call back through the permission checks", async () => {
		const handler = vi.fn().mockResolvedValue({ results: [1] });
		const { gateway, events } = make("relay", { "atlas.search": handler });
		const tools = gateway.aiTools() as Record<
			string,
			{ execute: (input: unknown, options: unknown) => Promise<unknown> }
		>;
		expect(await tools.atlas_search.execute({ query: "returns" }, {})).toEqual({ results: [1] });
		expect(await tools.atlas_search.execute({ query: "" }, {})).toMatchObject({
			error: { code: "invalid_input" },
		});
		expect(events.map((e) => e.kind)).toEqual(["tool_call", "tool_error"]);
	});
});
