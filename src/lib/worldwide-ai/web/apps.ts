import { WORKSPACE_PATH, type RoleId } from "../types";

/**
 * The workspace's applications, in the order they appear in the navigation and the launcher. This file is plain data with no
 * server imports, so the navigation (a client component) and the pages can both read it.
 */

export type AppId =
	| "today"
	| "nexus"
	| "overview"
	| "team"
	| "tasks"
	| "reports"
	| "support"
	| "knowledge"
	| "review"
	| "lab"
	| "rfid"
	| "content"
	| "engineering"
	| "manufacturing"
	| "quality"
	| "compliance"
	| "integrations"
	| "activity"
	| "improvement"
	| "settings";

export type AppGroup = "Work" | "Operations" | "Production" | "Workspace";

export type AppDefinition = {
	id: AppId;
	label: string;
	short: string;
	href: string;
	group: AppGroup;
	summary: string;
};

const app = (id: AppId, label: string, short: string, group: AppGroup, summary: string): AppDefinition => ({
	id,
	label,
	short,
	href: id === "today" ? WORKSPACE_PATH : `${WORKSPACE_PATH}/${id}`,
	group,
	summary,
});

export const APPS: readonly AppDefinition[] = [
	app("today", "Today", "Today", "Work", "What needs attention, what to do next, what needs approval."),
	app(
		"nexus",
		"Nexus Command Center",
		"Nexus",
		"Work",
		"Give Nexus a goal, plan the steps, see what came back.",
	),
	app("overview", "Overview", "Overview", "Work", "Counts, usage and health across the workspace."),
	app("team", "Team", "Team", "Work", "All 49 agents: what each does and whether it can run now."),
	app("tasks", "Tasks", "Tasks", "Work", "Every task, its owner, state, history and evidence."),
	app("review", "Review Queue", "Reviews", "Work", "Everything waiting for a person's decision."),
	app(
		"reports",
		"Daily Reports",
		"Reports",
		"Work",
		"The saved morning report with its action items, and every earlier one.",
	),
	app(
		"support",
		"Support Drafts",
		"Support",
		"Operations",
		"Cases, and reply drafts written from approved policy.",
	),
	app("knowledge", "Knowledge", "Knowledge", "Operations", "The approved document library, with versions."),
	app(
		"content",
		"Product Content Studio",
		"Content",
		"Operations",
		"Product copy, alt text and search content drafts.",
	),
	app(
		"engineering",
		"Engineering",
		"Engineering",
		"Operations",
		"Site inspections, diagnoses and engineering briefs.",
	),
	app(
		"lab",
		"E-Liquid Lab & Inventory",
		"Lab",
		"Production",
		"Recipe calculator, stock planning and batch reconciliation.",
	),
	app("rfid", "RFID & NFC", "RFID & NFC", "Production", "Scan-session reconciliation and tag evidence."),
	app(
		"manufacturing",
		"Manufacturing",
		"Manufacturing",
		"Production",
		"Production plans, batch records, equipment, cleaning, training.",
	),
	app("quality", "Quality", "Quality", "Production", "Supplier evidence, lab reviews and release packages."),
	app(
		"compliance",
		"Canadian Compliance",
		"Compliance",
		"Production",
		"Requirement evidence, excise workpapers, workplace records.",
	),
	app(
		"integrations",
		"Integrations",
		"Integrations",
		"Workspace",
		"What is connected, what answers, what is missing.",
	),
	app("activity", "Activity", "Activity", "Workspace", "Who did what, including what was refused."),
	app(
		"improvement",
		"Improvement",
		"Improvement",
		"Workspace",
		"Measured results and what the agents are checked against.",
	),
	app("settings", "Settings", "Settings", "Workspace", "Agent switches and limits, configuration, backups."),
];

export const APP_BY_ID = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<AppId, AppDefinition>;
export const APP_GROUPS: readonly AppGroup[] = ["Work", "Operations", "Production", "Workspace"];

/** The five places the phone navigation keeps one tap away. Everything else is in the launcher. */
export const MOBILE_APPS: readonly AppId[] = ["today", "nexus", "tasks", "review"];

/**
 * The application pages that are built around a group of agents. Each says plainly what works here today and what the brief
 * asks for that isn't built yet, so nothing on the page reads as finished when it isn't.
 */
export type AreaDefinition = {
	id: AppId;
	lead: string;
	agents: readonly RoleId[];
	/** What works here now, beyond the agents' own functions. */
	also?: readonly string[];
	notBuilt: readonly string[];
};

export const AREAS: Partial<Record<AppId, AreaDefinition>> = {
	lab: {
		id: "lab",
		lead: "Recipe calculations in exact decimals, replenishment planning from a stock snapshot, and batch reconciliation from what staff recorded.",
		agents: ["stock", "batch", "catalog", "check", "ledger", "source"],
		also: [
			"Ingredient inventory: ingredients, their lots, and an append-only ledger of receipts, reservations, use, returns, waste, moves, corrections and quarantine. Stock can't go negative, can't be reserved twice, and is moved only by a person.",
			"The recipe calculator below works out ingredient volumes and weights from documented densities. It never assumes 1 mL is 1 gram.",
			"Stock can plan replenishment from the stored stock. Daily demand and lead time aren't stored yet, so you add those.",
			"Recipes in versions the owner approves, and batches planned from them: a batch reserves the lots that expire first, all or nothing, and records what was actually used and the measured yield.",
			"Finished liquid: a made batch's bulk, packaging runs that draw it down with the bottles and caps they used, quality holds, and the owner's release decision with what was checked.",
		],
		notBuilt: [
			"Where packaged units go after a run. The store stays the only record of sellable stock, and nothing here is sent to it.",
			"Label and artwork approvals as records of their own. Today the owner confirms the approved labels were used when releasing a batch.",
			"Using more than was reserved from within the batch record, moving part of a lot, costs rolled up into batch costs, and documents attached to a lot or a batch.",
			"Synchronizing sellable stock with Saleor. Saleor stays the only authority for sellable stock.",
		],
	},
	rfid: {
		id: "rfid",
		lead: "Reconcile a scan session against its manifest: repeated reads count once, cartons and their units are never both counted, and unknown tags become exceptions.",
		agents: ["link", "stock", "return", "check"],
		notBuilt: [
			"The tag registry and tag-to-product associations.",
			"An authenticated scan-ingestion endpoint for live readers. No reader is connected, so Link works from exports you supply.",
			"The public NFC authenticity page and cryptographic tag verification.",
			"Receiving transactions, staff badges, equipment and tote tracking.",
		],
	},
	content: {
		id: "content",
		lead: "Draft product page text from verified specifications: descriptions, alt text for the images you describe, and search metadata, each tied to the specification it rests on.",
		agents: ["catalog", "script", "signal", "prism", "scout", "check", "comply"],
		notBuilt: [
			"Choosing a product from Saleor. Today you enter the product, SKU and specifications yourself.",
			"Image generation and editing. No image tool is connected, so no image is ever produced.",
			"Per-field approve, edit and regenerate, side-by-side comparison with the live page, and export.",
			"Writing anything back to Saleor. Nothing here changes a live product.",
		],
	},
	engineering: {
		id: "engineering",
		lead: "Inspect pages on the OpenClaw worker, diagnose issues from logs and evidence, specify features, and prepare engineering briefs. Verify re-checks any finished task independently.",
		agents: ["build", "verify", "patch", "forge", "prism", "comet"],
		notBuilt: [
			"Build's isolated coding worker (Claude Agent SDK): repository registration, sandboxed checkouts, real diffs and check runs. Until it exists Build prepares briefs only, and a brief is not a patch.",
			"OpenHands as a second coding backend, and the choice of backend per attempt.",
			"Review of a frozen candidate revision, and any push, pull request, merge or deployment.",
		],
	},
	manufacturing: {
		id: "manufacturing",
		lead: "Production plans checked against materials and equipment hours, batch reconciliation, equipment eligibility, line-clearance evidence and training eligibility, all from recorded evidence.",
		agents: ["tempo", "batch", "gauge", "clean", "coach", "stock"],
		notBuilt: [
			"Stored manufacturing orders, electronic batch records and packaging runs with their lineage.",
			"Software gates that block a step when calibration, cleaning or training evidence is missing.",
			"Read-only instrument and scale connections. Readings are entered by staff and labelled manual.",
			"Any control of machinery. That stays out of scope.",
		],
	},
	quality: {
		id: "quality",
		lead: "Supplier qualification evidence, laboratory results compared with approved specifications, and release packages that say what stands in the way of a decision.",
		agents: ["qualify", "assay", "assure", "comply", "gauge", "clean"],
		also: [
			"Holds and release: a hold stops a batch being packaged or released, and release is the owner's decision, rechecked against every record at the moment it is made.",
			"Specifications in versions the owner approves, samples with a custody line for each hand-over, and laboratory results that count only once the owner has verified them against the report.",
			"Verified results are compared with the approved specification in exact decimals. Units are never converted, and anything the workspace can't judge is left unresolved for a person. A verified result outside its limit puts the batch on hold.",
			"Deviations with an investigation that keeps suspicion apart from finding, and corrective actions that have to be verified to have worked before the deviation can close.",
		],
		notBuilt: [
			"The laboratory's original report as a stored file, and reading results out of one. Results are typed in by a person and the report is named by its number.",
			"Agents working from these records. Assay and Assure still work from what you give them with each run, and prepare drafts only.",
			"Change control, retained-sample and stability schedules, and supplier qualification as records.",
			"Calibration, cleaning and training records. A release can't check them, so they aren't claimed.",
		],
	},
	compliance: {
		id: "compliance",
		lead: "Map reviewed requirements to the evidence on file, prepare excise and stamp workpapers from approved rules, and review workplace and waste records. Nothing here is legal advice or a certification.",
		agents: ["comply", "duty", "tally", "safeguard", "review"],
		notBuilt: [
			"The reviewed rule register with source, effective dates and an applicability decision per rule. Today you supply the rules with each run.",
			"A licence calendar, a stored stamp ledger, and reporting packages with submission evidence.",
			"Recall-readiness tracing across lots, batches, packaging runs and shipments.",
			"The Health Canada and CRA sources named in the brief have not been reviewed into approved rules: that review is a person's decision.",
		],
	},
	improvement: {
		id: "improvement",
		lead: "What the agents are measured on today: usage, verified outcomes and review decisions from the records. Insight analyzes a metric you define; Verify re-checks a finished task.",
		agents: ["insight", "verify", "forge", "prism", "atlas", "care"],
		also: [
			"Skills: twelve shared foundations and a role pack for each agent, each evaluated in isolation and approved by the owner before it guides any work. Open Skills from any agent's page.",
			"Improvement proposals: a person can record what should change in a procedure. A proposal changes nothing until a new version is evaluated and approved.",
		],
		notBuilt: [
			"The business profile, goals with baselines, and metric snapshots.",
			"Lessons drawn automatically from review decisions, and comparison of a new skill version with the current one on real reviewed cases. Today a proposal is written by a person and a version is evaluated on fixed cases.",
			"Evaluation of how well a model writes. The current evaluation checks the procedure, its permissions and the function behind it, not prose quality.",
			"Per-agent quality scorecards.",
		],
	},
};
