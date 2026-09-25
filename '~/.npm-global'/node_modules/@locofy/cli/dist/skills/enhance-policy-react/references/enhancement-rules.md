You are a React/Next.js expert. Given low quality code and a screenshot, cleanup and refactor it. Output format MUST remain the same as input (json) but you can add/remove/refactor files and asset names.
If you modify the file name of any asset or code file, you must return the correct names with their id in the output.

DO NOT replace images with system icons
DO NOT add new images which don't exist in the asset list
The code MUST compile without errors. Double-check all syntax, types, and imports before returning the output

Checklist:

## IMPORTANT NOTE

For components with comments indicating custom components (e.g., 'THIS IS A CUSTOM COMPONENT. DO NOT MODIFY OR REMOVE THIS CODE'), DO NOT MODIFY or REMOVE them. They must be preserved in the output code.

## Improve naming — MANDATORY

Fix component, prop, and variable names. **Every auto-generated or unclear name MUST be renamed.**
- Avoid generic names (Component1, Data, Item) and number suffixes (e.g., `text23120968` → `searchText`)
- Replace all Figma-generated IDs in variable names with descriptive names
- Use PascalCase for components, camelCase for functions/variables
- Use descriptive, clear names that reflect the content or purpose
- Rename accessibility labels/aria-labels from Figma frame IDs (e.g., "Frame 759301247") to descriptive labels (e.g., "Navigation Header")

## Use proper React patterns

Functional components with hooks
TypeScript for type safety
Proper prop types and interfaces
React.memo for performance optimization where needed

## Hooks and state

useState for local state
useEffect for side effects
useCallback for memoized callbacks
useMemo for expensive computations
Custom hooks for reusable logic

## Styling approach

Detect and match project's styling approach:
- CSS Modules: import styles from './Component.module.css'
- Tailwind: className with utility classes
- Styled Components: styled.div`...`
- CSS-in-JS: sx prop or emotion
Maintain consistency with existing code

## Import paths

Use project's import style (absolute vs relative)
Organize imports: React, third-party, local components, styles
Remove unused imports

## Add functionality

Event handlers for interactive elements
Form validation and submission
Loading and error states
Accessibility attributes (aria-*, role)

## TypeScript types

Define proper interfaces for props
Use type inference where appropriate
Avoid 'any' type
Export types for reusability

## Refactor smartly — MANDATORY file splitting & component extraction

**300-line hard limit**: Every file MUST NOT exceed 300 lines. If a screen/page exceeds this, you MUST split it.

**Extract repeated UI patterns into separate component files.** If a UI block (card, row, button group, list item) appears 2+ times with different data, it MUST be extracted into a reusable component with props.

Examples of what to extract:
- Repeated card/row layouts → `BookingCard.tsx`, `ActivityRow.tsx`
- Repeated button groups → `VehicleTypeButton.tsx`
- Header/footer bars → `Header.tsx`, `BottomNav.tsx`

**File organization:**
- Screen/page files in pages or views folder
- Reusable sub-components in components folder
- Move complex logic into custom hooks (separate files)
- Extract types/interfaces into separate .types.ts files

**Also:**
- Remove duplicates and unnecessary properties, unused code
- Use meaningful variable names
- Create TypeScript interfaces/types for repeated data patterns instead of hardcoding values inline

## Accessibility

Semantic HTML elements
ARIA labels and roles
Keyboard navigation support
Focus management

## Document

JSDoc comments for components
Explain props and usage
Add examples in comments when helpful

## Stay pixel-perfect

Match design exactly
Compare with screenshots and preserve spacing, sizing, colors, fonts, alignment
Use responsive design patterns

## Code syntax

Fix all syntax errors and ensure code compiles
Add necessary imports (React, types, styles)
Ensure correct JSX syntax
Use proper TypeScript syntax

## Artifact Completeness Probe — HARD GATE (run before declaring done)

Single batched bash probe. Output is the gate.

```bash
SRC=$(find . -type d \( -name src -o -name app \) -not -path '*/node_modules/*' | head -1)
THEME=$(find $SRC -type f \( -name 'theme.ts' -o -name 'tokens.ts' -o -name 'theme.tsx' -o -name 'tokens.tsx' -o -name 'tailwind.config.*' -o -path '*styles/tokens*' -o -path '*theme/index*' \) | head -3)
ROUTES=$(grep -rln -E 'createBrowserRouter|<Routes>|RouterProvider|export const routes' $SRC --include='*.ts' --include='*.tsx' | head -3)
echo "theme=$THEME"; echo "routes=$ROUTES"

# Token leaks outside theme/CSS module files
HEX=$(grep -rnE '#[0-9A-Fa-f]{6}\b|rgb\(' $SRC --include='*.tsx' --include='*.jsx' | grep -v -E '/theme|/tokens|\.module\.css|\.module\.scss' | wc -l | tr -d ' ')
PX=$(grep -rnE "style=\{\{[^}]*['\"][0-9]+px" $SRC --include='*.tsx' --include='*.jsx' | wc -l | tr -d ' ')
HARDSTR=$(grep -rnE '>[A-Z][a-zA-Z ]{3,}<' $SRC --include='*.tsx' --include='*.jsx' | grep -v -E 'aria-|Preview|story' | wc -l | tr -d ' ')
echo "leaks hex=$HEX inlinePx=$PX hardStrings=$HARDSTR"

# 300-line cap
OVER=$(find $SRC -name '*.tsx' -not -path '*/node_modules/*' -exec wc -l {} + | awk '$1>300 && $2!="total"{print $2":"$1}')
echo "over-300-lines:"; echo "$OVER"

# Route registration: every Screen/Page file must appear in router config
PAGES=$(find $SRC -type f \( -path '*/pages/*' -o -path '*/views/*' -o -path '*/screens/*' \) -name '*.tsx' | grep -vE '\.test\.|\.stories\.')
for p in $PAGES; do
  base=$(basename "$p" .tsx)
  hit=$(grep -rln "$base" $SRC --include='*.ts' --include='*.tsx' | grep -E 'rout|navig' | head -1)
  [ -n "$hit" ] && echo "OK route $base" || echo "MISSING route $base"
done
```

**Decision table — any row ❌ blocks exit:**

| Row | Pass | Fail action |
|-----|------|-------------|
| theme/tokens file exists | yes | Create `theme.ts`/`tokens.ts` or `tailwind.config` with design tokens |
| router config found | yes | Wire screens into existing router; do not leave screens unrouted |
| hex=0 outside theme | yes | Replace `#RRGGBB`/`rgb()` with theme token refs |
| inlinePx=0 | yes | Move inline `style={{ width: '12px' }}` to tokens / CSS modules / Tailwind classes |
| hardStrings=0 | yes | Move user-visible text behind i18n helper if project uses one |
| over-300-lines empty | yes | Split file; extract repeated UI to reusable components |
| Every Page has route entry | yes | Add `<Route>` / router entry, or delete unused Page |

## Per-Screen Completeness Checklist — HARD GATE

```bash
PAGES=$(find $SRC -type f \( -path '*/pages/*' -o -path '*/views/*' -o -path '*/screens/*' \) -name '*.tsx' | grep -vE '\.test\.|\.stories\.')
for p in $PAGES; do
  name=$(basename "$p" .tsx)
  echo "=== $name ==="
  grep -q "export default\|export const $name" "$p" && echo "  OK default-export" || echo "  MISSING default-export"
  grep -qE 'interface .*Props|type .*Props' "$p" && echo "  OK props-type" || echo "  NOTE no-props-type-(may be ok)"
  grep -qE '#[0-9A-Fa-f]{6}|rgb\(' "$p" && echo "  VIOLATION raw-color" || echo "  OK no-raw-color"
  grep -qE "style=\{\{[^}]*['\"][0-9]+px" "$p" && echo "  VIOLATION inline-px" || echo "  OK no-inline-px"
  lines=$(wc -l < "$p"); [ "$lines" -le 300 ] && echo "  OK ≤300 lines ($lines)" || echo "  VIOLATION over-300 ($lines)"
done
```

**Stub-vs-bug distinction:** Cross-check feature names against `.locofy/agent/memory/screenshot-mapping.md` (produced by merge). A screen listed there but missing here = **BUG** (must enhance). A screen NOT listed there but present here as scaffold = **STUB** (acceptable, mark explicitly in summary).

One status block per screen. Any `VIOLATION` blocks exit — fix and re-run.
