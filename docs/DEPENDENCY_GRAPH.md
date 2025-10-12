```mermaid
flowchart TD
  subgraph Collections
    T[Topograms]
    N[Nodes]
    E[Edges]
    C[Comments]
    U[Users (Meteor.users)]
  end

  subgraph ServerStartup
    Sidx[imports/startup/server/indexes.js]
    Sseed[imports/startup/server/seed.js]
    Sapi[imports/endpoints/api-jsonroutes.js]
    Spub[imports/api/*/server/publications.js]
  end

  subgraph API
    MTopo[imports/endpoints/topograms.js]
    MNodes[imports/endpoints/nodes.js]
    MEdges[imports/endpoints/edges.js]
  end

  subgraph UI
    Net[Network (cytoscape) - imports/ui/components/Network.jsx]
    Geo[GeoMap - imports/ui/components/geoMap/*]
    Charts[Charts - imports/ui/components/charts/*]
    Sel[SelectionPanel - imports/ui/components/SelectionPanel/*]
    Popup[Popup - imports/ui/components/common/Popup.jsx]
  end

  T -->|_id| N
  T -->|_id| E
  U -->|userId| T
  E -->|data.source/target = N.data.id| N

  Sidx --> T
  Sidx --> N
  Sidx --> E

  MTopo --> T
  MNodes --> N
  MEdges --> E

  N --> Net
  E --> Net
  N --> Geo
  E --> Geo
  N --> Charts
  E --> Charts

  Net <-->|selection events| Sel
  Geo <-->|canonical selection events| Sel
  Charts <-->|selection events| Sel

  style T fill:#f9f,stroke:#333,stroke-width:1px
  style N fill:#9ff,stroke:#333,stroke-width:1px
  style E fill:#ff9,stroke:#333,stroke-width:1px

```

Notes:
- The graph above is simplified — publications and methods glue collections to the UI with server-side filtering for permissions and limits.
