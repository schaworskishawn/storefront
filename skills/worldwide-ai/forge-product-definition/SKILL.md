---
name: forge-product-definition
description: "Turn a problem, its evidence and its constraints into a feature specification: prioritized requirements, user stories and testable acceptance criteria. Use it to define a feature before it is built."
---

# Forge product definition

## Use this when

- A problem needs turning into a specification.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Feature (required)
- Problem (required)
- Desired result (required)
- Evidence
- Constraints

## Procedure

1. Read the problem, the evidence and the constraints.
2. Write requirements and rank them, stating the basis for the ranking.
3. Write user stories for the requirements.
4. Write acceptance criteria that can be tested.
5. List assumptions and open questions.

## What you produce

- A stored FeatureSpecification record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Each requirement traces to supplied evidence or is marked an assumption.
- Each acceptance criterion can be checked.
- Nothing authorizes a deployment.

## When something goes wrong

- If the evidence doesn't support a requirement, mark it as an assumption.

## Example

**Request:** "Forge: define feature proposal."

**Result:** A feature specification draft is stored with requirements, user stories, acceptance criteria tied to requirements, assumptions, dependencies and a prototype brief, waiting for a person's review.

## Limits

- It specifies. It builds nothing, starts no other agent's work, and deploys nothing.
- Specifies. Does not build, dispatch other agents or deploy a prototype.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
