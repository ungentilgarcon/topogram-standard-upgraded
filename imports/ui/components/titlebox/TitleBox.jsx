import React from 'react'
import PropTypes from 'prop-types'
import ui from '/imports/client/legacyUi'
import { CardCompat as Card, CardTitleCompat as CardTitle, CardActionsCompat as CardActions } from '/imports/startup/client/muiCompat'
// FlatButton removed in favor of MUI v5 Button
import Button from '@mui/material/Button'
import ClearIcon from '@mui/icons-material/Clear'
import FocusIcon from '@mui/icons-material/CenterFocusStrong'

import SelectionChips from '../selectionItem/SelectionChips.jsx'
import SelectedItem from '../selectionItem/SelectedItem.jsx'
// SvgIcon not used anymore; using @mui/icons-material
import Modal from './Modal';
import './TitleBox.css'
@ui()
export default class TitleBox extends React.Component {

  static propTypes = {
    topogramTitle: PropTypes.string
  }

  constructor(props) {
    super(props)
    this.state = { isOpen: false }
  }

  toggleModal = () => {
    this.setState({ isOpen: !this.state.isOpen })
  }

  render() {

const {
  cy,
  topogramTitle,

  selectedElements,
  unselectElement,
  unselectAllElements,

  isolateMode,
  handleEnterIsolateMode,
  handleEnterExtractMode,
  handleExitIsolateMode,
  handleSaveSelection,
  handleLoadSelection,
  handleSaveSVGs,
  handleFilterByWeight,
  focusElement,
  onFocusElement,
  onUnfocusElement
} = this.props

const modalStyle = {
  backgroundColor: '#fff',
  borderRadius: 5,
  maxWidth: 500,
  minHeight: 300,
  margin: '0 auto',
  padding: 30
};

    if (!this.props.topogramTitle) {
      return null
    }

    const TitleForBox = this.props.topogramTitle.split("\n")[0]
    const Title2ForBox = this.props.topogramTitle.split("\n")[1]
    const Title3ForBox = this.props.topogramTitle.split("\n")[2]
    const Title4ForBox = this.props.topogramTitle.split("\n")[3]
    const Title5ForBox = this.props.topogramTitle.split("\n")[4]


    return (
      <Card
        className="titlebox-root"
        style={{
          maxWidth: '20%',
          minWidth: '15%',
          float: 'left',
          borderBottomRightRadius: '16px',
          borderTopRightRadius: '6px',
          borderBottomLeftRadius: '6px',
          boxShadow: '0 8px 18px rgba(0,0,0,0.35)',
          border: '1px solid rgba(0,0,0,0.5)',
          backgroundColor: 'rgba(69,90,100,0.9)'
        }}
      >
  <div>
    <CardTitle
      title={
        <div style={{fontSize:"8pt", color: '#F2EFE9', fontWeight: 'bold'}}>BandsTour 2025 v.4 GPLv3 by <a style={{ color: '#b999d6' }} href="mailto:bahdegregory@gmail.com">Gregory Bahdé</a></div>}
      titleStyle={{ fontSize : '8pt', lineHeight : '1em', padding:"0px 2px 5px 2px", color: '#F2EFE9' }}
      subtitle={TitleForBox}
        subtitleStyle={{ fontSize : '12pt', color: '#F2EFE9', lineHeight : '1.3em', fontWeight:  'bold', textShadow: '0 1px 1px rgba(0,0,0,0.6)' }}
    />
{this.state.isOpen?
  null:
<Button className="titlebox-datas-btn titlebox-action-btn" variant="contained" onClick={this.toggleModal} sx={{ fontSize: '8pt', height: '20px', fontWeight: 'bold', '&:hover': { bgcolor: '#9a7cb6' } }}>DATAS...</Button>
}
              <Modal style={{fontSize:"8pt"}}show={this.state.isOpen}
                onClose={this.toggleModal}>
<span className="titlebox-stats" style={{fontSize:"10pt"}}>
                {Title2ForBox}<br/>
                {Title3ForBox}<br/>
                {Title4ForBox}<br/>
                <a style={{fontWeight:"bold"}}>{Title5ForBox}</a>
</span>
{
  !!selectedElements.length&&this.state.isOpen ?
  <SelectionChips
    cy={cy}
    selectedElements={selectedElements}
    unselectElement={unselectElement}
    onFocusElement={onFocusElement}
    variant="outlined"
    className="ChipSelect"
    />
    :
    null
}
{
  !! selectedElements.length ?
  <CardActions >
    {
      isolateMode ?
      <div>
        <Button variant="text" onClick={handleExitIsolateMode} startIcon={<ClearIcon />} sx={{ color: '#F2EFE9' }}>
          Clear
        </Button>
        {/*
          <RaisedButton style={{fontSize: "6pt" ,Width : "15px",height:"15px"}}
            label="Save selection"
            labelPosition="before"
          //  icon={<FocusIcon />}
            onClick={handleSaveSelection}
            />
          <RaisedButton style={{fontSize: "6pt" ,Width : "15px",height:"15px"}}
            className= "Titbox"
            label="SaveSVGs"
            labelPosition="before"
            //icon={<FocusIcon />}
            onClick={handleSaveSVGs}
            />
            */}
      </div>
        :
        <div>
        <Button className="titlebox-action-btn" variant="contained" onClick={handleEnterIsolateMode} sx={{ fontSize: '7pt', height: '22px', mr: 1 }}>
          Focus and rearrange
        </Button>

          <Button className="titlebox-action-btn" variant="outlined" onClick={handleEnterExtractMode} sx={{ fontSize: '7pt', height: '22px' }}>
            Focus only
          </Button>
            {/* <RaisedButton style={{fontSize: "6pt" ,Width : "15px",height:"15px"}}
              label="Save selection"
              labelPosition="before"
            //  icon={<FocusIcon />}
              onClick={handleSaveSelection}
              />
              <RaisedButton style={{fontSize: "6pt" ,Width : "15px",height:"15px"}}
                className= "Titbox"
                label="Load Selection"
                labelPosition="before"
                //icon={<FocusIcon />}
                onClick={handleLoadSelection}
                />

                <RaisedButton style={{fontSize: "6pt" ,Width : "15px",height:"15px"}}
                  className= "Titbox"
                  label="SaveSVGs"
                  labelPosition="before"
                  //icon={<FocusIcon />}
                  onClick={handleSaveSVGs}
                  />
                   */}
          </div>



      }
  </CardActions>
  :
  null
}
{
  !!focusElement ?
  <SelectedItem
    key={focusElement.data.id}
    el={focusElement}
    cy={cy}
    onUnfocusElement={onUnfocusElement}
  />
  :
  null
}


              </Modal>
    </div>

      </Card>
    )
  }
}
