# Network & Timeline Audit — 2025-10-14

This file archives the analysis, reasoning, and raw git output collected during the "betternetworkwindow" investigation. Use it later for bisecting or for sharing with teammates.

## Summary

Primary goals:
- Make Cytoscape network view expand to full available height (handle 4K displays).
- Prevent the timeline playback from "squeezing" or collapsing the network view while playing (avoid remount/resize on each tick).

What was done:
- Converted fixed pixel heights to viewport-aware `visualHeight` and used flexbox in the split layout.
- Moved Cytoscape element/layout/stylesheet build into a stable `useMemo` and avoided remounts on timeline ticks.
- Replaced remount/fit-per-tick behavior with class-based visibility toggling (`.hidden`) for nodes/edges driven by the timeline.
- Added guarded `cy.add(elements)` fallback for cases where the react wrapper didn't populate elements synchronously.
- Added debounced single `safeFit()` when visible node count changes, and a `doFixView()` helper to force a resize/center/fit recovery when the visible set drops to zero.
- Added runtime diagnostics to the browser console to help map mount timing, element counts, container bounding boxes, and post-fit diagnostics.

Current status:
- Layout is responsive and Cytoscape is mounted once in the main flow.
- Timeline toggles visibility instead of remounting.
- Some graphs remain blank until the network panel is hidden/shown or `doFixView()` is run; further root-cause analysis required (likely a timing/fit race).

## Reasoning & Findings

Key hypotheses for blank/empty appearance:
1. Initial element assignment with `hidden` class on mount caused Cytoscape to render invisible elements and the wrapper to skip fitting.
2. Timing between the react-cytoscape wrapper populating elements and the mount callbacks running caused `cy.elements()` to be empty initially.
3. Frequent timeline ticks triggered repeated `cy.resize()`/`cy.fit()` in earlier iterations, causing visual jitter — this was removed in favor of visibility toggling.
4. CSS flex container min-height interactions can collapse the Cytoscape canvas if children have min-height not set to 0; updated `greenTheme.css` to ensure children have `min-height: 0`.

Actionable next steps (for bisect):
- Use the saved git patches below to run a bisect across the last 3 days to identify the exact commit that introduced the persistent blank-state.
- When bisecting, use the browser console diagnostics (search for "TopogramDetail elements debug" / "cy mounted" / "cy diagnostics") as the test oracle (does the graph render on first open without manual toggling?).

## Environment
- Date: 2025-10-14
- Repo root: topogram-standard-upgraded-m3/topogram-m3-app
- Branch: betternetworkwindow
- OS: Linux
- Shell: zsh

---

## Collected git commits (last 3 days) touching network/timeline files

Below is the raw output of `git log --since='3 days ago' -p -- imports/ui/pages/TopogramDetail.jsx imports/ui/components/TopogramGeoMap.jsx imports/ui/styles/greenTheme.css imports/client/ui/components/timeLine/TimeLine.jsx`.

(Kept complete patches to enable later bisecting and inspection.)

---

<!-- GIT LOG OUTPUT START -->

	 // default node style shows computed _vizLabel
	 { selector: 'node', style: { 'label': 'data(_vizLabel)', 'background-color': '#666', 'text-valign': 'center', 'color': '#fff', 'text-outline-width': 2, 'text-outline-color': '#000', 'width': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'height': `mapData(weight, ${minW}, ${maxW}, 12, 60)`, 'font-size'
: `${titleSize}px` } },                                                                                                                                                                                                                                                                                          -  // if an emoji field is present, render it as the primary label with a larger font
-  // if an emoji field is present, render it as the primary label with a larger font
-  // Emoji label rendering: we'll conditionally replace the node label with
-  // emoji when the UI toggle is enabled (TopogramDetail sets emojiVisible
-  // and rebuilds stylesheet accordingly).
-  { selector: 'node[emoji]', style: { 'label': 'data(emoji)', 'font-size': `mapData(weight, ${minW}, ${maxW}, ${Math.max(16, titleSize)}, 48)`, 'text-valign': 'center', 'text-halign': 'center', 'text-outline-width': 0 } },
	{ selector: 'node[color]', style: { 'background-color': 'data(color)' } },
	// Use bezier curves so parallel edges can be separated
	{ selector: 'edge', style: { 'width': 1, 'line-color': '#bbb', 'target-arrow-color': '#bbb', 'curve-style': 'bezier', 'control-point-step-size': 'mapData(_parallelIndex, 0, _parallelCount, 10, 40)' } },
@@ -667,6 +696,12 @@ export default function TopogramDetail() {
		}
	]

	// If the user requested emoji-only labels in the network, add a rule
	// that renders the node label from `data(emoji)` with a larger font.
	if (nodeLabelMode === 'emoji') {
		stylesheet.push({ selector: 'node[emoji]', style: { 'label': 'data(emoji)', 'font-size': `mapData(weight, ${minW}, ${maxW}, ${Math.max(16, titleSize)}, 48)`, 'text-valign': 'center', 'text-halign': 'center', 'text-outline-width': 0 } })
	}

	// Add explicit selected styles for better visibility when chart-driven selection occurs
	stylesheet.push(
		{ selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#FFD54F', 'text-outline-color': '#000', 'z-index': 9999 } },

commit 6b23b97d503154599a6c4945ca0dfe86b4934794
Author: ungentilgarcon <monsieur.goonie@gmail.com>
Date: Mon Oct 13 12:42:08 2025 +0200

feat(ui): add node label mode selector (name|emoji|both) and compute per-node _vizLabel


diff --git a/imports/ui/pages/TopogramDetail.jsx b/imports/ui/pages/TopogramDetail.jsx
index 6dd6265..dd01abf 100644
--- a/imports/ui/pages/TopogramDetail.jsx
+++ b/imports/ui/pages/TopogramDetail.jsx
@@ -99,6 +99,10 @@ export default function TopogramDetail() {
	 const [emojiVisible, setEmojiVisible] = useState(() => {
		 try { const v = window.localStorage.getItem('topo.emojiVisible'); return v == null ? true : (v === 'true') } catch (e) { return true }
	 })
-  // Node label display mode in network: 'name' | 'emoji' | 'both'
-  const [nodeLabelMode, setNodeLabelMode] = useState(() => {
-    try { const v = window.localStorage.getItem('topo.nodeLabelMode'); return v || 'both' } catch (e) { return 'both' }
-  })

	 // Helper: canonical key for an element JSON (node or edge)
	 const canonicalKey = (json) => {
@@


## Debug tips for bisect
- Start Chromium/Firefox with devtools console open. Filters: Info/Verbose to capture logs.
- On each checkout, load a Topogram detail page with a dataset known to previously show the blank appearance.
- Pass/fail criteria: "Pass" when the network is visible and correctly centered on first load without manual hide/show. "Fail" when it's blank until a manual hide/show or clicking the (temporary) Fix view.
- Use `git bisect run ./scripts/visual-bisect-check.sh` if you automate a headless test (requires script to start Meteor, launch headless browser, and detect console output), otherwise perform manual bisection.

## Notes
- Timeline file is `imports/client/ui/components/timeLine/TimeLine.jsx`. It drives `timelineUI.valueRange` via a class-based setInterval loop; earlier commits attempted to call `cy.resize()` or `cy.fit()` on each tick which caused the layout to behave poorly.
- The CSS file `imports/ui/styles/greenTheme.css` now contains a `.cy-container` flex-based rule that can prevent collapse when paired with `> :not(.cy-controls) { min-height: 0 }`.


---

## Raw git output (for archiving)


### Commit index (compact)

 - 7671584 — Timeline: mount full graph once; set initial hidden classes from timeline range; compute edge visibility from endpoints or edge time
 - 34e9f6b — Timeline visibility: toggle 'hidden' class on cy nodes/edges instead of remounting or resizing; add stylesheet rules for node.hidden/edge.hidden
 - ca9a6de — Timeline: do not remount Cytoscape on each tick; stop calling resize/fit during playback (timeline should only hide/show elements)
 - a44fcac — Timeline: throttle cy.resize/safeFit to ~15FPS; ensure cy.resize() on mount and after layout stop
 - 752d65c — Trigger cy.resize()/safeFit on timeline valueRange updates so network redraws while playing
 - 1965169 — Trigger cy.resize() and safeFit on panel toggles and window resize so Cytoscape redraws to fill container
 - 7147db2 — Make .cy-container flex so Cytoscape fills available height like GeoMap
 - 1e7be71 — Make network/geo panels responsive and expand to full window when other panes closed; pass dynamic visual height to map
 - (more commits included below in the raw patches)


