---
name: prism-design-and-assets
description: "Critique one screen for a stated viewport and user goal, from attached screenshots or a written description: hierarchy, readability, consistency and accessibility. Use it for a design review."
---

# Prism design and assets

## Use this when

- A screen needs a design critique for a viewport and a goal.

## Do not use this when

- What the function needs has not been supplied: it reports what is missing and creates nothing, so gather it first.
- The request belongs to another agent's function: it goes through Nexus, not through this procedure.
- The request is to act outside the workspace (send, post, pay, file, or change a live record): this procedure only prepares and stores a result.

## What you need

- Screen (required)
- Viewport (required)
- What the person is trying to do (required)
- Description of the screen
- Design tokens or rules to check against
- Screenshots

## Procedure

1. Read the screen's goal and viewport.
2. Look at each attached screenshot, or the description if there is none.
3. Record each observation with its area, category and severity.
4. Propose a refinement for each.
5. List what could not be assessed, such as measured contrast.

## What you produce

- A stored DesignReview record, checked against its declared format before it is kept.
- It waits for a person to accept or reject it.
- Its sources, anything missing, assumptions and warnings are listed with it.

## Checks before you finish

- The result says whether it worked from a screenshot or from a description.
- What couldn't be assessed is listed, not guessed.
- No image is generated or edited.

## When something goes wrong

- If an attached image can't be read, say so and work from the description only.

## Example

**Request:** "Prism: review screen and visual design."

**Result:** A design review draft is stored with observations tied to what is visible, their category and severity, proposed refinements, and a clear note of whether a screenshot was actually reviewed.

## Limits

- It critiques. It generates and edits no image and writes to no design tool, and it says plainly when it worked from a description rather than a screenshot.
- Critiques and proposes. Generates no image and writes to no design tool.
- No image tool or Figma connection exists.
- The wording comes from a model and is checked by code. A person reviews every draft before it is used.
