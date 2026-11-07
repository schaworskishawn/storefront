import { LICENCE_STATUSES, type LicenceStanding } from "@/lib/worldwide-ai/compliance/licences";
import { APPLICABILITY, RULE_KINDS } from "@/lib/worldwide-ai/compliance/rules";
import type { FormField } from "./forms";
import type { Tone } from "./ui";

export const LICENCE_TONES: Record<LicenceStanding, Tone> = {
	current: "good",
	renewal_due: "warn",
	renewal_overdue: "bad",
	expired: "bad",
	no_dates: "warn",
	applied_for: "info",
	ended: "plain",
};

/** The fields of a reading of a rule, shared by the form that records a rule and the one that records a new version. */
export const VERSION_FIELDS: readonly FormField[] = [
	{
		name: "kind",
		label: "Kind of source",
		kind: "select",
		required: true,
		options: Object.entries(RULE_KINDS).map(([value, label]) => ({ value, label })),
		help: "Guidance doesn't replace the law it explains. An interpretation nobody has settled is recorded as one.",
	},
	{ name: "sourceTitle", label: "Source", kind: "text", required: true, maxLength: 300 },
	{
		name: "sourceUrl",
		label: "Where it can be read",
		kind: "text",
		maxLength: 1000,
		placeholder: "https://",
	},
	{ name: "retrievedOn", label: "Read on", kind: "date" },
	{ name: "publishedOn", label: "Published or last changed on", kind: "date" },
	{
		name: "effectiveFrom",
		label: "Takes effect on",
		kind: "date",
		help: "Needed before the owner can approve it.",
	},
	{ name: "effectiveTo", label: "Stops applying on", kind: "date" },
	{
		name: "summary",
		label: "What it asks of the business",
		kind: "textarea",
		required: true,
		rows: 4,
		help: "In your own words, with the section it comes from. Not a copy of the source.",
	},
	{
		name: "applicability",
		label: "Does it apply here?",
		kind: "select",
		options: Object.entries(APPLICABILITY).map(([value, label]) => ({ value, label })),
		help: "A suggestion for the owner, who decides when approving.",
	},
	{ name: "applicabilityReason", label: "Why", kind: "textarea", rows: 2 },
	{
		name: "reviewEveryDays",
		label: "Look at it again every (days)",
		kind: "number",
		help: "Sets the next review when it is approved, unless the owner gives a date.",
	},
];

/** The fields of a licence, as it reads on the document. Shared by recording one and recording a renewal or a change. */
export const LICENCE_FIELDS: readonly FormField[] = [
	{ name: "name", label: "Licence, registration or permit", kind: "text", required: true, maxLength: 200 },
	{ name: "authority", label: "Issued by", kind: "text", required: true, maxLength: 200 },
	{ name: "reference", label: "Its number", kind: "text", maxLength: 120 },
	{
		name: "scope",
		label: "What it covers",
		kind: "textarea",
		required: true,
		rows: 3,
		help: "As the licence says. Anything unclear goes in a question on its page.",
	},
	{ name: "premises", label: "Premises it names", kind: "text", maxLength: 500 },
	{ name: "responsible", label: "Who is responsible for it", kind: "text", required: true, maxLength: 300 },
	{
		name: "securityObligations",
		label: "Security or other conditions it sets",
		kind: "textarea",
		rows: 2,
	},
	{
		name: "evidence",
		label: "Where the document is kept",
		kind: "text",
		maxLength: 1000,
		placeholder: "Original in the office safe; scan in the shared drive",
	},
	{
		name: "status",
		label: "Status",
		kind: "select",
		required: true,
		options: Object.entries(LICENCE_STATUSES).map(([value, label]) => ({ value, label })),
	},
	{ name: "issuedOn", label: "Issued on", kind: "date" },
	{ name: "expiresOn", label: "Expires on", kind: "date" },
	{
		name: "renewBy",
		label: "Renewal due by",
		kind: "date",
		help: "Only if the licence or the authority says so. Nothing here guesses a deadline.",
	},
	{ name: "remindDays", label: "Warn this many days before", kind: "number", help: "60 if left empty." },
];
