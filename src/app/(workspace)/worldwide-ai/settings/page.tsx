import type { Metadata } from "next";
import Link from "next/link";
import { ROLES } from "@/lib/worldwide-ai/agents/registry";
import { loadSettings } from "@/lib/worldwide-ai/agents/settings";
import { listAudit } from "@/lib/worldwide-ai/audit";
import { listBackups } from "@/lib/worldwide-ai/backup/backup";
import { BACKUPS_TO_KEEP } from "@/lib/worldwide-ai/backup/drill";
import { OPS_TIME_ZONE } from "@/lib/worldwide-ai/time";
import { WORKSPACE_PATH } from "@/lib/worldwide-ai/types";
import { backupAction, roleSettingsAction } from "@/lib/worldwide-ai/web/actions";
import { getWorkspace } from "@/lib/worldwide-ai/web/session";
import { ButtonForm } from "@/ui/sections/worldwide-ai/forms";
import {
	Bullets,
	Card,
	DataTable,
	Empty,
	KeyValues,
	Notice,
	PageHeader,
	Pill,
	When,
	agentHref,
} from "@/ui/sections/worldwide-ai/ui";

export const metadata: Metadata = { title: "Settings" };

/** Settings: which agents are switched on, how the workspace is configured (names, never values), and backups. */
export default async function SettingsPage() {
	const workspace = await getWorkspace();
	const { sql, storage, now } = workspace.runtime;
	const { config } = workspace;
	const [settings, backups, audit] = await Promise.all([
		loadSettings(sql),
		storage ? listBackups(storage).catch(() => null) : null,
		listAudit(sql, 500),
	]);
	const lastCheck = audit.find((entry) => entry.action === "backup.restore_check");
	const off = ROLES.filter((role) => !settings[role.id].enabled);

	return (
		<>
			<PageHeader
				title="Settings"
				lead="Changes here are the owner's to make, are checked on the server, and are recorded in Activity. Staff can see this page; the buttons only work for the owner."
			/>
			<div className="wai-split">
				<div className="wai-stack">
					<Card title="Agents" aside={<Pill>{ROLES.length - off.length} of 49 switched on</Pill>}>
						<p className="wai-help" style={{ marginTop: 0 }}>
							Switching an agent off is the emergency stop for it: nothing new starts and anything queued
							fails with that reason. Limits are changed on each agent’s own page.
						</p>
						<DataTable
							caption="Switching an agent on does not make its function ready: that depends on what is configured."
							columns={["#", "Agent", "Role", "Switch"]}
							rows={ROLES.map((role) => [
								role.number,
								<Link key="a" href={agentHref(role.id)}>
									{role.name}
								</Link>,
								role.title,
								workspace.isOwner ? (
									<ButtonForm
										key="b"
										action={roleSettingsAction}
										hidden={{ roleId: role.id, enabled: settings[role.id].enabled ? "0" : "1" }}
										label={settings[role.id].enabled ? "On: switch off" : "Off: switch on"}
										tone={settings[role.id].enabled ? "quiet" : "primary"}
										small
										idPrefix={`switch-${role.id}`}
									/>
								) : (
									<Pill key="p" tone={settings[role.id].enabled ? "good" : "plain"}>
										{settings[role.id].enabled ? "On" : "Off"}
									</Pill>
								),
							])}
						/>
					</Card>
				</div>

				<div className="wai-stack">
					<Card title="How work is allowed to run">
						<Bullets
							items={[
								"Every function is manual: it runs when a person asks for it. No agent starts work by itself.",
								"A result that needs a decision waits for a person. An agent can't approve its own work, change its tools or limits, or grant access.",
								"Nothing here sends a message, publishes content, moves money, files with an authority, releases a batch, or changes production.",
								"Autonomy policies (proactive drafts, bounded execution) are not built. Manual is the only mode.",
							]}
						/>
					</Card>

					<Card title="Configuration">
						<KeyValues
							items={[
								["Owners", `${config.ownerEmails.length} listed (WORLDWIDE_AI_OWNER_EMAILS)`],
								["Staff", `${config.staffEmails.length} listed (WORLDWIDE_AI_STAFF_EMAILS)`],
								[
									"Database",
									config.database.mode === "postgres"
										? "Postgres (Supabase)"
										: config.database.mode === "demo"
											? "In-memory demonstration store"
											: "Not configured",
								],
								[
									"File storage",
									config.storage.mode === "supabase"
										? `Supabase Storage, bucket ${config.storage.bucket}`
										: config.storage.mode === "demo"
											? "Local folder (development only)"
											: "Not configured",
								],
								["Model", `${config.model.modelId} (${config.model.apiKeySet ? "key set" : "no key"})`],
								["Background jobs", config.trigger.secretSet ? "Trigger.dev" : "Inside the web application"],
								["Raw prompts and outputs", config.recordRaw ? "Recorded (redacted)" : "Not recorded"],
								["Contact form files cases", config.ingestContactForm ? "Yes" : "No"],
								["Documents go stale after", `${config.staleAfterDays} days`],
								["Times are shown in", OPS_TIME_ZONE],
							]}
						/>
						<p className="wai-help" style={{ marginBottom: 0 }}>
							These come from the server’s environment. Secret values are never shown here, only whether they
							are set. See <Link href={`${WORKSPACE_PATH}/integrations`}>Integrations</Link> for what each is
							for.
						</p>
					</Card>

					<Card title="Backups">
						{!storage ? (
							<Notice tone="warn" title="File storage isn't configured.">
								There is nowhere to keep a backup, so none can be taken.
							</Notice>
						) : (
							<div className="wai-stack" style={{ gap: 12 }}>
								<KeyValues
									items={[
										[
											"Backups kept",
											backups === null
												? "Couldn't be listed"
												: `${backups.length} (the newest ${BACKUPS_TO_KEEP} are kept)`,
										],
										[
											"Newest",
											backups && backups[0] ? <span className="wai-mono">{backups[0]}</span> : "None yet",
										],
										[
											"Last restore check",
											lastCheck ? (
												<span>
													<Pill tone={lastCheck.outcome === "allowed" ? "good" : "bad"}>
														{lastCheck.outcome === "allowed" ? "Passed" : "Failed"}
													</Pill>{" "}
													<When at={lastCheck.at} now={now()} />
												</span>
											) : (
												"Never run"
											),
										],
									]}
								/>
								{workspace.isOwner ? (
									<div className="wai-row" style={{ alignItems: "flex-start" }}>
										<ButtonForm
											action={backupAction}
											hidden={{ intent: "backup" }}
											label="Take a backup now"
											idPrefix="backup"
										/>
										<ButtonForm
											action={backupAction}
											hidden={{ intent: "restore_check" }}
											label="Run the isolated restore check"
											tone="primary"
											idPrefix="restore"
										/>
									</div>
								) : (
									<Empty>Only the owner can take a backup or run the restore check.</Empty>
								)}
								<p className="wai-help" style={{ margin: 0 }}>
									The restore check loads the newest backup into a brand-new in-memory database and a scratch
									folder, checks every table and file, and throws the copy away. It never touches live
									records.
								</p>
							</div>
						)}
					</Card>

					<Card title="Not built yet">
						<Bullets
							items={[
								"Per-person layout preferences (pinned applications, density, starting view).",
								"Notifications.",
								"Staff invitations from inside the workspace: who may sign in is set in the server's environment.",
							]}
						/>
					</Card>
				</div>
			</div>
		</>
	);
}
