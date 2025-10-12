import React from 'react'
import ui from '/imports/client/legacyUi'


import { MenuItemCompat as MenuItem } from '/imports/startup/client/muiCompat'
import ArrowRightIcon from '@mui/icons-material/ArrowRight'


@ui()
export default class ChartOptions extends React.Component {

//  handleSelectGeoMapTile = (value) => {
//    this.props.updateUI('geoMapTile', value)
//  }

  render() {
//    const mapTilesMenuItems = Object.keys(mapTiles).map( d => (
//      <MenuItem
//        value={d}
//        key={d}
//        primaryText={d.charAt(0).toUpperCase() + d.slice(1)}
//        onClick={() => this.handleSelectGeoMapTile(d)}
//      />
//    ))
//
    return (
      <MenuItem
        primaryText="Chart Options"
        disabled
        rightIcon={<ArrowRightIcon />}
      />
    )
  }
}
