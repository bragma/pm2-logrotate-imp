var fs = require('fs');
var path = require('path');
var pmx = require('pmx');
var pm2 = require('pm2');
var moment = require('moment');
var Rolex = require('rolex');
var filesizeParser = require('filesize-parser');

// Module configuration
var conf = pmx.initModule({

	widget: {
		type: 'generic',
		logo: 'http://web.townsendsecurity.com/Portals/15891/images/logging.png',
		theme: ['#111111', '#1B2228', '#31C2F1', '#807C7C'],
		el: {
			probes: false,
			actions: false
		},
		block: {
			issues: false,
			cpu: false,
			mem: false,
			actions: true
		}
	}
});

// Worker loop delay. Logs will be checked every WORKER_INTERVAL milliseconds
var WORKER_INTERVAL = moment.duration(50, 'seconds').asMilliseconds();

// All config properties are strings

// Maximum file size. If the file is found to be larger than this, it will be truncated
// Default to 10MB
var SIZE_LIMIT = filesizeParser('10MB'); 
try {
	var parsed_size_limit =  filesizeParser(conf.max_size);
	if (parsed_size_limit > 0) {
		SIZE_LIMIT = parsed_size_limit;
	}
}
catch(err) {
}

// Unit of time for the specified rotation interval. User Moment.js time units formats
// Defaults to 'days'
var INTERVAL_UNIT = conf.interval_unit || 'days';

// Interval in INTERVAL_UNIT units
// Default to 1
var INTERVAL = parseInt(conf.interval) || 1;

// How many files to retain or 'none'
// Defaults to 'none' 
var RETAIN = isNaN(parseInt(conf.retain)) ? undefined : parseInt(conf.retain);

log_config();

// Format for the date in retained file names
var DATE_FORMAT = 'YYYY-MM-DD-HH-mm';

var BEGIN = moment().startOf(INTERVAL_UNIT);
var gl_file_list = [];


function log_config() {
	console.log('SIZE_LIMIT', SIZE_LIMIT);
	console.log('INTERVAL_UNIT', INTERVAL_UNIT);
	console.log('INTERVAL', INTERVAL);
	console.log('RETAIN', RETAIN);
}

function delete_old(file) {
	var fileBaseName = file.substr(0, file.length - 4) + '__';
	var readPath = path.join(path.dirname(fileBaseName), "/");

	fs.readdir(readPath, function (err, files) {
		var rotated_files = []
		for (var i = 0, len = files.length; i < len; i++) {
			if (fileBaseName === ((readPath + files[i]).substr(0, fileBaseName.length))) {
				rotated_files.push(readPath + files[i])
			}
		}
		rotated_files.sort().reverse();

		for (var i = rotated_files.length - 1; i >= 0; i--) {
			if (RETAIN > i) { break; }
			fs.unlink(rotated_files[i]);
			console.log('"' + rotated_files[i] + '" has been deleted');
		};
	});
}

function proceed(file) {
	var file_name_date = moment();
	var final_name = file.substr(0, file.length - 4) + '__'
		+ file_name_date.format(DATE_FORMAT) + '.log';

	var readStream = fs.createReadStream(file);
	var writeStream = fs.createWriteStream(final_name, { 'flags': 'a' });
	readStream.pipe(writeStream);
	readStream.on('end', function () {
		fs.truncateSync(file, 0);
		console.log('"' + final_name + '" has been created');

		if (RETAIN !== undefined) {
			delete_old(file);
		}
	});
}

function proceed_file(file, force) {
	if (!fs.existsSync(file))
		return;

	gl_file_list.push(file);

	var size = fs.statSync(file).size;

	if (size > 0 && (size >= SIZE_LIMIT || force)) {
		proceed(file);
	}
}

function proceed_app(app, force) {
	// Get error and out file
	var out_file = app.pm2_env.pm_out_log_path;
	var err_file = app.pm2_env.pm_err_log_path;

	proceed_file(out_file, force);
	proceed_file(err_file, force);
}

function is_it_time_yet() {
	var NOW = moment().startOf(INTERVAL_UNIT);
	
	if (NOW.diff(BEGIN, INTERVAL_UNIT) >= INTERVAL) {
		BEGIN = NOW;
		return true;
	}
	else {
		return false;
	}
}

// Connect to local PM2
pm2.connect(function (err) {
	if (err) return console.error(err.stack || err);

	function worker() {
		// Get process list managed by PM2
		pm2.list(function (err, apps) {
			if (err) return console.error(err.stack || err);

			proceed_file(process.env.HOME + '/.pm2/pm2.log', false);
			proceed_file(process.env.HOME + '/.pm2/agent.log', false);

			if (is_it_time_yet())
				apps.forEach(function (app) { proceed_app(app, true) });
			else
				apps.forEach(function (app) { proceed_app(app, false) });
		});
	};

	setTimeout(function () {
		setInterval(function () {
			gl_file_list = [];
			worker();
		}, WORKER_INTERVAL);
	}, (WORKER_INTERVAL - (Date.now() % WORKER_INTERVAL)));
});

pmx.action('list files', function (reply) {
	return reply(gl_file_list);
});
