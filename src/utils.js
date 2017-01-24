const constants = require('./constants')
const moment = require('moment')
const _ = require('lodash')

exports.hasMarker = (layer) => constants.staticLayers.indexOf(`${layer}-marker`) > -1

exports.addRequiredLayers = (layers) => {
    let arr = layers
    layers.forEach(layer => {
        if (exports.hasMarker(layer)) arr.push(`${layer}-marker`)
    })
    return arr
}

exports.removeRequiredLayers = (layers) => {
    return layers.filter(l => l.indexOf('-marker') < 0)
}

exports.isValidLayer = (layer) => {
    const isValid = constants.staticLayers.indexOf(layer) > -1
    if (!isValid) console.error(`Airspace layer does not exist: ${layer}`)
    return isValid
}

exports.getBasicIntegrationUrl = (baseUrl, lngLat, apiKey, cb = encodeURIComponent(window.location.href)) => {
    return `${baseUrl}/create-flight/index.html?key=${apiKey}&lat=${lngLat.lat}&lng=${lngLat.lng}&cb=${cb}`
}

exports.formatPopupData = (properties) => {
    const formatted = properties.map(p => {
        let f = { ...p }
        if (_.has(p, 'size')) {
            f.size = f.size != 'null' ? Math.round(f.size * 10) / 10 + ' Acres' : 'Unavailable'
        }
        if (_.has(p, 'date_effective')) {
            f.date_effective = moment(f.date_effective).format('MMMM Do YYYY, h:mm a')
            if (_.has(p, 'date_expire') && moment(f.date_expire).format('YYYY') != 9999) {
                f.date_expire = moment(f.date_expire).format('MMMM Do YYYY, h:mm a')
            } else if (['wildfires', 'fires', 'emergencies'].indexOf(p.type) < 0) {
                f.date_expire = 'Permanent'
            }
        }
        if (['wildfires', 'fires', 'emergencies'].indexOf(p.type) > -1) _.unset(f, ['name'])
        return f
    })
    return _.groupBy(formatted, i => i.type)
}
