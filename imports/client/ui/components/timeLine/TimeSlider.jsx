import React from 'react'
import PropTypes from 'prop-types'
import Slider from '@mui/material/Slider'
import { styled } from '@mui/material/styles'
import moment from 'moment'

const PurpleSlider = styled(Slider)(({ theme }) => ({
  color: '#b388ff',
  height: 6,
  '& .MuiSlider-thumb': {
    height: 18,
    width: 18,
    backgroundColor: '#fff',
    border: '2px solid #b388ff',
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

export default function TimeSlider({ minTime, maxTime }) {
  const min = Number.isFinite(minTime) ? minTime : Date.now() - 1000 * 60 * 60 * 24 * 365 * 10
  const max = Number.isFinite(maxTime) ? maxTime : Date.now()
  // default value: full range
  const [value, setValue] = React.useState([min, max])

  React.useEffect(() => {
    setValue([min, max])
  }, [min, max])

  const handleChange = (e, newValue) => setValue(newValue)

  return (
    <div style={{ padding: '6px 8px', color: '#fff' }}>
      <div style={{ fontSize: '11px', marginBottom: 6 }}>{`Timeline slider (${moment(value[0]).format('YYYY-MM-DD')} → ${moment(value[1]).format('YYYY-MM-DD')})`}</div>
      <PurpleSlider
        value={value}
        onChange={handleChange}
        valueLabelDisplay="off"
        min={min}
        max={max}
        disableSwap
      />
    </div>
  )
}

TimeSlider.propTypes = {
  minTime: PropTypes.number,
  maxTime: PropTypes.number
}
