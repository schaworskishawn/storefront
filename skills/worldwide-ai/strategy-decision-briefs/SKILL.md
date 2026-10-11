---
name: strategy-decision-briefs
description: "Compare the options you name for one decision using the reviewed facts, constraints and explicit assumptions supplied, and recommend one with its trade-offs. Use it to prepare a decision brief."
---

# Strategy decision briefs

## Use this when

- A decision has named options and needs them compared on supplied facts.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Decision to make (required)
- Options (required)
- Reviewed facts (required)
- Constraints
- Assumptions you are making

## Procedure

1. Restate the decision and the options exactly as named.
2. Set the supplied facts and constraints against each option.
3. Keep assumptions labelled as assumptions.
4. Give each option's trade-offs.
5. Recommend one option and say what would change the recommendation.

## What you produce

- A stored DecisionBrief record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Only the supplied options appear.
- Each fact used is one that was supplied.
- A target is marked as approved or suggested.

## When something goes wrong

- If the facts don't separate the options, say the brief can't recommend one.

## Example

**Request:** "Strategy: compare business options."

**Result:** A decision brief draft is stored with each option's advantages and risks tied to supplied facts, the assumptions used, a recommendation and the open questions.

## Limits

- It compares and recommends. It commits the business to nothing, dispatches no other agent, and uses no fact you didn't supply.
- Prepares a decision brief. Does not dispatch other agents or make a commercial commitment.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
