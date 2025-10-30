# Recent progress (week of 2025-10-20 → 2025-10-30)

This short note collects high-level progress made during the week ending 2025-10-30.

- UI: on-canvas network controls (Reset, Aggregate edges, Export SVG) were moved into the Side Panel. Controls were consolidated and reorganized for clarity.
- Export: Export PNG was added beside Export SVG for the Reagraph adapter. PNG export now prefers a live-canvas snapshot (with a double RAF wait and a one-frame labels override) and falls back to a deterministic offscreen 2D render that reproduces node/edge labels, emojis and arrowheads when necessary.
- Export SVG: SVG export was improved to include node emojis, edge labels/emojis, and vector arrowhead markers for edges with arrow semantics.
- Stability: Timeline and network mounting logic were hardened to reduce blank/empty render cases; selection flow across Network, GeoMap and Charts was unified via the adapter contract.
- Docs: consolidation of Markdown into `docs/` began; mapappbuilder materials were moved to `docs/mapappbuilder/` and multiple sample and script docs were copied into `docs/samples/` and `docs/scripts/`.

If you want these bullets mirrored into each top-level doc file, I can propagate them (I started a central `docs/RECENT_PROGRESS.md` to keep the message canonical).