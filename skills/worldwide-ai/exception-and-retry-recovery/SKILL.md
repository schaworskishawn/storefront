---
name: exception-and-retry-recovery
description: "When work fails or its outcome is uncertain, classify what happened, keep the evidence, and retry only in ways that cannot do the work twice. Use it whenever a run errors, times out or loses contact with a worker."
---

# Exception and retry recovery

## Use this when

- A function run failed, timed out, or was interrupted.
- A job was handed to a worker and no answer came back.

## Do not use this when

- The failure was a refusal for a missing or invalid input: that needs a corrected request, not a retry.

## What you need

- The task, its state and its history.
- Any run identifier saved when the work was handed over.

## Procedure

1. Decide which it is: a known failure, or an outcome that is unknown.
2. For an unknown outcome, look the run up by its saved identifier before doing anything else.
3. Look for a result already stored for the task. If one exists, verify it and carry on from there.
4. Retry only through the task's own retry, which keeps the same task and the same request key.
5. Record what was found. A task whose outcome can't be established is marked unknown, not failed and not complete.

## What you produce

- A task in a truthful state with the reason recorded.
- No second result for the same request.

## Checks before you finish

- A retried task never produces a second stored result.
- Nothing is reported as complete without its stored result being read back.
- Partial evidence from the failed attempt is kept.

## When something goes wrong

- If the outcome can't be established, say so and leave the decision to a person.
- If retrying could repeat an outside effect, do not retry: reconcile first.

## Example

**Request:** An inspection job was submitted and the connection dropped before the run id came back.

**Result:** The run is found by the session id the application made. It finished, so its result is fetched and checked. No second job is started.

## Limits

- It recovers the application's own work. It cannot undo anything in an outside system.
