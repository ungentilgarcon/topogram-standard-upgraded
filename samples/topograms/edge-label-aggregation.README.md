# Edge label aggregation test

This sample CSV creates a tiny topogram to validate GeoMap edge label aggregation across renderers (Leaflet, MapLibre, etc.).

File: `samples/topograms/edge-label-aggregation.csv`

## Contents

Nodes (with lat/lng):
- USA — United States
- CHN — China
- DEU — Germany

Edges:
- USA → CHN “Supply” with emoji 📦 repeated 3× (expect a single midpoint label with “Supply” (Text), “📦” (Emoji), or “📦 Supply” (Both) followed by “ x3”).
- USA → CHN “Trade” 1× (separate label group).
- CHN → USA “Supply” with emoji 📦 repeated 2× (direction-sensitive; this is its own group with “ x2”).
- USA → DEU “Supply” with emoji 📦 1×.
- USA → CHN “Supply” with emoji 🚢 1× (separate group from 📦).

The header matches the canonical import fields used by the app (`id,name,label,lat,lng,...,source,target,relationship,emoji,...`).

## How to use

1) In the app, open Home and click “Import CSV”.
2) Select `samples/topograms/edge-label-aggregation.csv` and upload.
3) Open the created topogram, switch to the GeoMap view.
4) Ensure these toggles are set:
   - “Show GeoMap relationship labels” = ON
   - “Edge labels:” = test each mode: Text, Emoji, Both
   - “Aggregate GeoMap edge labels” = ON
5) Observe midpoint labels:
   - USA→CHN Supply: “… x3”
   - CHN→USA Supply: “… x2”
   - USA→CHN Trade: no multiplier
   - USA→DEU Supply: no multiplier
   - USA→CHN Supply with 🚢: separate from 📦 groups

If you toggle aggregation OFF, you should see individual duplicated labels instead of a single aggregated label with the multiplier.
