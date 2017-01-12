const { expect, mockery, sinon, configMock, defaultOptions } = require('test/unit/setup')


let AirspaceMap, _requestTiles, _supported, events, EventEmitter, _evOn, _evRemoveListener, mapboxglMock

before(() => {
    AirspaceMap = require('src/AirspaceMap')
    _requestTiles = sinon.stub(AirspaceMap.prototype, '_requestTiles', () => true)
    _supported = sinon.stub(AirspaceMap.prototype, '_supported', () => true)
    events = require('events')
    _evOn = sinon.stub(events.EventEmitter.prototype, 'on', (type, listener) => null)
    _evRemoveListener = sinon.stub(events.EventEmitter.prototype, 'removeListener', (type, listener) => null)
    mapboxglMock = require('mapbox-gl-js-mock')
    // additional methods not yet added to mapbox-gl-js-mock
    mapboxglMock.Map.prototype.fitBounds = () => null
    mapboxglMock.Map.prototype.flyTo = () => null
    mapboxglMock.Map.prototype.getCenter = () => null
    mapboxglMock.Map.prototype.remove = () => null
    mapboxglMock.Map.prototype.removeControl = () => null
    mapboxglMock.Map.prototype.resize = () => null
    mapboxglMock.Map.prototype.setLayoutProperty = () => null
    mapboxglMock.Map.prototype.zoomTo = () => null
})

after(() => {
    _requestTiles.restore()
    _supported.restore()
    _evOn.restore()
    _evRemoveListener.restore()
})


describe('AirspaceMap#constructor', () => {

    it('should provide the expected defaults options if none are specified', () => {
        const expected = defaultOptions
        const actual = new AirspaceMap(configMock)
        expect(actual.defaults).to.deep.equal(expected)
    })

    it('should override defaults if options are provided', () => {
        const expected = {
            ...defaultOptions,
            container: 'map',
            theme: 'dark',
            zoom: 12
        }
        const actual = new AirspaceMap(configMock, {
            container: 'map',
            theme: 'dark',
            zoom: 12
        })
        expect(actual.options).to.deep.equal(expected)
    })

    it('should throw if no api key is provided', () => {
        expect(() => {
            const map = new AirspaceMap({ ...configMock, airmap: { "api_key": null } })
        }).to.throw()
    })

    it('should throw if no mapbox token is provided', () => {
        expect(() => {
            const map = new AirspaceMap({ ...configMock, mapbox: { "access_token": null } })
        }).to.throw()
    })

    it('should call _addMap()', () => {
        const spy = sinon.spy(AirspaceMap.prototype, '_addMap')
        const actual = new AirspaceMap(configMock)
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

})

describe('AirspaceMap#setLayers', () => {

    let map, addLayer, removeLayer

    beforeEach(() => {
        map = new AirspaceMap(configMock, { layers: ['schools'] })
        addLayer = sinon.stub(map, 'addLayer', () => null)
        removeLayer = sinon.stub(map, 'removeLayer', () => null)
    })

    afterEach(() => {
        map = null
        addLayer.restore()
        removeLayer.restore()
    })

    it('should call addLayer for new layers', () => {
        map.setLayers(['heliports', 'wildfires'])
        expect(addLayer).to.have.been.calledWith('heliports')
        expect(addLayer).to.have.been.calledWith('wildfires')
    })

    it('should not call addLayer for already existing layers', () => {
        map.setLayers(['heliports', 'wildfires', 'schools'])
        expect(addLayer).to.have.not.been.calledWith('schools')
    })

    it('should call removeLayer for old layers', () => {
        map.setLayers(['heliports', 'wildfires'])
        expect(removeLayer).to.have.been.calledWith('schools')
    })

})

describe('AirspaceMap#addLayer', () => {

    let map, setLayoutProperty

    beforeEach(() => {
        map = new AirspaceMap(configMock)
        setLayoutProperty = sinon.stub(mapboxglMock.Map.prototype, 'setLayoutProperty', () => null)
    })

    afterEach(() => {
        map = null
        setLayoutProperty.restore()
    })

    it('should set normal layers to visible', () => {
        map.addLayer('schools')
        expect(setLayoutProperty).to.have.been.calledWith('schools', 'visibility', 'visible')
        expect(map.getLayers()).to.deep.equal(['schools'])
    })

    it('should append new layers when called more than once', () => {
        (() => {
            map.addLayer('schools')
            map.addLayer('class_c')
            expect(setLayoutProperty).to.have.been.calledWith('schools', 'visibility', 'visible')
            expect(setLayoutProperty).to.have.been.calledWith('class_c', 'visibility', 'visible')
            expect(map.getLayers()).to.deep.equal(['schools', 'class_c'])
        })
    })

    it('should set TFR layers to visible', () => {
        (() => {
            map.addLayer('tfrs')
            expect(setLayoutProperty).to.have.been.calledWith('active-tfrs', 'visibility', 'visible')
            expect(setLayoutProperty).to.have.been.calledWith('future-tfrs', 'visibility', 'visible')
            expect(map.getLayers()).to.deep.equal(['tfrs'])
        })
    })

    it('should set DNAS layers to visible', () => {
        (() => {
            map.addLayer('airports_recreational')
            expect(setLayoutProperty).to.have.been.calledWith('airports_recreational', 'visibility', 'visible')
            expect(setLayoutProperty).to.have.been.calledWith('airports_recreational_dnas', 'visibility', 'visible')
            expect(map.getLayers()).to.deep.equal(['airports_recreational'])
        })
    })

    it('should set layers with markers to visible', () => {
        (() => {
            map.addLayer('heliports')
            expect(setLayoutProperty).to.have.been.calledWith('heliports', 'visibility', 'visible')
            expect(setLayoutProperty).to.have.been.calledWith('heliports-marker', 'visibility', 'visible')
            expect(map.getLayers()).to.deep.equal(['heliports'])
        })
    })

})

describe('AirspaceMap#removeLayer', () => {

    let map, setLayoutProperty

    beforeEach(() => {
        map = new AirspaceMap(configMock, { layers: ['tfrs', 'noaa', 'airports_recreational', 'schools'] })
        setLayoutProperty = sinon.stub(mapboxglMock.Map.prototype, 'setLayoutProperty', () => null)
    })

    afterEach(() => {
        map = null
        setLayoutProperty.restore()
    })

    it('should set normal layers to hidden', () => {
        map.removeLayer('schools')
        expect(setLayoutProperty).to.have.been.calledWith('schools', 'visibility', 'none')
        expect(map.getLayers()).to.deep.equal(['tfrs', 'noaa', 'airports_recreational'])
    })

    it('should remove layers when called more than once', () => {
        (() => {
            map.removeLayer('schools')
            map.removeLayer('noaa')
            expect(setLayoutProperty).to.have.been.calledWith('schools', 'visibility', 'none')
            expect(setLayoutProperty).to.have.been.calledWith('noaa', 'visibility', 'none')
            expect(map.getLayers()).to.deep.equal(['tfrs', 'airports_recreational'])
        })
    })

    it('should set TFR layers to hidden', () => {
        (() => {
            map.removeLayer('tfrs')
            expect(setLayoutProperty).to.have.been.calledWith('active-tfrs', 'visibility', 'none')
            expect(setLayoutProperty).to.have.been.calledWith('future-tfrs', 'visibility', 'none')
            expect(map.getLayers()).to.deep.equal(['noaa', 'airports_recreational', 'schools'])
        })
    })

    it('should set DNAS layers to hidden', () => {
        (() => {
            map.removeLayer('airports_recreational')
            expect(setLayoutProperty).to.have.been.calledWith('airports_recreational', 'visibility', 'none')
            expect(setLayoutProperty).to.have.been.calledWith('airports_recreational_dnas', 'visibility', 'none')
            expect(map.getLayers()).to.deep.equal(['tfrs', 'noaa', 'schools'])
        })
    })

    it('should set layers with markers to hidden', () => {
        (() => map.addLayer('heliports'))
        (() => {
            map.removeLayer('heliports')
            expect(setLayoutProperty).to.have.been.calledWith('heliports', 'visibility', 'none')
            expect(setLayoutProperty).to.have.been.calledWith('heliports-marker', 'visibility', 'none')
            expect(map.getLayers()).to.deep.equal(['tfrs', 'noaa', 'airports_recreational', 'schools'])
        })
    })

})

describe('AirspaceMap#hasLayer', () => {

    it('should return true if the layer exists', () => {
        const actual = new AirspaceMap(configMock, { layers: ['schools'] })
        expect(actual.hasLayer('schools')).to.be.true
    })

    it('should return false if the layer does not exist', () => {
        const actual = new AirspaceMap(configMock, { layers: ['schools'] })
        expect(actual.hasLayer('noaa')).to.be.false
    })

})

describe('AirspaceMap#move', () => {

    it('should call flyTo with the provided arguments', () => {
        const spy = sinon.spy(AirspaceMap.prototype, 'flyTo')
        const actual = new AirspaceMap(configMock)
        actual.move(-118.4085, 33.9416, 10)
        expect(spy).to.have.been.calledWith({ center: [33.9416, -118.4085], zoom: 10 })
        spy.restore()
    })

    it('should call getZoom if no zoom is provided', () => {
        const spy = sinon.spy(AirspaceMap.prototype, 'getZoom')
        const actual = new AirspaceMap(configMock)
        actual.move(-118.4085, 33.9416)
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

})

describe('AirspaceMap#flyTo', () => {

    it('should call mapboxgl.Map.flyTo with the provided arguments', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'flyTo')
        const actual = new AirspaceMap(configMock)
        actual.flyTo({ center: [33.9416, -118.4085], zoom: 10 })
        expect(spy).to.have.been.calledWith({ center: [33.9416, -118.4085], zoom: 10 })
        spy.restore()
    })

})

describe('AirspaceMap#zoom', () => {

    it('should call mapboxgl.Map.zoomTo with the provided arguments', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'zoomTo')
        const actual = new AirspaceMap(configMock)
        actual.zoom(20, { duration: 4000 })
        expect(spy).to.have.been.calledWith(20, { duration: 4000 })
        spy.restore()
    })

})

describe('AirspaceMap#zoomIn', () => {

    let stub

    beforeEach(() => {
        stub = sinon.stub(AirspaceMap.prototype, 'getZoom', () => 12)
    })

    afterEach(() => {
        stub.restore()
    })

    it('should call getZoom to retrieve the current zoom level', () => {
        const actual = new AirspaceMap(configMock)
        actual.zoomIn(2)
        expect(stub).to.have.been.calledOnce
    })

    it('should call zoom with the delta added to the current zoom', () => {
        const spy = sinon.spy(AirspaceMap.prototype, 'zoom')
        const actual = new AirspaceMap(configMock)
        actual.zoomIn(3)
        expect(spy).to.have.been.calledWith(15)
        spy.restore()
    })

})

describe('AirspaceMap#zoomOut', () => {

    let stub

    beforeEach(() => {
        stub = sinon.stub(AirspaceMap.prototype, 'getZoom', () => 12)
    })

    afterEach(() => {
        stub.restore()
    })

    it('should call getZoom to retrieve the current zoom level', () => {
        const actual = new AirspaceMap(configMock)
        actual.zoomOut(2)
        expect(stub).to.have.been.calledOnce
    })

    it('should call zoom with the delta subtracted from the current zoom', () => {
        const spy = sinon.spy(AirspaceMap.prototype, 'zoom')
        const actual = new AirspaceMap(configMock)
        actual.zoomOut(3)
        expect(spy).to.have.been.calledWith(9)
        spy.restore()
    })

})

describe('AirspaceMap#resize', () => {

    it('should call mapboxgl.Map.resize with the provided arguments', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'resize')
        const actual = new AirspaceMap(configMock)
        actual.resize()
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

})

describe('AirspaceMap#fitBounds', () => {

    it('should call mapboxgl.Map.fitBounds with the provided arguments', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'fitBounds')
        const actual = new AirspaceMap(configMock)
        actual.fitBounds([[0, 0], [0, 0]], { padding: 1 })
        expect(spy).to.have.been.calledWith([[0, 0], [0, 0]], { padding: 1 })
        spy.restore()
    })

})

describe('AirspaceMap#getCenter', () => {

    it('should call mapboxgl.Map.getCenter', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'getCenter')
        const actual = new AirspaceMap(configMock)
        actual.getCenter()
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

})

describe('AirspaceMap#getZoom', () => {

    it('should call mapboxgl.Map.getZoom', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'getZoom')
        const actual = new AirspaceMap(configMock)
        actual.getZoom()
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

})

describe('AirspaceMap#getSource', () => {

    it('should call mapboxgl.Map.getSource', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'getSource')
        const actual = new AirspaceMap(configMock)
        actual.getSource('abc123')
        expect(spy).to.have.been.calledWith('abc123')
        spy.restore()
    })

})

describe('AirspaceMap#addSource', () => {

    it('should call mapboxgl.Map.addSource', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'addSource')
        const actual = new AirspaceMap(configMock)
        actual.addSource('abc123', {})
        expect(spy).to.have.been.calledWith('abc123', {})
        spy.restore()
    })

})

describe('AirspaceMap#addControl', () => {

    it('should call mapboxgl.Map.addControl', () => {
        const stub = sinon.stub(mapboxglMock.Map.prototype, 'addControl', () => null)
        const actual = new AirspaceMap(configMock)
        actual.addControl({})
        expect(stub).to.have.been.calledWith({})
        stub.restore()
    })

})

describe('AirspaceMap#removeControl', () => {

    it('should call mapboxgl.Map.removeControl', () => {
        const stub = sinon.stub(mapboxglMock.Map.prototype, 'removeControl', () => null)
        const actual = new AirspaceMap(configMock)
        actual.removeControl({})
        expect(stub).to.have.been.calledWith({})
        stub.restore()
    })

})

describe('AirspaceMap#getTheme', () => {

    it('should return the current theme', () => {
        const actual = new AirspaceMap(configMock, { theme: 'dark' })
        const expected = 'dark'
        expect(actual.getTheme()).to.equal(expected)
    })

    it('should return the new theme after theme has changed', () => {
        const actual = new AirspaceMap(configMock)
        const expected = 'satellite'
        actual.theme('satellite')
        expect(actual.getTheme()).to.equal(expected)
    })

})

describe('AirspaceMap#theme', () => {

    it('should call _requestTiles to get new tiles', () => {
        (() => {
            const actual = new AirspaceMap(configMock)
            actual.theme('satellite')
            expect(_requestTiles).to.have.been.calledOnce
        })
    })

    it('should update activeTheme with the new theme value', () => {
        const actual = new AirspaceMap(configMock)
        actual.theme('satellite')
        expect(actual.getTheme()).to.equal('satellite')
    })

    it('should throw if the provided theme is not valid', () => {
        expect(() => {
            const actual = new AirspaceMap(configMock)
            actual.theme('space')
        }).to.throw()
    })

})

describe('AirspaceMap#addMarker', () => {

    it('should call _renderMarkers', () => {
        const spy = sinon.spy(AirspaceMap.prototype, '_renderMarkers')
        const actual = new AirspaceMap(configMock)
        actual.addMarker(0, 0)
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

    it('should return a marker id', () => {
        const actual = new AirspaceMap(configMock)
        expect(actual.addMarker(0, 0)).to.be.a('string')
    })

})

describe('AirspaceMap#removeMarker', () => {

    it('should call _renderMarkers', () => {
        const spy = sinon.spy(AirspaceMap.prototype, '_renderMarkers')
        const actual = new AirspaceMap(configMock)
        actual.addMarker(0, 0)
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

})

describe('AirspaceMap#remove', () => {

    it('should call mapboxgl.Map.remove', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'remove')
        const actual = new AirspaceMap(configMock)
        actual.remove()
        expect(spy).to.have.been.calledOnce
        spy.restore()
    })

})

describe('AirspaceMap#on', () => {

    it('should call EventEmitter.on when used with an airspace event', () => {
        const actual = new AirspaceMap(configMock)
        const listener = () => null
        actual.on('airspace.click', listener)
        expect(_evOn).to.have.been.calledWith('airspace.click', listener)
    })

    it('should call mapboxgl.Map.on when used without an airspace event', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'on')
        const actual = new AirspaceMap(configMock)
        const listener = () => null
        actual.on('foo', listener)
        expect(spy).to.have.been.calledOnce
        expect(spy).to.have.been.calledWith('foo', listener)
        spy.restore()
    })

})

describe('AirspaceMap#off', () => {

    it('should call EventEmitter.removeListener when used with an airspace event', () => {
        const actual = new AirspaceMap(configMock)
        const listener = () => null
        actual.off('airspace.click', listener)
        expect(_evRemoveListener).to.have.been.calledWith('airspace.click', listener)
    })

    it('should call mapboxgl.Map.off when used without an airspace event', () => {
        const spy = sinon.spy(mapboxglMock.Map.prototype, 'off')
        const actual = new AirspaceMap(configMock)
        const listener = () => null
        actual.off('foo', listener)
        expect(spy).to.have.been.calledOnce
        expect(spy).to.have.been.calledWith('foo', listener)
        spy.restore()
    })

})

