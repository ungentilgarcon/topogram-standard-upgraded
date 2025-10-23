Global Supply Chain Graph of Everything — Sample

This sample dataset sketches a miniature “graph of everything” for a modern smartphone supply chain, linking mines, ports, factories, logistics hubs, retail, and the end consumer.

Contents
- global_supply_chain.topogram.csv — A single CSV combining nodes (sites) and edges (flows). Edges are rows that include source/target columns and have enlightement=arrow for direction.

Concepts showcased
- Nodes include resource extraction sites (lithium, cobalt, nickel), ports, battery factory, assembly factory, export/import ports, retail, and the consumer.
- Edges represent transport and transformation steps: mine → port → port → factory → assembly → export → import → retail → consumer.
- Colors distinguish sectors (mining, ports, factories, retail/consumer) and edges use sector-themed colors.

How to import
- Using the app UI: open the Import dialog on Home and select the CSV.
- Using the CLI importer:
  - Optional
    ./scripts/import_topograms_folder.py --dir samples/topograms/flowofevrything --folder "Global Supply Chain" --commit

Source inspiration
- Based on the note in ideas/flowofeverything.txt. Real-world data sources listed there (UN Comtrade, AIS, Open Supply Hub, etc.) can be layered in later to replace this synthetic sketch.
