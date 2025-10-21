Mapappbuilder presentation template bundler

This folder contains a small bundler setup that packages `reagraph` and `graphology` into a single UMD file that can be included in the exported presentation template.

Build

1. From this directory run:

```bash
npm install
npm run build-umd
```

2. The build will produce `lib/reagraph.umd.js` which you can include in the exported template HTML using a script tag:

```html
<script src="lib/reagraph.umd.js"></script>
```

Adapter

The adapter in `lib/reagraphAdapter.js` will detect `window.reagraph` and `window.graphology` and prefer those globals when present. If they are not present, the adapter falls back to a lightweight internal SVG renderer.
