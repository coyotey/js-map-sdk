const _ = require('lodash')
const EventEmitter = require('events').EventEmitter
const fs = require('fs')
const insertCss = require('insert-css')
const load = require('load-script')
const loadCSS = require('fg-loadcss').loadCSS
const mapboxgl = require('mapbox-gl')
const request = require('superagent')
const uuid = require('uuid')
const constants = require('./constants')
const utils = require('./utils')
const { BadConfigError, BadOptionError } = require('./error')
const templates = {
    popup: _.template(fs.readFileSync(__dirname + '/templates/popup.html', 'utf8'), { 'imports': { 'constants': constants } })
}


/**
 * Class that wraps Mapbox GL and allows for working with airspace layers.
 */

class AirspaceMap {

    /**
     * Configure map, set options, and load stylesheets.
     * @param {Object} config - AirMap configuration object containing an API Key and Mapbox Access Token.
     * @param {string} config.airmap.api_key - AirMap API Key from the developer dashboard.
     * @param {string} config.mapbox.access_token - Mapbox access token.
     * @param {Object} opts - Map options.
     * @param {string} opts.container - ID of the DOM element to load the map inside.
     * @param {Array} [opts.center=[0,0]] - An array with [latitude, longitude] coordinates for where the map should be centered on load.
     * @param {Array} [opts.layers=[]] - Airspace layers to make visible on load.
     * @param {string} [opts.theme=standard] - Map theme: standard, dark, light, or satellite.
     * @param {number} [opts.zoom=7] - Map zoom level on load.
     * @param {number} [opts.pitch=0] - Map pitch on load.
     * @param {number} [opts.bearing=0] - Map bearing on load.
     * @param {boolean} [opts.interactive=true] - Specifies whether users can click on and manipulate the map.
     * @param {boolean} [opts.showControls=true] - Show controls for zoom and bearing.
     * @param {boolean} [opts.showPopups=true] - Show a popup with airspace information when a user clicks on the map.
     * @param {boolean} [opts.showSearch=false] - Render a search bar that allows users to query for a specific location.
     * @param {boolean} [opts.useLocation=true] - Attempt to center the map on a user location.
     * @param {boolean} [opts.createFlights=false] - Insert button in popups that allows users to create a flight using DNAS Basic Integration.
     * @param {boolean} [opts.suppressWarnings=false] - Suppress developer warnings.
     */
    constructor(config = {}, opts) {
        if (!this._supported()) {
            alert('Unable to display map. Your browser does not support Mapbox GL JS.')
            return false
        }

        // Class wide settings
        this.opts = {...this.defaults, ...opts }
        this.apiKey = _.get(config, 'airmap.api_key', null)
        this.accessToken = _.get(config, 'mapbox.access_token', null)
        this.map = null
        this.layers = utils.addRequiredLayers(this.opts.layers)
        this.activeTheme = this.opts.theme
        this.markers = []
        this.searchMarkerId = null
        this.markerLayerAdded = false
        this.filterUpdateInterval = null

        if (!this.apiKey) throw new BadConfigError('api_key')
        if (!this.accessToken) throw new BadConfigError('access_token')
        if (constants.supportedThemes.indexOf(this.activeTheme) < 0) throw new BadOptionError('theme')

        // Load styles early to prevent FOUC
        insertCss(fs.readFileSync(__dirname + '/styles.css', 'utf8'))
        loadCSS(constants.mapboxStyles)
        if (this.opts.showSearch) loadCSS(constants.mapboxGeocoderStyles)

        // Set up event emitter
        this._eventTypes = ['airspace.click']
        this._ev = new EventEmitter()
        this.fire = (type, data) => this._ev.emit(type, data)

        // Create the map
        window.mapboxgl = mapboxgl || {}
        mapboxgl.accessToken = this.accessToken
        this._addMap()
    }

    get defaults() {
        return this.constructor.defaults
    }

    get options() {
        return this.opts
    }

    /**
     * Check browser support for Mapbox GL.
     * @private
     */
    _supported() {
        return mapboxgl.supported()
    }

    /**
     * Initialize the Mapbox GL JS map and load airspace tiles.
     * @private
     */
    _addMap() {
        this.map = new mapboxgl.Map({
            container: this.opts.container,
            minZoom: constants.minZoom,
            maxZoom: constants.maxZoom,
            zoom: this.opts.zoom,
            center: [this.opts.center[1], this.opts.center[0]],
            pitch: this.opts.pitch,
            bearing: this.opts.bearing,
            hash: this.opts.hash,
            interactive: this.opts.interactive
        })

        // Add the airmap-active class to the container.
        if (document.getElementById(this.opts.container)) {
            document.getElementById(this.opts.container).className += ' airmap-active'
        }

        // Load map tiles
        this._requestTiles((err, res) => {
            if (err) {
                return console.error(err)
            }
            this.map.setStyle(res.body)
            this._addControls()
            this._bindEvents()
            this._updateFilters()
        })
    }

    /**
     * Request tiles
     * @private
     */
    _requestTiles(cb) {
        request.get(`${this.opts.tileServiceUrl}/${constants.staticLayers.join(',')}`)
            .set('X-API-Key', this.apiKey)
            .query({
                token: this.apiKey,
                theme: this.activeTheme
            })
            .end((err, res) => cb(err, res))
    }

    /**
     * Add map plugins based on provided options.
     * @private
     */
    _addControls() {
        if (this.opts.showControls) {
            this.map.addControl(new mapboxgl.NavigationControl(), 'top-right')
            this.map.addControl(new mapboxgl.GeolocateControl(), 'top-right')
        }

        if (this.opts.showSearch) this._addGeocoder()
    }

    /**
     * Add event listeners to the map.
     * @private
     */
    _bindEvents() {
        this.map.on('style.load', () => {
            this.setLayers(this.layers) // only show layers requested by the user
            this._addWatermark()
            if (this.opts.useLocation) this._geolocateUser()
        })

        this.map.on('click', this._sdkHandleClick.bind(this))
    }

    /**
     * Use geolocation API to automatically center on a user's location.
     * @private
     */
    _geolocateUser() {
        if (!'geolocation' in navigator) {
            return console.error('Geolocation not supported by browser.')
        }
        const options = {
            enableHighAccuracy: true,
            timeout: 4000,
            maximumAge: 0
        }
        const onSuccess = (position) => this.move(position.coords.latitude, position.coords.longitude, 12)
        const onError = (error) => {
            console.log('err', error)
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    return console.error('User denied the request for Geolocation.')
                case error.POSITION_UNAVAILABLE:
                    return console.error('Location information is unavailable.')
                case error.TIMEOUT:
                    return console.error('The request to get user location timed out.')
                default:
                    return console.error('An unknown error occurred.')
            }
        }
        navigator.geolocation.getCurrentPosition(p => onSuccess(p), e => onError(e), options)
    }

    /** @private */
    _watermarkSrc() {
        return this.activeTheme === 'dark' || this.activeTheme === 'satellite' ? constants.poweredByLogoWhite : constants.poweredByLogo
    }

    /** @private */
    _addWatermark() {
        const existingWatermark = document.querySelector('#airmapWatermark')
        if (!existingWatermark) {
            const bottomLeft = document.querySelector(`#${this.opts.container} .mapboxgl-ctrl-bottom-left`)
            let watermark = document.createElement('div')
            watermark.id = 'airmapWatermark'
            watermark.className = 'map-airmap-logo'
            watermark.innerHTML = `<img src="${this._watermarkSrc()}" class="logo" style="margin-left: 6px; margin-bottom: 2px;" width="70" />`
            bottomLeft.appendChild(watermark)
        }
    }

    /** @private */
    _addGeocoder() {
        load(constants.mapboxGeocoder, (err, script) => {
            if (err) {
                return console.error('Error loading Geocoder Plugin from Mapbox.')
            }
            const geocoder = new MapboxGeocoder({
                accessToken: this.accessToken,
                zoom: 16,
                flyTo: true,
                placeholder: 'Search'
            })
            this.map.addControl(geocoder, 'top-left')
            geocoder.on('result', (e) => {
                if (this.searchMarkerId) this.removeMarker(this.searchMarkerId)
                this.searchMarkerId = this.addMarker(e.result.geometry.coordinates[1], e.result.geometry.coordinates[0])
            })
            geocoder.on('error', e => console.error('Geocoder: ' + e))
        })
    }

    /**
     * Update the filters so that color coding for active & future TFRs is
     * updated at a regular interval.
     * @private
     */
    _updateFilters() {
        const interval = 5 * 60 * 1000 // 5 minutes
        this.filterUpdateInterval = setInterval(() => {
            const now = Date.now()
            this.map.setFilter('active-tfrs', [
                'any',
                [ 'all', ['<=', 'date_effective', now], ['>=', 'date_expire', now] ],
                [ 'all', ['<=', 'date_effective', now], ['!has', 'date_expire'] ]
            ])
            this.map.setFilter('future-tfrs', ['>=', 'date_effective', now])
        }, interval)
    }

    /**
     * Renders/re-renders markers stored in this.markers.
     * @private
     */
    _renderMarkers() {
        const markers = {
            type: 'FeatureCollection',
            features: this.markers
        }

        const markersSource = this.map.getSource('markers')
        if (!markersSource) {
            this.map.addSource('markers', {
                type: 'geojson',
                data: markers
            })
        } else {
            markersSource.setData(markers)
        }

        if (!this.markerLayerAdded) {
            this.map.addLayer({
                id: 'marker-{id}',
                type: 'symbol',
                source: 'markers',
                layout: {
                    'icon-image': 'marker'
                }
            })
            this.markerLayerAdded = true
        }
    }

    /**
     * Called whenever a user clicks on the map.
     * @private
     */
    _sdkHandleClick(data) {
        const map = data.target
        const properties = map.queryRenderedFeatures(data.point)
            .map(feat => feat.properties)
            .filter(p => {
                // filter to airspace features
                return (
                    p.type &&
                    (_.includes(constants.staticLayers, p.type.replace('layer_', '')) || p.type == 'tfrs')
                )
            })

        if (properties.length) {
            // fire click event with filtered airspace data
            this.fire('airspace.click', {
                ...data,
                type: 'airspace.click',
                airspace: properties
            })
        }

        // if any airspace features were clicked, build a popup if one hasn't been created
        if (this.opts.showPopups && (properties.length || this.opts.createFlights)) {
            let markup = this._buildPopupMarkup(properties, data.lngLat)
            let popups = document.getElementsByClassName('mapboxgl-popup-content')
            if (popups.length) {
                let markupElement = document.createElement('div')
                markupElement.innerHTML = markup
                popups[0].insertBefore(markupElement, popups[0].firstChild)
            } else {
                let tooltip = new mapboxgl.Popup({ closeOnClick: true })
                    .setLngLat(data.lngLat)
                    .setHTML(markup)
                tooltip.addTo(map)
            }
        }
    }

    /**
     * Sort through data returned from queryRenderedFeatures and pass to
     * templates for display in a popup.
     * @private
     */
    _buildPopupMarkup(layers, lngLat) {
        let html = ''
        const groupsByType = utils.formatPopupData(layers)
        for (var g in groupsByType) {
            var group = groupsByType[g]
            if (typeof constants.displayTypes[g] !== 'undefined') {
                const items = group.map(i => _.pick(i, ['url', 'name', 'icao', 'phone', 'size', 'date_effective', 'date_expire']))
                html += templates.popup({ group: g, items: items })
            }
        }
        if (this.opts.createFlights) {
            html += `
                <a href="${utils.getBasicIntegrationUrl(this.opts.webAppUrl, lngLat, this.apiKey)}" class="ui button tiny" id="addFlightBtn">
                    Add flight here
                </a>
            `
        }
        return html
    }


    /**
     * Set the visible layers on the map and hide all other layers.
     * @public
     * @param {Array} layers - List of layer names you want the map to display.
     * @returns {AirspaceMap} - `this`
     */
    setLayers(layers) {
        // add provided layers
        utils.addRequiredLayers(layers).forEach(layer => {
            if (this.getLayers().indexOf(layer) < 0) this.addLayer(layer)
        })
        // remove any layers that aren't provided
        constants.staticLayers.forEach(layer => {
            if (layers.indexOf(layer) < 0) this.removeLayer(layer)
        })
        return this
    }

    /**
     * Retrieve a list of currently active layers.
     * @public
     * @returns {Array} layers - List of visible layers.
     */
    getLayers() {
        return utils.removeRequiredLayers(this.layers)
    }

    /**
     * Show an airspace layer if it is not currently visible.
     * @public
     * @param {string} layer - Name of the layer to add.
     * @returns {AirspaceMap} - `this`
     */
    addLayer(layer) {
        if (!utils.isValidLayer(layer)) return false
        if (layer === 'tfrs') {
            this.map.setLayoutProperty('active-tfrs', 'visibility', 'visible')
            this.map.setLayoutProperty('future-tfrs', 'visibility', 'visible')
        } else {
            this.map.setLayoutProperty(layer, 'visibility', 'visible')
        }
        if (layer.indexOf('airports') > -1) this.map.setLayoutProperty(`${layer}_dnas`, 'visibility', 'visible')
        // add this layer's marker if it has one
        if (utils.hasMarker(layer)) {
            this.map.setLayoutProperty(`${layer}-marker`, 'visibility', 'visible')
            this.layers.push(`${layer}-marker`)
        }
        this.layers.push(layer)
        return this
    }

    /**
     * Hide an airspace layer if it is currently visible.
     * @public
     * @param {string} layer - Name of the layer to add.
     * @returns {AirspaceMap} - `this`
     */
    removeLayer(layer) {
        if (!utils.isValidLayer(layer)) return false
        if (layer === 'tfrs') {
            this.map.setLayoutProperty('active-tfrs', 'visibility', 'none')
            this.map.setLayoutProperty('future-tfrs', 'visibility', 'none')
        } else {
            this.map.setLayoutProperty(layer, 'visibility', 'none')
        }
        if (layer.indexOf('airports') > -1) this.map.setLayoutProperty(`${layer}_dnas`, 'visibility', 'none')
        // remove this layer's marker if it has one
        if (utils.hasMarker(layer)) {
            this.map.setLayoutProperty(`${layer}-marker`, 'visibility', 'none')
            _.remove(this.layers, l => l === `${layer}-marker`)
        }
        _.remove(this.layers, l => l === layer)
        return this
    }

    /**
     * Checks if the provided layer is currently active on the map.
     * @public
     * @param {string} layer - Name of the layer to check.
     * @returns {boolean}
     */
    hasLayer(layer) {
        return this.layers.indexOf(layer) > -1
    }

    /**
     * Moves the map to a new location.
     * @public
     * @param {number} latitude - Latitude of the location to move to.
     * @param {number} longitude - Longitude of the location to move to.
     * @param {string} [zoom] - Zoom level when centering on the new location.
     * @returns {AirspaceMap} - `this`
     */
    move(latitude, longitude, zoom) {
        this.flyTo({
            center: [longitude, latitude],
            zoom: zoom || this.getZoom()
        })
        return this
    }

    /**
     * Wraps Mapbox GL's Map.flyTo.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#flyTo|[docs]}
     * @public
     * @param {Object} [options] - Mapbox GL {@link https://www.mapbox.com/mapbox-gl-js/api/#flyTo|Map.flyTo options}.
     * @returns {AirspaceMap} - `this`
     */
    flyTo(...args) {
        this.map.flyTo(...args)
        return this
    }

    /**
     * Wraps Mapbox GL's Map.zoomTo.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#zoomTo|[docs]}
     * @public
     * @param {number} zoom - The zoom level to transition to.
     * @param {Object} [options] - Mapbox GL {@link https://www.mapbox.com/mapbox-gl-js/api/#AnimationOptions|AnimationOptions}.
     * @returns {AirspaceMap} - `this`
     */
    zoom(...args) {
        this.map.zoomTo(...args)
        return this
    }

    /**
     * Zoom in to the map by a specified amount.
     * @public
     * @param {number} delta - The amount to add to the current zoom level.
     * @returns {AirspaceMap} - `this`
     */
    zoomIn(delta) {
        const current = this.getZoom()
        this.zoom(current + delta)
        return this
    }

    /**
     * Zoom out of the map by a specified amount.
     * @public
     * @param {number} delta - The amount to subtract from the current zoom level.
     * @returns {AirspaceMap} - `this`
     */
    zoomOut(delta) {
        const current = this.getZoom()
        this.zoom(current - delta)
        return this
    }

    /**
     * Wraps Mapbox GL's Map.resize. Resizes the map according to the dimensions of its container element.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#resize|[docs]}
     * @public
     * @returns {AirspaceMap} - `this`
     */
    resize() {
        this.map.resize()
        return this
    }

    /**
     * Wraps Mapbox GL's Map.fitBounds.
     * Pans and zooms the map to contain its visible area within the specified geographical bounds.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#fitBounds|[docs]}
     * @public
     * @param {Array} bounds - Mapbox GL {@link https://www.mapbox.com/mapbox-gl-js/api/#LngLatBoundsLike|LngLatBoundsLike}.
     * @param {Object} [options] - Mapbox GL {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#fitBounds|fitBounds options}.
     * @returns {AirspaceMap} - `this`
     */
    fitBounds(bounds, options = null, eventData = null) {
        this.map.fitBounds(bounds, options, eventData)
        return this
    }

    /**
     * Wraps Mapbox GL's Map.getCenter. Returns the map's geographical centerpoint.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#getCenter|[docs]}
     * @public
     * @returns {Object} LngLat - Mapbox GL {@link https://www.mapbox.com/mapbox-gl-js/api/#LngLat|LngLat}.
     */
    getCenter() {
        return this.map.getCenter()
    }

    /**
     * Wraps Mapbox GL's Map.getZoom. Returns the map's current zoom level.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#getZoom|[docs]}
     * @public
     * @returns {number} zoom - Current zoom level.
     */
    getZoom() {
        return this.map.getZoom()
    }

    /**
     * Wraps Mapbox GL's Map.getSource. Returns the source with the specified ID in the map's style.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#getSource|[docs]}
     * @public
     * @param {string} id - The ID of the source to get.
     * @returns {Object} source - The style source with the specified ID, or undefined if the ID corresponds to no existing sources.
     */
    getSource(id) {
        return this.map.getSource(id)
    }

    /**
     * Wraps Mapbox GL's Map.addSource.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#addSource|[docs]}
     * @public
     * @param {string} id - The ID of the source to get.
     * @param {Object} source - The source object, conforming to the Mapbox Style Specification's {@link https://www.mapbox.com/mapbox-gl-style-spec/#sources|source definition}.
     */
    addSource(id, source) {
        return this.map.addSource(id, source)
    }

    /**
     * Wraps Mapbox GL's Map.addControl.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#addControl|[docs]}
     * @public
     * @param {Object} control - The {@link https://www.mapbox.com/mapbox-gl-js/api/#Control|Control} to add.
     * @returns {AirspaceMap} - `this`
     */
    addControl(control) {
        this.map.addControl(control)
        return this
    }

    /**
     * Wraps Mapbox GL's Map.removeControl.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#removeControl|[docs]}
     * @public
     * @param {Object} control - The {@link https://www.mapbox.com/mapbox-gl-js/api/#Control|Control} to remove.
     * @returns {AirspaceMap} - `this`
     */
     removeControl(control) {
        this.map.removeControl(control)
        return this
     }

    /**
     * Returns the theme that is currently active.
     * @public
     * @returns {string} theme - Theme that is currently displayed on the map.
     */
    getTheme() {
        return this.activeTheme
    }

    /**
     * Updates the current theme by requesting new map tiles.
     * @public
     * @param {string} theme - Theme to display on the map.
     * @throws {BadOptionError} - Will throw an error if the provided theme is invalid.
     */
    theme(theme) {
        if (this.activeTheme === theme) return
        if (constants.supportedThemes.indexOf(theme) < 0) throw new BadOptionError('theme')

        const oldTheme = this.activeTheme
        this.activeTheme = theme

        this._requestTiles((err, res) => {
            if (err) {
                this.activeTheme = oldTheme
                return console.error(err)
            }
            this.map.setStyle(res.body)
            if (document.querySelector('#airmapWatermark > .logo')) {
                document.querySelector('#airmapWatermark > .logo').src = this._watermarkSrc()
            }
        })
    }

    /**
     * Wraps Mapbox GL's Map.getContainer.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#getContainer|[docs]}
     * @public
     * @returns {HTMLElement} - The map's container.
     */
     getContainer() {
        return this.map.getContainer()
     }

    /**
     * Drops a marker at the provided location.
     * @public
     * @param {number} latitude - Latitude of the location.
     * @param {number} longitude - Longitude of the location.
     * @param {Object} [properties] - Additional properties to add to the marker feature.
     * @returns {string} id - An ID referencing the marker.
     */
    addMarker(latitude, longitude, properties = {}) {
        const id = uuid.v4()
        const marker = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [longitude, latitude]
            },
            properties: {
                ...properties,
                id: id
            }
        }
        this.markers.push(marker)
        this._renderMarkers()
        return id
    }

    /**
     * Drops a marker at the provided location.
     * @public
     * @param {string} id - ID of the marker to remove.
     * @returns {AirspaceMap} - `this`
     */
    removeMarker(id) {
        _.remove(this.markers, m => m.properties.id === id)
        this._renderMarkers()
        return this
    }

    /**
     * Wraps Mapbox GL's Map.remove. Destroys the map and its underlying resources.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Map#remove|[docs]}
     * @public
     */
    remove() {
        this.map.remove()
        // Remove the airmap-active class from the container
        if (document.getElementById(this.opts.container)) {
            document.getElementById(this.opts.container).className.replace(/(\s|^)airmap-active(\s|$)/, ' ')
        }
        clearInterval(this.filterUpdateInterval)
        this.filterUpdateInterval = null
        this.layers = this.defaults.layers
        this.markers = []
        this.searchMarkerId = null
        this.markerLayerAdded = false
        this.map = null
    }

    /**
     * Returns the underlying mapboxgl.Map instance, providing access to any
     * Mapbox GL methods not wrapped in this SDK.
     * @public
     */
    get mapboxgl() {
        if (window.console && window.console.warn && !this.opts.suppressWarnings) {
            console.warn('AirMap: Methods you call using the mapboxgl getter are subject to change based on minor ' +
                         'version updates in Mapbox GL JS. If you need to use this feature, it is recommended that ' +
                         'you lock your SDK to a specific version.')
        }
        return this.map
    }

    /**
     * Wraps Mapbox GL's method to add an event listener.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Evented#on|[docs]}
     * @param {string} type - The event type to add a listener for.
     * @param {Function} listener - The function to be called when the event is fired.
     * @public
     */
    on(type, listener) {
        if (this._eventTypes.indexOf(type) > -1) {
            // airspace-specific events
            this._ev.on(type, listener)
        } else {
            // other mapbox events
            this.map.on(type, listener)
        }
    }

    /**
     * Wraps Mapbox GL's method to remove an event listener.
     * {@link https://www.mapbox.com/mapbox-gl-js/api/#Evented#off|[docs]}
     * @param {string} type - The event type to remove listeners for.
     * @param {Function} listener - The listener function to remove.
     * @public
     */
    off(type, listener) {
        if (this._eventTypes.indexOf(type) > -1) {
            // airspace-specific events
            this._ev.removeListener(type, listener)
        } else {
            // other mapbox events
            this.map.off(type, listener)
        }
    }

}

AirspaceMap.defaults = {
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
    webAppUrl: 'https://app.airmap.io',
    suppressWarnings: false
}


module.exports = exports = AirspaceMap
