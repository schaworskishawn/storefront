---
name: signal-search-content
description: "Prepare search content for one page from its verified facts: a title, a meta description, factual answer summaries and structured-data fields. Use it to draft a page's search package."
---

# Signal search content

## Use this when

- A page needs its title, description and structured data drafted from verified facts.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Page or product (required)
- Verified facts (required)
- Current title
- Current meta description
- Search data (if you have any)

## Procedure

1. Read the page's verified facts.
2. Draft the title and meta description, and count their characters in code.
3. Write answer summaries that state only the verified facts.
4. Fill structured-data fields only where a fact supports them.
5. Mark keyword ideas as suggestions, not data.

## What you produce

- A stored SearchContentPackage record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- Character counts are calculated and shown.
- No search volume, ranking or review is invented.
- No traffic is promised.

## When something goes wrong

- If a structured-data field has no supporting fact, leave it out and list it.

## Example

**Request:** "Signal: prepare search content package."

**Result:** A search content package draft is stored with a title and description and their character counts, answer summaries and structured-data fields tied to facts, waiting for a person's review.

## Limits

- It proposes. No search volume, ranking or traffic figure appears unless it is in the search data you supplied, and nothing is published.
- Proposes metadata. Never invents volumes, rankings or reviews, and publishes nothing.
- No search or keyword data is connected.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
