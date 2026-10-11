---
name: tempo-production-planning
description: "Check reviewed demand against eligible material stock and equipment hours, and propose manufacturing orders in due-date order. Use it to prepare a production plan for review."
---

# Tempo production planning

## Use this when

- Demand needs checking against materials and equipment capacity.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Plan name (required)
- Equipment hours available in the period (required)
- Output rate (mL per hour) (required)
- Cleaning and changeover between products (hours) (required)
- Reviewed demand (required)
- Material per litre of product (from the approved formula) (required)
- Eligible material stock (required)

## Procedure

1. Read demand, eligible material stock and equipment hours.
2. Order the demand by due date.
3. For each order, check materials and run and changeover hours.
4. Mark each order feasible, short of material, or short of hours.
5. Say what wasn't checked.

## What you produce

- A stored ProductionPlan record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- A plan is never called feasible when a check couldn't be made.
- Shortages are exact quantities or hours.
- No machinery is dispatched and no production is authorized.

## When something goes wrong

- If material eligibility wasn't supplied, the plan says materials are unchecked.

## Example

**Request:** "Tempo: draft production schedule."

**Result:** A production plan is stored with proposed manufacturing orders, the material each needs against eligible stock, the hours used against hours available, every shortage, and the constraints it did not check.

## Limits

- A plan is a proposal. It checks materials and equipment hours only, says which constraints it didn't check, and never starts a machine, consumes stock or authorizes production.
- Proposes a schedule. Does not dispatch machinery, consume stock or authorize production.
- The figures and findings are calculated by code from what is supplied. No model writes them.
