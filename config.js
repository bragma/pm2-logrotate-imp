'use strict';

var util = require('util');
var filesizeParser = require('filesize-parser');
var moment = require('moment');
var DEFAULT_CONFIG = require('./package.json').config;


module.exports = {
	parse: parseConfig
};


// Maximum file size. If the file is found to be larger than this, it will be truncated
function parseMaxSize(max_size) {
	var parsed_size_limit = filesizeParser(max_size);
	if (isNaN(parsed_size_limit) || parsed_size_limit <= 0) {
		throw new Error(util.format("Invalid configuration value 'max_size' (%s)", max_size));
	}

	return parsed_size_limit;
}

// Unit of time for the specified rotation interval. User Moment.js time units formats
function parseIntervalUnit(interval_unit) {
	var parsed_interval_unit = moment.normalizeUnits(interval_unit);
	if (!parsed_interval_unit) {
		throw new Error(util.format("Invalid configuration value 'interval_unit' (%s)", interval_unit));
	}

	return parsed_interval_unit;
}

// Interval in INTERVAL_UNIT units
function parseInterval(interval) {
	var parsed_interval = parseInt(interval);
	if (isNaN(parsed_interval) && parsed_interval <= 0) {
		throw new Error(util.format("Invalid configuration value 'interval' (%s)", interval));
	}

	return parsed_interval;
}

// How many files to retain or 'none'
function parseRetain(retain) {
	if (retain === 'none') {
		return undefined;
	}

	var parsed_retain = parseInt(retain);
	if (isNaN(parsed_retain) || parsed_retain < 0) {
		throw new Error(util.format("Invalid configuration value 'retain' (%s)", retain));
	}
	
	return parsed_retain;
}

// Date mode, 'utc' or 'system'
function parseMode(mode) {
	if (mode !== 'system' && mode !== 'utc') {
		throw new Error(util.format("Invalid configuration value 'mode' (%s)", mode));
	}
	
	return mode;
}

// Date format string in Moment.js format
function parseDateFormat(date_format) {
	if (typeof date_format !== 'string' || date_format.length === 0) {
		throw new Error(util.format("Invalid configuration value 'date_format' (%s)", date_format));
	}
	
	return date_format;
}


function parseConfig(conf) {

	var parsedConf = {};
	
	var property_parsers = {
		'max_size': parseMaxSize,
		'interval_unit': parseIntervalUnit,
		'interval': parseInterval,
		'retain': parseRetain,
		'mode': parseMode,
		'date_format': parseDateFormat
	};
	
	Object.keys(property_parsers).forEach(function(prop) {
		
		parsedConf[prop] = property_parsers[prop](DEFAULT_CONFIG[prop]);
		
		if (prop in conf) {
			try {
				parsedConf[prop] = property_parsers[prop](conf[prop]);
			}
			catch (err) {
				console.error(util.format("%s, using default (%s)", err.message, conf[prop]));
			}
		}
	});

	return parsedConf;
}
