'use strict';

var util = require('util');
var filesizeParser = require('filesize-parser');
var moment = require('moment');

module.exports = {
	parse: parseConfig,
	log: logConfig
};


// All config properties are strings
var SIZE_LIMIT_DEFAULT = '10MB';
var INTERVAL_UNIT_DEFAULT = 'day';
var INTERVAL_DEFAULT = '1';
var RETAIN_DEFAULT = 'none';
var MODE_DEFAULT = 'system';

function parseMaxSize(max_size) {
	var parsed_size_limit = filesizeParser(max_size);
	if (isNaN(parsed_size_limit) || parsed_size_limit <= 0) {
		throw new Error(util.format("Invalid configuration value 'max_size' (%s)", max_size));
	}

	return parsed_size_limit;
}

function parseIntervalUnit(interval_unit) {
	var parsed_interval_unit = moment.normalizeUnits(interval_unit);
	if (!parsed_interval_unit) {
		throw new Error(util.format("Invalid configuration value 'interval_unit' (%s)", interval_unit));
	}

	return parsed_interval_unit;
}

function parseInterval(interval) {
	var parsed_interval = parseInt(interval);
	if (isNaN(parsed_interval) && parsed_interval <= 0) {
		throw new Error(util.format("Invalid configuration value 'interval' (%s)", interval));
	}

	return parsed_interval;
}

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

function parseMode(mode) {
	if (mode !== 'system' && mode !== 'utc') {
		throw new Error(util.format("Invalid configuration value 'mode' (%s)", mode));
	}
	
	return mode;
}

function parseConfig(conf) {

	var parsedConf = {
		SIZE_LIMIT: parseMaxSize(SIZE_LIMIT_DEFAULT),
		INTERVAL_UNIT: parseIntervalUnit(INTERVAL_UNIT_DEFAULT),
		INTERVAL: parseInterval(INTERVAL_DEFAULT),
		RETAIN: parseRetain(RETAIN_DEFAULT),
		MODE: parseMode(MODE_DEFAULT)
	};

	function log_using_default(err, value) {
		console.error(util.format("%s, using default (%s)", err.message, parsedConf.SIZE_LIMIT));
	}
	
	// Maximum file size. If the file is found to be larger than this, it will be truncated
	
	if ('max_size' in conf) {
		try {
			parsedConf.SIZE_LIMIT = parseMaxSize(conf.max_size);
		}
		catch (err) {
			log_using_default(err, parsedConf.SIZE_LIMIT);
		}
	}
			
	
	// Unit of time for the specified rotation interval. User Moment.js time units formats
	if ('interval_unit' in conf) {
		try {
			parsedConf.INTERVAL_UNIT = parseIntervalUnit(conf.interval_unit);
		}
		catch (err) {
			log_using_default(err, parsedConf.INTERVAL_UNIT);
		}
	}
	
	// Interval in INTERVAL_UNIT units
	if ('interval' in conf) {
		try {
			parsedConf.INTERVAL = parseInterval(conf.interval);
		}
		catch (err) {
			log_using_default(err, parsedConf.INTERVAL);
		}
	}
			
	// How many files to retain or 'none'
	if ('retain' in conf) {
		try {
			parsedConf.RETAIN = parseRetain(conf.retain);
		}
		catch (err) {
			log_using_default(err, parsedConf.RETAIN);
		}
	}
	
	if ('mode' in conf) {
		try {
			parsedConf.MODE = parseMode(conf.mode);
		}
		catch (err) {
			log_using_default(err, parsedConf.MODE);
		}
	}

	return parsedConf;
}

function logConfig(conf) {
	console.log('SIZE_LIMIT', conf.SIZE_LIMIT);
	console.log('INTERVAL_UNIT', conf.INTERVAL_UNIT);
	console.log('INTERVAL', conf.INTERVAL);
	console.log('RETAIN', conf.RETAIN);
	console.log('MODE', conf.MODE)
}
