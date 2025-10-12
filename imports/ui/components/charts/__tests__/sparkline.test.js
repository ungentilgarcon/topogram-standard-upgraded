const { expect } = require('chai')
const { buildSparklinePath } = require('../sparkline')

describe('buildSparklinePath', () => {
  it('returns empty path for empty input', () => {
    const s = buildSparklinePath([])
    expect(s.path).to.equal('')
    expect(s.width).to.be.a('number')
    expect(s.height).to.be.a('number')
  })

  it('builds an SVG path for numeric input', () => {
    const s = buildSparklinePath([1, 3, 2, 6, 4])
    expect(s.path).to.be.a('string')
    expect(s.path.startsWith('M')).to.equal(true)
    expect(s.path.includes('L')).to.equal(true)
  })
})
