Global Supply Chain Graph of Everything — Layered Samples

This dataset provides layered CSVs to explore a global supply chain network from macro trade flows down to company links and logistics, with optional ESG overlays. Import one layer at a time or the combined view.

Files
- trade_flows.topogram.csv — Country-to-country trade edges, grouped by commodities (e.g., HS-8507 Batteries, HS-8517 Smartphones) with yearly edges for 2018–2025 (start/end/time/date populated). Nodes are countries.
- company_chains.topogram.csv — Facility-level Supplier→OEM relationships across notable companies (TSMC, Foxconn, Samsung, CATL, LG Chem, BYD, Apple, Xiaomi, Sony). Edges are quarterly for 2023Q1–2024Q4. Nodes are company sites (multiple facilities per company with granular lat/lng).
- logistics_routes.topogram.csv — Port-centric transport lanes: factory→port exports and port↔port lanes. Edges are monthly for 2024. Nodes are major ports (expanded list).
- material_flows.topogram.csv — Transformation chain from raw materials (lithium/cobalt/nickel/silicon) to battery cell/pack to smartphone. Edges have annual durations for 2024–2025. Nodes represent materials and process/product stages.
- esg_impacts.topogram.csv — ESG overlay with a CO2e hub and company-specific ESG nodes linked by annual series 2020–2024 (start/end/time/date set per year).
- combined_all_layers.topogram.csv — Union of all above with a layer=... tag in the `extra` field.
- global_supply_chain.topogram.csv — A compact story graph connecting mines→ports→factories→retail→consumer.

Usage
- App UI: Home → Import → select any .topogram.csv file above.
- CLI bulk import:
  - Optional
    ./scripts/import_topograms_folder.py --dir samples/topograms/flowofevrything --folder "Global Supply Chain" --commit

Notes
- Synthetic data intended for demo and prototyping. Replace with real datasets (UN Comtrade, TiVA, WIOD, AIS, Open Supply Hub, corporate disclosures) as needed.
- Each CSV adheres to Topogram’s header; edges have source/target and `enlightement=arrow`. Timeline fields (`start`, `end`, `time`, `date`) are populated to enable playback/filters.
