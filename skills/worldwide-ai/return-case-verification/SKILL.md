---
name: return-case-verification
description: "Check a return or warranty request against the order facts and the policy terms supplied, and decide eligibility only from those facts. Use it to prepare a return review."
---

# Return case verification

## Use this when

- A return or warranty request needs checking against policy terms.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Order number (required)
- Product (SKU) (required)
- Lot or serial
- What the customer asked for (required)
- Request type (required)
- Requested on (required)
- Delivered on
- Reported condition (required)
- Policy and version relied on
- Policy window (days from delivery)
- Does the policy accept opened items of this kind?
- Earlier returns on this order
- Evidence on file

## Procedure

1. Read the order facts: dates, item, condition, earlier returns.
2. Read the policy terms: window, condition, limits.
3. Test each term against the facts.
4. Mark the request eligible, not eligible, or undetermined when a fact is missing.
5. List the missing facts.

## What you produce

- A stored ReturnReviewPackage record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Eligibility follows from the supplied terms only.
- A missing fact gives undetermined, never a guess.
- No refund is issued.

## When something goes wrong

- If the policy terms supplied conflict, show the conflict and leave eligibility undetermined.

## Example

**Request:** "Return: review return or warranty."

**Result:** A return review package is stored with each eligibility check and its evidence, the facts still unconfirmed, and a proposed resolution or supplier claim for a person to decide.

## Limits

- It proposes. No refund, replacement or stock adjustment is made, and a missing fact leaves eligibility undetermined rather than assumed.
- Proposes a resolution. Never refunds, replaces or adjusts stock.
- The figures and findings are calculated by code from what is supplied. No model writes them.
