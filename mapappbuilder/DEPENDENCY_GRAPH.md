# MapApp Builder Dependency Graph

The diagram below captures how configuration sources, packaging scripts, the sandbox
environment and renderer adapters interact when producing a downloadable presentation
bundle.

```mermaid
flowchart TD
  subgraph ExportInput
    Schema[config.schema.json]
    Sample[sample.config.json]
    Config(Json configuration from Topogram exporter)
    Dataset[data/topogram.json]
  end

  subgraph Template
    Loader[presentation-template/app.js]
    PluginsDir[presentation-template/plugins/*]
    Libs[presentation-template/lib/*]
    Styles[presentation-template/styles/*]
    Assets[presentation-template/assets/*]
  end

  subgraph Sandbox
    Sync[sync_sandboxapp.sh]
    SandboxServer[.sandboxapp/start_server.sh]
    SandboxApp[.sandboxapp/presentation/app.js]
    Bundler[.sandboxapp/presentation/package.json scripts]
    ReagraphUMD[.sandboxapp/presentation/lib/reagraph.umd.js]
  end

  subgraph Libraries
    Reagraph[reagraph (UMD) / CDN]
    React[react (peer) / CDN]
    Graphology[graphology (peer) / CDN]
    Cytoscape[cytoscape (UMD) / CDN]
    Sigma[sigma (UMD) / CDN]
    Leaflet[leaflet (UMD) / CDN]
    MapLibre[maplibre (UMD) / CDN]
    Cesium[cesium (UMD) / CDN]
    CDNFallbacks[CDN fallback lookup]
  end

  subgraph Packaging
    PackageScript[package.sh]
    BundleOutput[<export>.zip]
    ConfigOut[presentation/config.json]
  end

  subgraph Runtime
    MapPlugins[presentation-template/plugins/mapPlugins/*]
    NetworkPlugins[presentation-template/plugins/networkPlugins/*]
    EnsureGlobal[presentation-template/utils/ensureGlobal.js]
    DOM[presentation-template/index.html.tpl]
  end

  Schema --> Config
  Sample --> Config
  Config --> ConfigOut
  Dataset --> PackageScript

  PackageScript --> Loader
  PackageScript --> Libs
  PackageScript --> Styles
  PackageScript --> Assets
  PackageScript --> ConfigOut
  PackageScript --> BundleOutput
  PackageScript --> Dataset

  Sync --> SandboxApp
  Sync --> Libs
  Sync --> Styles
  Sync --> Assets

  SandboxServer --> SandboxApp
  Bundler --> ReagraphUMD
  ReagraphUMD --> Libs
  Bundler --> SandboxApp

  ReagraphUMD --> Reagraph
  Reagraph --> React
  Reagraph --> Graphology
  Libs --> Reagraph
  Libs --> Cytoscape
  Libs --> Sigma
  Libs --> Leaflet
  Libs --> MapLibre
  Libs --> Cesium
  CDNFallbacks --> Reagraph
  CDNFallbacks --> React
  CDNFallbacks --> Graphology
  CDNFallbacks --> Cytoscape
  CDNFallbacks --> Sigma
  CDNFallbacks --> Leaflet
  CDNFallbacks --> MapLibre
  CDNFallbacks --> Cesium

  Loader --> MapPlugins
  Loader --> NetworkPlugins
  Loader --> EnsureGlobal
  EnsureGlobal --> Libs
  MapPlugins --> Libs
  NetworkPlugins --> Libs
  Loader --> DOM
  DOM --> BundleOutput

  BundleOutput -->|served offline| Runtime
  SandboxApp --> Runtime
```

## How to read the graph

- **ExportInput**: the main Topogram application is responsible for generating the dataset
  JSON and the per-export configuration. Both map to the schema defined locally.
- **Template**: files under `presentation-template/` define the structure copied into both
  the sandbox and the final archive. Renderer plugins and utilities live here.
- **Sandbox**: the test harness keeps a live copy of the template and ships its own build
  scripts to refresh the local Reagraph UMD bundle.
- **Packaging**: `package.sh` is the single entry point for producing the final archive.
  It copies the template, injects runtime assets and writes the output zip.
- **Runtime**: the loader bootstraps the application in the generated bundle, pulling in
  renderer plugins and global libraries.

Use this document together with `README.md`, `MAP_RENDERERS.md`, and `NETWORK_RENDERERS.md`
for a complete overview of the builder workflow.
