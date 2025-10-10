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
      borderTopRightRadius: '20px',
      borderBottomRightRadius: '5px',
      padding: '6px 12px'
    }

    class TimeLine extends React.Component {
      constructor(props) {
        super(props)
        this.state = { playing: false, step: 1 }
      }

      static propTypes = {
        hasTimeInfo: PropTypes.bool
      }

      handleChangeMinTime = (event, date) => { this.props.updateUI('minTime', date) }
      handleChangeMaxTime = (event, date) => { this.props.updateUI('maxTime', date) }

      openMinDatePicker = () => { if (this._minDatePicker && typeof this._minDatePicker.openDialog === 'function') this._minDatePicker.openDialog(); else if (this._minDatePicker && typeof this._minDatePicker.focus === 'function') this._minDatePicker.focus() }
      openMaxDatePicker = () => { if (this._maxDatePicker && typeof this._maxDatePicker.openDialog === 'function') this._maxDatePicker.openDialog(); else if (this._maxDatePicker && typeof this._maxDatePicker.focus === 'function') this._maxDatePicker.focus() }

      togglePlay = () => this.setState((s) => ({ playing: !s.playing }))

      handleChangeStep = (e) => {
        const step = e && e.target ? e.target.value : 1
        this.setState({ step })
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
                                <TimeSlider minTime={minTime} maxTime={maxTime} />
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
