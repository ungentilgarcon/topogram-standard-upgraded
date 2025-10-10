import React from 'react'
import PropTypes from 'prop-types'

export default function TimeSlider({ minTime, maxTime }) {
  // Minimal placeholder slider used by TimeLine. Expects ms timestamps.
  const min = minTime || 0
  const max = maxTime || Date.now()
  return (
    <div style={{ padding: '6px 8px', color: '#fff' }}>
      <div style={{ fontSize: '11px' }}>Timeline slider ({new Date(min).toISOString().slice(0,10)} → {new Date(max).toISOString().slice(0,10)})</div>
    </div>
  )
}

TimeSlider.propTypes = {
  minTime: PropTypes.number,
  maxTime: PropTypes.number
}
