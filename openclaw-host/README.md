# The OpenClaw adapter

A small server that runs on the machine where OpenClaw is installed. It is the only thing on that machine the storefront talks to. It accepts one kind of job, a site inspection, and refuses everything else.

It has no dependencies beyond Node itself (its tests were run on Node 26; this repository targets Node 24). Copy this folder to the host as it is.

**Status.** Written and tested with a stand-in for the `openclaw` command (`adapter.test.mjs`, run by the storefront's test suite). It has not been run on a real OpenClaw host yet, so the exact output of your OpenClaw version has not been checked against the parser in `parse-cli.mjs`. Run one inspection of a single page first and look at the result before relying on it.

## What a job does

`site.inspect` opens up to five allowed pages at a desktop width (1440 × 900) and a phone width (390 × 844), takes a screenshot of each, and reports what the browser saw: console errors, page errors and failed requests. It does not sign in, fill forms, click, buy, or change anything.

- Only plain `https` addresses on a host you allowed are accepted. No credentials in the address, no unusual port, no IP addresses, nothing local or internal.
- Jobs run one at a time. A whole job is limited to 180 seconds and any one browser command to 40.
- A step that fails, a screenshot that can't be found, or a passed deadline ends the job as failed or timed out. Nothing is filled in.
- OpenClaw is only ever given the fixed browser commands in `runner.mjs`, with no shell and no arguments from anywhere but the validated job.

## Set it up

1. Install OpenClaw on the host and create a dedicated browser profile for inspections (the default name is `inspector`). Do not reuse a profile that is signed in to anything.
2. Choose a secret of at least 32 random characters. The same value goes in the storefront's `OPENCLAW_ADAPTER_SECRET`. Keep it in a password manager; never commit it.
3. Set the environment and start it:

| Setting                    | Needed | What it is                                                                                               |
| -------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `ADAPTER_SECRET`           | Yes    | The shared secret, at least 32 characters.                                                               |
| `ALLOWED_HOSTS`            | Yes    | Hostnames the worker may open, separated by commas. `*.staging.example.com` allows any subdomain.        |
| `JOBS_DIR`                 | No     | Where job records and screenshots are kept. Default `./jobs`. Put it on storage that survives a restart. |
| `PORT`, `BIND`             | No     | Where to listen. Default port 8787 on `127.0.0.1`.                                                       |
| `OPENCLAW_BIN`             | No     | The OpenClaw command. Default `openclaw`.                                                                |
| `OPENCLAW_BROWSER_PROFILE` | No     | The browser profile to use. Default `inspector`.                                                         |
| `OPENCLAW_MEDIA_DIRS`      | No     | Folders OpenClaw writes screenshots to. Default `~/.openclaw/media`.                                     |

```bash
node index.mjs
```

4. The adapter listens on `127.0.0.1` and speaks plain HTTP. Put it behind TLS on a private network or a tunnel that only the storefront can reach. Do not expose port 8787 to the internet.
5. In the storefront, set `OPENCLAW_ADAPTER_URL` to the address the storefront reaches it at, `OPENCLAW_ADAPTER_SECRET` to the same secret, and `OPENCLAW_ALLOWED_HOSTS` to the same host list. Both ends check the list; the adapter's own list is the one that counts.
6. Open **Integrations** in the workspace and run a health check, then start an inspection from **Engineering**.

## How the two ends trust each other

Every request carries a timestamp and an HMAC-SHA-256 signature of the timestamp, the method, the path and a hash of the body, made with the shared secret. The adapter refuses a request that is unsigned, altered, or more than five minutes old. `auth.mjs` is imported by both ends, so they compute the signature the same way.

The storefront gives each job a session id. Asking again with the same session id returns the job already made instead of starting a second, which is also how the storefront finds a run after a network timeout.

The storefront does not take the adapter's word for a screenshot: it fetches each file, checks its size, type and SHA-256 against what the job reported, and only then stores it privately.

## Endpoints

All require a valid signature.

| Request                           | What it returns                                          |
| --------------------------------- | -------------------------------------------------------- |
| `GET /health`                     | Whether the adapter and the OpenClaw browser are usable. |
| `POST /jobs`                      | Accepts a `site.inspect` job; returns its run id.        |
| `GET /jobs?sessionId=…`           | The run for a session id, if one exists.                 |
| `GET /jobs/<run id>`              | A run's state and, when finished, its result.            |
| `GET /jobs/<run id>/files/<name>` | One screenshot from a run.                               |

## What is kept on the host

Each job has a folder under `JOBS_DIR` holding `job.json` and its screenshots. A restart loses nothing: jobs that were queued are picked up again, and a job that was running is marked `unknown` rather than guessed at.

The workspace's backups do not include this folder. Screenshots the workspace accepted are already copied into its own storage. Clear old job folders yourself when you no longer need them.
