---
name: route-logistics
description: "Put a shipment exception in order: which delivery documents are missing and which invoiced charges differ from the rate evidence, by exactly how much. Use it to prepare an administrative follow-up."
---

# Route logistics

## Use this when

- A shipment has an exception, a missing document or a disputed charge.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Shipment or tracking number (required)
- Carrier
- Carrier invoice number
- What went wrong (required)
- Currency (required)
- Documents this shipment should have
- Documents on file
- Invoiced charges

## Procedure

1. List the documents the shipment requires and mark each present or missing.
2. Compare each invoiced charge with the rate evidence in the same currency.
3. Give each difference as an exact amount.
4. List what could not be checked because evidence wasn't supplied.
5. Draft the follow-up points for a person to send.

## What you produce

- A stored LogisticsExceptionPackage record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Every difference is an exact figure with both sides shown.
- Charges in different currencies are never compared.
- No carrier record is changed.

## When something goes wrong

- If there is no rate evidence for a charge, it is listed as unchecked, not as correct.

## Example

**Request:** "Route: resolve shipment exception."

**Result:** A logistics exception package is stored against the shipment with missing documents, each charge's invoiced and expected amount and difference, unverifiable charges, and drafted internal actions.

## Limits

- It prepares internal follow-ups only. It does not contact the carrier, dispute an invoice, or book or change a shipment.
- Prepares internal follow-ups. Does not contact a carrier, book or change a shipment.
- The figures and findings are calculated by code from what is supplied. No model writes them.
