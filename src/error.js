/**
 * Error caused when config is malformatted.
 * @private
 */
class BadConfigError extends Error {
    constructor(item) {
        super(`AirMap SDK - unable to initialize due to missing configuration item: ${item}`)
    }
}

/**
 * Error caused when option is malformatted.
 * @private
 */
class BadOptionError extends Error {
    constructor(item) {
        super(`AirMap SDK - the value provided for the following option is invalid: ${item}`)
    }
}


module.exports = { BadConfigError, BadOptionError }
