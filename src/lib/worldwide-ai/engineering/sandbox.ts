/**
 * What the coding worker needs from a throwaway machine, and nothing more. The worker is written against this, so it can be
 * tested with a stand-in and so the one file that talks to a real provider stays small.
 *
 * A machine is created from a repository at one commit, runs commands, and is stopped. Its outbound network is set by a
 * policy that can be tightened while it runs. A secret is never handed to the machine: where one is needed, the policy
 * names the header the provider's firewall adds to requests on their way out, so code inside can't read it.
 */

/** A rule the firewall applies to requests for one domain: here, only adding headers on the way out. */
export type NetworkRule = { transform: Array<{ headers: Record<string, string> }> };

export type NetworkPolicy = "allow-all" | "deny-all" | { allow: Record<string, NetworkRule[]> };

export type CommandOptions = { cwd?: string; env?: Record<string, string> };

export type CommandOutcome = { exitCode: number; stdout: string; stderr: string };

export type CommandPoll = { done: false } | ({ done: true } & CommandOutcome);

export interface WorkerSandbox {
	/** The name the machine was created under. Fixed by the job, so a repeated step finds the same machine. */
	readonly name: string;
	/** Where the repository was checked out. */
	readonly cwd: string;
	/** What the machine is running, as the provider describes it. Null when it doesn't say. */
	readonly image: string | null;
	/** Runs a command and waits for it. For quick commands only. */
	run(cmd: string, args: readonly string[], options?: CommandOptions): Promise<CommandOutcome>;
	/** Starts a command and returns at once with its id. */
	start(cmd: string, args: readonly string[], options?: CommandOptions): Promise<string>;
	poll(commandId: string): Promise<CommandPoll>;
	kill(commandId: string): Promise<void>;
	/** The file's text, or null when it isn't there. */
	readFile(path: string): Promise<string | null>;
	writeFile(path: string, content: string): Promise<void>;
	setNetwork(policy: NetworkPolicy): Promise<void>;
	stop(): Promise<void>;
}

export type NewSandbox = {
	name: string;
	/** An https address of a git repository, from the server's own configuration. */
	repositoryUrl: string;
	/** The full commit id to check out. */
	revision: string;
	timeoutMs: number;
	vcpus: number;
	network: NetworkPolicy;
	tags: Record<string, string>;
};

export interface SandboxProvider {
	/** A short name for the provider, recorded with what it ran. */
	readonly label: string;
	create(input: NewSandbox): Promise<WorkerSandbox>;
	/** The machine with that name if it still exists and is running, otherwise null. */
	get(name: string): Promise<WorkerSandbox | null>;
}
