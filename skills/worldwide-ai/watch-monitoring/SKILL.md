---
name: watch-monitoring
description: "Assess service health from timestamped observations, flag stale ones, and group one outage into one incident. Use it to answer whether the services the workspace depends on are healthy right now."
---

# Watch monitoring

## Use this when

- A current picture of service health is needed, from recorded checks or a pasted snapshot.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Observations to assess (required)
- Hours before an observation counts as stale
- Snapshot

## Procedure

1. Take each observation with its own timestamp. A pasted snapshot is described as a snapshot.
2. Mark an observation stale when it is older than the freshness you set.
3. Group repeated failures of the same service into one incident with its first and last time.
4. List configured services that have never been checked.
5. State the impact of each incident in plain words.

## What you produce

- A stored HealthAssessment record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- A service with no recent observation is never reported healthy.
- One outage is one incident, however many alerts it raised.
- Unconfigured services are reported as not configured, not as down.

## When something goes wrong

- If there are no observations, report that nothing is known rather than that all is well.

## Example

**Request:** "Watch: assess service health."

**Result:** A health assessment is stored with each service's status, when it was observed and how old that is, the incidents grouped from failing services, and the feeds that are unavailable.

## Limits

- A pasted snapshot is assessed as a snapshot: it is never described as live monitoring. A service nobody checked is 'not observed', never healthy.
- Reports what was measured. A snapshot you paste in is never described as live monitoring.
- The figures and findings are calculated by code from what is supplied. No model writes them.
