'use strict';

var util = require('util');
var filesizeParser = require('filesize-parser');
var moment = require('moment');
var DEFAULT_CONFIG = require('./package.json').config;


module.exports = {
	parse: parseConfig
};


function CreateError(prop, value) {
	return new Error(util.format("Invalid configuration value '%s' (%s)", prop, value))
}

// Maximum file size. If the file is found to be larger than this, it will be truncated
function parseMaxSize(prop, max_size) {
	var parsed_size_limit = filesizeParser(max_size);
	if (isNaN(parsed_size_limit) || parsed_size_limit <= 0) {
		throw CreateError(prop, max_size);
	}

	return parsed_size_limit;
}

// Unit of time for the specified rotation interval. User Moment.js time units formats
function parseIntervalUnit(prop, interval_unit) {
	var parsed_interval_unit = moment.normalizeUnits(interval_unit);
	if (!parsed_interval_unit) {
		throw CreateError(prop, interval_unit);
	}

	return parsed_interval_unit;
}

// Interval in INTERVAL_UNIT units
function parseInterval(prop, interval) {
	var parsed_interval = parseInt(interval);
	if (isNaN(parsed_interval) && parsed_interval <= 0) {
		throw CreateError(prop, interval);
	}

	return parsed_interval;
}


// How many files to retain or 'none'
function parseRetain(prop, retain) {
	if (retain === 'none') {
		return undefined;
	}

	var parsed_retain = parseInt(retain);
	if (isNaN(parsed_retain) || parsed_retain < 0) {
		throw CreateError(prop, retain);
	}
	
	return parsed_retain;
}

// Date mode, 'utc' or 'system'
function parseDateMode(prop, date_mode) {
	if (date_mode !== 'system' && date_mode !== 'utc') {
		throw CreateError(prop, date_mode);
	}
	
	return date_mode;
}

// Date format string in Moment.js format
function parseDateFormat(prop, date_format) {
	if (typeof date_format !== 'string' || date_format.length === 0) {
		throw CreateError(prop, date_format);
	}
	
	return date_format;
}

function parseRotationMode(prop, rotation_mode) {
	if (rotation_mode !== 'copytruncate' && rotation_mode !== 'reload') {
		throw CreateError(prop, rotation_mode);
	}
	
	return rotation_mode;
}


function parseConfig(conf) {

	var parsedConf = {};
	
	var property_parsers = {
		'max_size': parseMaxSize,
		'interval_unit': parseIntervalUnit,
		'interval': parseInterval,
		'retain': parseRetain,
		'date_mode': parseDateMode,
		'date_format': parseDateFormat,
		'rotation_mode': parseRotationMode
	};
	
	Object.keys(property_parsers).forEach(function(prop) {
		
		parsedConf[prop] = property_parsers[prop](prop, DEFAULT_CONFIG[prop]);
		
		if (prop in conf) {
			try {
				parsedConf[prop] = property_parsers[prop](prop, conf[prop]);
			}
			catch (err) {
				console.error(util.format("%s, using default (%s)", err.message, parsedConf[prop]));
			}
		}
	});

	return parsedConf;
}
