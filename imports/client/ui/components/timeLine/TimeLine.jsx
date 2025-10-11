    import React from 'react'
    import PropTypes from 'prop-types'
    import ui from '/imports/client/legacyUi'
    import moment from 'moment'

    import { CardCompat as Card, CardTextCompat as CardText, CardTitleCompat as CardHeader, DatePickerCompat as DatePicker } from '/imports/startup/client/muiCompat'
    import { TextFieldCompat as TextField } from '/imports/startup/client/muiCompat'
    import { IconButtonCompat as IconButton } from '/imports/startup/client/muiCompat'
    import PlayCircleFilled from '@mui/icons-material/PlayCircleFilled'
    import Pause from '@mui/icons-material/Pause'
    import Stop from '@mui/icons-material/Stop'
    import SkipNext from '@mui/icons-material/SkipNext'
    import TimeSlider from './TimeSlider'
    import Tooltip from '@mui/material/Tooltip'

    const styleTimeLine = {
      position: 'fixed',
      bottom: 0,
      width: '70vw',
      fontSize: '8pt',
      display: 'inline-block',
      boxShadow: '1px 1px 8px  #000',
      border: '1px solid #222',
      backgroundColor: 'rgba(40,55,63,0.85)',
      zIndex: 9999,
      borderTopRightRadius: '20px',
      borderBottomRightRadius: '5px',
      padding: '6px 12px'
    }

    class TimeLine extends React.Component {
        constructor(props) {
          super(props)

          // compute a base tempo (in milliseconds to add per tick)
          let origTempo = 1000 // default 1s if ui not ready
          try {
            if (props && props.ui && typeof props.ui.maxTime === 'number' && typeof props.ui.minTime === 'number') {
              const seconds = parseInt((props.ui.maxTime - props.ui.minTime) / 1000)
              origTempo = Math.floor(seconds)
            }
          } catch (e) {
            origTempo = 1000
          }

          this.originalTempo = origTempo

          this.state = { playing: false, step: 1, tempo: this.originalTempo, timer: null, stopPressedOnce: true }
        }

      static propTypes = {
        hasTimeInfo: PropTypes.bool
      }

      handleChangeMinTime = (event, date) => { this.props.updateUI('minTime', date) }
      handleChangeMaxTime = (event, date) => { this.props.updateUI('maxTime', date) }

      openMinDatePicker = () => { if (this._minDatePicker && typeof this._minDatePicker.openDialog === 'function') this._minDatePicker.openDialog(); else if (this._minDatePicker && typeof this._minDatePicker.focus === 'function') this._minDatePicker.focus() }
      openMaxDatePicker = () => { if (this._maxDatePicker && typeof this._maxDatePicker.openDialog === 'function') this._maxDatePicker.openDialog(); else if (this._maxDatePicker && typeof this._maxDatePicker.focus === 'function') this._maxDatePicker.focus() }

      togglePlay = () => {
        if (this.state.playing) this.pause()
        else this.play()
      }

      pause = () => {
        clearInterval(this.state.timer)
        this.setState({ playing: false, timer: null })
      }

      play = () => {
        if (!this.props || !this.props.ui) return

        // recompute base tempo from current bounds to be robust
        let seconds = 1
        try {
          seconds = parseInt((this.props.ui.maxTime - this.props.ui.minTime) / 1000)
          this.originalTempo = Math.floor(seconds)
        } catch (e) {
          // keep existing originalTempo
        }

        // tempo stored in state should be originalTempo * step
        const tempo = Number.isFinite(this.originalTempo) ? Math.floor(this.originalTempo * (this.state.step || 1)) : (this.state.tempo || 1)

        const { maxTime } = this.props.ui

        const timer = setInterval(() => {
          const currentHigh = Array.isArray(this.props.ui.valueRange) ? Math.round(this.props.ui.valueRange[1]) : Math.round(this.props.ui.maxTime || 0)
          const newTime = currentHigh + tempo
          if (newTime >= Math.round(maxTime)) {
            this.pause()
            return
          }
          const newValue = [this.props.ui.valueRange[0], newTime]
          try {
            if (typeof this.props.updateUI === 'function') this.props.updateUI({ valueRange: newValue })
          } catch (err) { console.warn('TimeLine.play updateUI failed', err) }
        }, 10)

        this.setState({ playing: true, timer })
      }

      handleChangeStep = (e) => {
        const step = e && e.target ? e.target.value : 1
        const tempo = this.originalTempo * step
        this.setState({ step, tempo })
      }

      next = () => {
        if (!this.props || !this.props.ui) return
        let newValue = [0, 0]
        try {
          newValue = [
            moment(this.props.ui.valueRange[0]).add(1, 'years').unix() * 1000,
            moment(this.props.ui.valueRange[1]).add(1, 'years').unix() * 1000,
          ]

          if (newValue[1] > this.props.ui.maxTime) newValue[1] = this.props.ui.maxTime
          if (newValue[0] >= this.props.ui.maxTime) newValue[0] = moment(this.props.ui.maxTime).add(-1, 'years').unix() * 1000

          if (typeof this.props.updateUI === 'function') this.props.updateUI({ valueRange: newValue })
        } catch (err) { console.warn('TimeLine.next failed', err) }
      }

      stop = () => {
        this.pause()
        if (!this.state.stopPressedOnce) {
          // restore to full range
          try {
            if (typeof this.props.updateUI === 'function') this.props.updateUI({ valueRange: [Math.round(this.props.ui.minTime), Math.round(this.props.ui.maxTime)] })
          } catch (e) { console.warn('TimeLine.stop updateUI failed', e) }
        } else {
          // set to first year window
          try {
            const temp2 = moment(this.props.ui.minTime).add(1, 'years')
            if (typeof this.props.updateUI === 'function') this.props.updateUI({ valueRange: [Math.round(this.props.ui.minTime), temp2.unix() * 1000] })
          } catch (e) { console.warn('TimeLine.stop failed', e) }
        }
        this.setState({ stopPressedOnce: !this.state.stopPressedOnce })
      }

      render() {
        const { ui, hasTimeInfo } = this.props
        if (!ui) return null
        // Coerce min/max to millisecond timestamps (accept Date object, number, or ISO string)
        const coerceToMs = (v) => {
          if (v == null) return null
          if (typeof v === 'number') return v
          try {
            const dt = new Date(v)
            const t = dt.getTime()
            return Number.isFinite(t) ? t : null
          } catch (e) { return null }
        }

        const minTime = coerceToMs(ui.minTime)
        const maxTime = coerceToMs(ui.maxTime)

        // Debug: log UI props and panel visibility/size
        try {
          const el = (typeof document !== 'undefined') ? document.getElementById('timeline-panel') : null
          console.info('TOPOGRAM: TimeLine render', { uiPreview: { minTime: ui.minTime, maxTime: ui.maxTime, valueRange: ui.valueRange }, coerced: { minTime, maxTime }, panelExists: !!el, panelHeight: el ? el.offsetHeight : null })
        } catch (e) {}

        return (
          <Card id="timeline-panel" style={styleTimeLine}>
            {!hasTimeInfo ? (
              <CardHeader title={'No time info available.'} />
            ) : (
              <div>
                <table>
                  <tbody>
                    <tr>
                      <td style={{ width: '26%', whiteSpace: 'nowrap' }}>
                        <div>
                          <span>
                            From{' '}
                            <a onClick={this.openMinDatePicker} style={{ cursor: 'pointer', color: 'black' }}>
                              {minTime ? `${moment(minTime).format('MMM Do YYYY')}` : '—'}
                            </a>{' '}
                            to{' '}
                            <a onClick={this.openMaxDatePicker} style={{ cursor: 'pointer', color: 'black' }}>
                              {maxTime ? `${moment(maxTime).format('MMM Do YYYY')}` : '—'}
                            </a>
                          </span>

                          <Tooltip title="Play/Resume">
                            <IconButton className="timeline-btn" size="small" onClick={this.togglePlay} alt="Play/Resume">
                              {this.state.playing ? <Pause /> : <PlayCircleFilled />}
                            </IconButton>
                          </Tooltip>

                          <IconButton className="timeline-btn" size="small" onClick={() => {}} alt="next year of tours">
                            <Tooltip title="next year of tours">
                              <SkipNext />
                            </Tooltip>
                          </IconButton>

                          <Tooltip title="Stop/1st year of tour">
                            <IconButton className="timeline-btn" size="small" onClick={() => {}} alt="Stop/1st year of tour">
                              <Stop />
                            </IconButton>
                          </Tooltip>

                          <TextField
                            className="timeline-speed-input textFTime"
                            name="stepSetter"
                            type="number"
                            min={0.1}
                            max={10}
                            step={0.1}
                            variant="standard"
                            size="small"
                            style={{ width: '3.6em', margin: '0 0.7em', fontSize: '12px' }}
                            inputProps={{ style: { padding: '3px 4px', textAlign: 'center', fontSize: '12px' } }}
                            value={this.state.step}
                            onChange={this.handleChangeStep}
                          />
                        </div>
                      </td>
                      <td style={{ width: '4%' }} />
                      <td style={{ width: '70%' }}>
                        <div>
                          <span>
                            <DatePicker onChange={this.handleChangeMinTime} ref={(el) => { this._minDatePicker = el }} autoOk textFieldStyle={{ display: 'none' }} floatingLabelText="Min Date" value={minTime} />
                            <DatePicker onChange={this.handleChangeMaxTime} ref={(el) => { this._maxDatePicker = el }} autoOk textFieldStyle={{ display: 'none' }} floatingLabelText="Max Date" value={maxTime} />
                            <CardText style={{ paddingTop: 4, paddingBottom: 0 }}>
                              {minTime && maxTime ? (
                                <TimeSlider
                                  minTime={minTime}
                                  maxTime={maxTime}
                                  valueRange={ui.valueRange}
                                  onChangeCommitted={(newRange) => {
                                    // newRange is [min, max] in ms
                                    const [vmin, vmax] = Array.isArray(newRange) ? newRange : [null, null]
                                    // Only update the interactive selection (valueRange).
                                    // Do NOT change the primary minTime/maxTime bounds here.
                                    try {
                                      if (typeof this.props.updateUI === 'function') {
                                        this.props.updateUI({ valueRange: [vmin, vmax] })
                                      }
                                    } catch (e) {
                                      console.warn('TimeLine: failed to updateUI from slider', e)
                                    }
                                  }}
                                />
                              ) : null}
                            </CardText>
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )
      }
    }

    export default ui()(TimeLine)
