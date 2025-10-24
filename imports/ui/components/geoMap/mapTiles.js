function expandSubdomains(subdomains) {
  if (Array.isArray(subdomains)) return subdomains.length ? subdomains : ['']
  if (typeof subdomains === 'string') {
    if (!subdomains.length) return ['']
    return subdomains.split('').filter(Boolean)
  }
  if (subdomains != null && subdomains !== '') return [subdomains]
  return ['']
}

function buildTileUrls(url, subdomains) {
  if (!url) return []
  const urls = new Set()
  const list = expandSubdomains(subdomains)
  if (url.indexOf('{s}') >= 0) {
    list.forEach((sub) => {
      const withSubdomain = url.replace('{s}', sub || '')
      urls.add(withSubdomain.replace('{r}', ''))
    })
  } else {
    urls.add(url.replace('{r}', ''))
  }
  if (!urls.size) urls.add(url.replace('{r}', ''))
  return Array.from(urls)
}

function rasterStyleFromTileSpec(id, spec) {
  if (!spec || !spec.url) return null
  const tiles = buildTileUrls(spec.url, spec.subdomains)
  const sourceId = `${id}-source`
  const layerId = `${id}-layer`
  const tileSize = spec.tileSize || 256
  const source = {
    type: 'raster',
    tiles,
    tileSize
  }
  if (spec.minZoom != null) source.minzoom = spec.minZoom
  if (spec.maxZoom != null) source.maxzoom = spec.maxZoom
  if (spec.attribution) source.attribution = spec.attribution
  return {
    version: 8,
    // Provide a default glyphs endpoint so MapLibre can render text in any
    // symbol layers we add on top of this raster basemap (edge/node labels).
    // This URL is a public demo font endpoint compatible with MapLibre.
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      [sourceId]: source
    },
    layers: [
      {
        id: layerId,
        type: 'raster',
        source: sourceId
      }
    ]
  }
}

const mapTiles = {
  default: {
    id: 'default',
    label: 'Default',
    rendererLabel: {
      leaflet: 'OpenStreetMap',
      maplibre: 'MapLibre demo',
      cesium: 'Cesium globe'
    },
    description: 'Standard OpenStreetMap cartography.',
    supportedRenderers: ['leaflet', 'maplibre', 'cesium'],
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    maplibreStyle: 'https://demotiles.maplibre.org/style.json'
  },
  blackAndWhite: {
    id: 'blackAndWhite',
    label: 'Dark',
    rendererLabel: {
      leaflet: 'Dark (Carto)',
      maplibre: 'Dark (Carto)',
      cesium: 'Dark (Carto)'
    },
    description: 'High-contrast Carto dark basemap.',
    supportedRenderers: ['leaflet', 'maplibre', 'cesium'],
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
    subdomains: 'abcd',
    maxZoom: 20
  },
  cartoLight: {
    id: 'cartoLight',
    label: 'Light',
    rendererLabel: {
      leaflet: 'Light (Carto)',
      maplibre: 'Light (Carto)',
      cesium: 'Light (Carto)'
    },
    description: 'Carto Positron light basemap.',
    supportedRenderers: ['leaflet', 'maplibre', 'cesium'],
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
    subdomains: 'abcd',
    maxZoom: 20
  },
  topographic: {
    id: 'topographic',
    label: 'Topographic',
    rendererLabel: {
      leaflet: 'Topographic'
    },
    description: 'OpenTopoMap hillshade and contour view.',
    supportedRenderers: ['leaflet'],
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 17,
    attribution: 'Map data: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  },
  photos: {
    id: 'photos',
    label: 'Satellite',
    rendererLabel: {
      leaflet: 'Satellite (Esri)',
      maplibre: 'Satellite (Esri)',
      cesium: 'Satellite (Esri)'
    },
    description: 'Esri world imagery tiles.',
    supportedRenderers: ['leaflet', 'maplibre', 'cesium'],
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19
  },
  none: {
    id: 'none',
    label: 'No background',
    rendererLabel: {
      leaflet: 'No background'
    },
    description: 'Hide the base map and show only nodes and edges.',
    supportedRenderers: ['leaflet'],
    url: ''
  }
}

Object.keys(mapTiles).forEach((key) => {
  if (!mapTiles[key].id) mapTiles[key].id = key
})

mapTiles.blackAndWhite.maplibreStyle = () => rasterStyleFromTileSpec('carto-dark', mapTiles.blackAndWhite)
mapTiles.cartoLight.maplibreStyle = () => rasterStyleFromTileSpec('carto-light', mapTiles.cartoLight)
mapTiles.photos.maplibreStyle = () => rasterStyleFromTileSpec('esri-imagery', mapTiles.photos)

const mapTileOptionList = Object.keys(mapTiles).map((key) => {
  const spec = mapTiles[key]
  return {
    id: spec.id || key,
    label: spec.label || key,
    spec
  }
})

export function getRendererTileOptions(renderer) {
  const normalized = renderer || 'leaflet'
  return mapTileOptionList
    .filter(({ spec }) => {
      const supports = spec.supportedRenderers
      if (!supports || !supports.length) return true
      return supports.includes(normalized)
    })
    .map(({ id, label, spec }) => ({
      id,
      label: (spec.rendererLabel && spec.rendererLabel[normalized]) || label,
      description: spec.description,
      spec
    }))
}

export default mapTiles
