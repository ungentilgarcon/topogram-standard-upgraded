import React from 'react'
import PropTypes from 'prop-types'
import Slider from '@mui/material/Slider'
import { styled } from '@mui/material/styles'
import moment from 'moment'

const PurpleSlider = styled(Slider)(({ theme }) => ({
  // make the slider green to match side panel accent
  color: '#2e7d32',
  height: 6,
  '& .MuiSlider-thumb': {
    height: 18,
    width: 18,
    backgroundColor: '#fff',
    border: '2px solid #2e7d32',
  },
  '& .MuiSlider-track': {
    height: 6,
    border: 'none',
  },
  '& .MuiSlider-rail': {
    height: 6,
    opacity: 0.5,
    backgroundColor: '#6f6f6f',
  }
}))

export default function TimeSlider({ minTime, maxTime, valueRange, onChangeCommitted }) {
  const defaultMin = Number.isFinite(minTime) ? minTime : Date.now() - 1000 * 60 * 60 * 24 * 365 * 10
  const defaultMax = Number.isFinite(maxTime) ? maxTime : Date.now()
  const initial = Array.isArray(valueRange) && valueRange[0] != null && valueRange[1] != null ? [valueRange[0], valueRange[1]] : [defaultMin, defaultMax]

  const [value, setValue] = React.useState(initial)

  React.useEffect(() => {
    const v = Array.isArray(valueRange) && valueRange[0] != null && valueRange[1] != null ? [valueRange[0], valueRange[1]] : [defaultMin, defaultMax]
    setValue(v)
  }, [minTime, maxTime, valueRange])

  const handleChange = (e, newValue) => setValue(newValue)

  const handleCommitted = (e, newValue) => {
    if (typeof onChangeCommitted === 'function') {
      try { onChangeCommitted(Array.isArray(newValue) ? newValue.map(v => Number(v)) : newValue) } catch (err) { console.warn('TimeSlider onChangeCommitted handler failed', err) }
    }
  }

  return (
    <div style={{ padding: '6px 8px', color: '#fff' }}>
      <div style={{ fontSize: '11px', marginBottom: 6 }}>{`Timeline slider (${moment(value[0]).format('YYYY-MM-DD')} \u2192 ${moment(value[1]).format('YYYY-MM-DD')})`}</div>
      <PurpleSlider
        value={value}
        onChange={handleChange}
        onChangeCommitted={handleCommitted}
        valueLabelDisplay="off"
        min={defaultMin}
        max={defaultMax}
        disableSwap
      />
    </div>
  )
}

TimeSlider.propTypes = {
  minTime: PropTypes.number,
  maxTime: PropTypes.number,
  valueRange: PropTypes.array,
  onChangeCommitted: PropTypes.func
}
