'use strict'

const AirspaceMap = require('./AirspaceMap')
module.exports = AirspaceMap

// Assign it to the global scope.
window.Airmap = window.Airmap || {}
window.Airmap.Map = AirspaceMap
