var fs = require('fs');
var path = require('path');
var pmx = require('pmx');
var pm2 = require('pm2');
var moment = require('moment');
var Rolex = require('rolex');

var Config = require('./config');

// Module configuration
var moduleConfig = pmx.initModule({

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

var currentConfig = Config.parse(moduleConfig);

// Format for the date in retained file names
var DATE_FORMAT = 'YYYY-MM-DD-HH-mm';

var BEGIN = moment().startOf(currentConfig.INTERVAL_UNIT);
var gl_file_list = [];

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
			if (currentConfig.RETAIN > i) { break; }
			fs.unlink(rotated_files[i]);
			console.log('"' + rotated_files[i] + '" has been deleted');
		};
	});
}

function proceed(file) {
	var file_name_date = currentConfig.MODE === 'system' ? moment() : moment.utc();
	
	var final_name = file.substr(0, file.length - 4) + '__'
		+ file_name_date.format(DATE_FORMAT) + '.log';

	var readStream = fs.createReadStream(file);
	var writeStream = fs.createWriteStream(final_name, { 'flags': 'a' });
	readStream.pipe(writeStream);
	readStream.on('end', function () {
		fs.truncateSync(file, 0);
		console.log('"' + final_name + '" has been created');

		if (currentConfig.RETAIN) {
			delete_old(file);
		}
	});
}

function proceed_file(file, force) {
	if (!fs.existsSync(file))
		return;

	gl_file_list.push(file);

	var size = fs.statSync(file).size;

	if (size > 0 && (size >= currentConfig.SIZE_LIMIT || force)) {
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
	var NOW = moment().startOf(currentConfig.INTERVAL_UNIT);

	if (NOW.diff(BEGIN, currentConfig.INTERVAL_UNIT) >= currentConfig.INTERVAL) {
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

			var force = is_it_time_yet();
			apps.forEach(function (app) { proceed_app(app, force) });
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
