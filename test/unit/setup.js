'use strict'

/**
 * Export shared dependencies so they can be included more easily in each test
 * i.e. const { chai, expect, sinon } = require('../shared')
 */

const chai = require('chai')
const { expect } = require('chai')
const jsdom = require('jsdom-global')
const mockery = require('mockery')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')
chai.use(sinonChai)


// ignore css that's imported with browserify-css
require.extensions['.css'] = () => null

const configMock = {
    "airmap": {
        "api_key": "ey123abc"
    },
    "auth0": {
        "client_id": "def456",
        "callback_url": "localhost:8080"
    },
    "mapbox": {
        "access_token": "0321654"
    }
}

const defaultOptions = {
    container: null,
    center: [0, 0],
    layers: [],
    theme: 'standard',
    zoom: 7,
    pitch: 0,
    bearing: 0,
    hash: false,
    interactive: true,
    showControls: true,
    showPopups: true,
    showSearch: false,
    useLocation: false,
    createFlights: false,
    tileServiceUrl: 'https://api.airmap.com/maps/v4/tilejson',
    webAppUrl: 'https://app.airmap.io'
}

before(() => {
    jsdom()
    mockery.enable({ warnOnUnregistered: false })
    mockery.registerSubstitute('mapbox-gl', 'mapbox-gl-js-mock')
    mockery.registerMock('fg-loadcss', { loadCSS: () => null })
})

after(() => {
    jsdom()
    mockery.deregisterSubstitute('mapbox-gl')
    mockery.deregisterMock('fg-loadcss')
    mockery.disable()
})


module.exports = {
    chai,
    expect,
    mockery,
    sinon,
    configMock,
    defaultOptions
}
