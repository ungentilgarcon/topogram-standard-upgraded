Including local renderer libraries for offline bundles

To make exported bundles runnable without CDN access, place minified copies
of the runtime libraries into `mapappbuilder/presentation-template/lib/` before
exporting.

Recommended files (filenames expected by the loader):
- leaflet.min.js
- leaflet.min.css
 - cytoscape.min.js

You can obtain these from the official releases or your package manager.
After adding them to `lib/`, the exporter will copy `lib/` into each bundle
and the presentation will prefer the local files instead of CDN-hosted
assets.
