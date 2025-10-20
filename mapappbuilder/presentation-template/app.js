// Minimal frontend loader for exported presentation
// Loads data/topogram.json and injects simple placeholders
fetch('data/topogram.json')
  .then(r => r.json())
  .then(data => {
    console.log('Loaded topogram', data)
    const map = document.getElementById('map')
    const network = document.getElementById('network')
    if (map) map.innerText = `Map renderer placeholder — ${data.topogram && data.topogram.title ? data.topogram.title : 'Topogram'}`
    if (network) network.innerText = `Network renderer placeholder — ${data.nodes ? data.nodes.length : 0} nodes, ${data.edges ? data.edges.length : 0} edges`
  })
  .catch(err => {
    console.error('Failed to load topogram data', err)
  })
