---
name: trace-shipment-timelines
description: "Order the carrier events supplied for one shipment into a timeline, keeping each event's own time and separating confirmed events from estimates. Use it to answer where a shipment is."
---

# Trace shipment timelines

## Use this when

- A shipment's status needs laying out from its tracking events.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Order number (required)
- Tracking number (required)
- Carrier
- When the events were exported
- Carrier events (required)

## Procedure

1. Read each event with its own timestamp, location and status.
2. Order events by when they happened, not when they were retrieved.
3. Keep estimated dates in their own list, apart from events that occurred.
4. Report events that contradict each other.
5. State the last confirmed event.

## What you produce

- A stored ShipmentTimeline record, checked against its declared format before it is kept.
- It is saved once code has verified it, and changes nothing outside the workspace.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- No event is added that wasn't supplied.
- An estimate is never shown as a confirmed event.
- Contradictions are reported, not resolved by picking one.

## When something goes wrong

- If no events were supplied, the timeline is empty and says so.

## Example

**Request:** "Trace: build shipment timeline."

**Result:** A shipment timeline is stored for the order with its confirmed events in order, estimates labelled as estimates, the latest confirmed status, the data's age, and any inconsistencies.

## Limits

- It never adds an event or a delivery date that isn't in the record. It is a timeline, not a message to the customer.
- Orders the events it was given. Never fabricates a tracking event or a delivery date.
- The figures and findings are calculated by code from what is supplied. No model writes them.
