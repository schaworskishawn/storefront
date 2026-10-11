import "server-only";

import { APIError, Sandbox } from "@vercel/sandbox";
import type { CommandOutcome, SandboxProvider, WorkerSandbox } from "./sandbox";

/**
 * The one file that talks to Vercel Sandbox. Each machine is a microVM with its own kernel, created from the repository at
 * one commit and thrown away afterwards: nothing is kept between runs.
 *
 * Running on Vercel, the application is authenticated to create machines by the project's own identity, so no token is
 * set or stored for this. The network policy is passed through as it is: the firewall that enforces it, and that adds the
 * API key to requests leaving the machine, is Vercel's and sits outside the machine.
 *
 * Written against @vercel/sandbox 3.6.1 and checked against its types. It has not been run against a real machine.
 */

const text = async (read: () => Promise<string>): Promise<string> => {
	try {
		return await read();
	} catch {
		// Output that can't be read back is reported as empty rather than made up.
		return "";
	}
};

function wrap(sandbox: Sandbox): WorkerSandbox {
	return {
		name: sandbox.name,
		cwd: sandbox.cwd,
		image: sandbox.image ?? sandbox.runtime ?? null,
		async run(cmd, args, options = {}): Promise<CommandOutcome> {
			const done = await sandbox.runCommand({ cmd, args: [...args], cwd: options.cwd, env: options.env });
			return {
				exitCode: done.exitCode,
				stdout: await text(() => done.stdout()),
				stderr: await text(() => done.stderr()),
			};
		},
		async start(cmd, args, options = {}) {
			const command = await sandbox.runCommand({
				cmd,
				args: [...args],
				cwd: options.cwd,
				env: options.env,
				detached: true,
			});
			return command.cmdId;
		},
		async poll(commandId) {
			const command = await sandbox.getCommand(commandId);
			if (command.exitCode === null) return { done: false };
			return {
				done: true,
				exitCode: command.exitCode,
				stdout: await text(() => command.stdout()),
				stderr: await text(() => command.stderr()),
			};
		},
		async kill(commandId) {
			await (await sandbox.getCommand(commandId)).kill();
		},
		async readFile(path) {
			const buffer = await sandbox.readFileToBuffer({ path });
			return buffer ? buffer.toString("utf8") : null;
		},
		async writeFile(path, content) {
			await sandbox.writeFiles([{ path, content }]);
		},
		async setNetwork(policy) {
			await sandbox.updateNetworkPolicy(policy);
		},
		async stop() {
			await sandbox.stop();
		},
	};
}

export const vercelSandboxes: SandboxProvider = {
	label: "Vercel Sandbox",
	async create(input) {
		const sandbox = await Sandbox.create({
			name: input.name,
			source: { type: "git", url: input.repositoryUrl, revision: input.revision, depth: 1 },
			timeout: input.timeoutMs,
			resources: { vcpus: input.vcpus },
			networkPolicy: input.network,
			tags: input.tags,
			// Nothing is kept when the machine stops: no snapshot, nothing to resume.
			persistent: false,
		});
		return wrap(sandbox);
	},
	async get(name) {
		try {
			const sandbox = await Sandbox.get({ name, resume: false });
			return sandbox.status === "running" ? wrap(sandbox) : null;
		} catch (error) {
			if (error instanceof APIError && error.response.status === 404) return null;
			throw error;
		}
	},
};
