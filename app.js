var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
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

var BEGIN = moment().startOf(currentConfig.interval_unit);
var gl_file_list = [];

function delete_old(file, retain) {
	var fileBaseName = file.substr(0, file.length - 4) + '__';
	var readPath = path.join(path.dirname(fileBaseName), "/");

	return fs.readdirAsync(readPath)
		.then(function(files) {
			var rotated_files = files.filter(function(file) {
				return fileBaseName === (readPath + file).substr(0, fileBaseName.length); 
			}).sort().reverse();

			rotated_files.splice(retain);

			return Promise.all(rotated_files, function(file) {
				return fs.unlinkAsync(file)
					.then(function() {
						console.log('"' + file + '" has been deleted');
					});
			});		
		});
}


function promisePipe(source, sink) {
	var resolve, reject; 
	return new Promise(function(resolve_, reject_) { 
		resolve = resolve_; 
		reject = reject_; 
		source 
			.on("end", resolve) 
			.on("error", reject) 
			.pipe(sink) 
			.on("error", reject); 
		}).finally(function() { 
			source.removeListener("end", resolve); 
			source.removeListener("error", reject); 
			sink.removeListener("error", reject); 
		}); 
}

function proceed(file) {
	var file_name_date = currentConfig.date_mode === 'system' ? moment() : moment.utc();
	var final_name = file.substr(0, file.length - 4) + '__'
		+ file_name_date.format(currentConfig.date_format) + '.log';

	var rotateOp;
	if (currentConfig.rotation_mode === 'reopen') {
		rotateOp = fs.renameAsync(file, final_name);
	} else {
		rotateOp = promisePipe(
				fs.createReadStream(file),
				fs.createWriteStream(final_name, { 'flags': 'a' }))
			.then(function() {
				return fs.truncateAsync(file, 0);
			});
	}
	
	return rotateOp
		.then(function() {
			console.log('"' + final_name + '" has been created');

			if (currentConfig.retain !== undefined) {
				return delete_old(file, currentConfig.retain);
			}
			
			return Promise.resolve();
		});
}

function proceed_file(file, force) {
	
	return fs.existsAsync(file)
		.then(function(exists) {
			if (!exists) {
				return Promise.resolve(false);
			}
				
			gl_file_list.push(file);
			
			if (force) {
				return proceed(file)
					.return(true);
			}
			
			return fs.statAsync(file)
				.get('size')
				.then(function(size) {
					if (size < currentConfig.max_size) {
						return Promise.resolve(false);
					}
					
					return proceed(file)
						.return(true);
				});
		});
}

function proceed_app(app, force) {
	// Get error and out file
	var out_file = app.pm2_env.pm_out_log_path;
	var err_file = app.pm2_env.pm_err_log_path;

	return Promise.join(
		proceed_file(out_file, force),
		proceed_file(err_file, force)
	);
}

function is_it_time_yet() {
	var NOW = moment().startOf(currentConfig.interval_unit);

	if (NOW.diff(BEGIN, currentConfig.interval_unit) >= currentConfig.interval) {
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
			if (err) {
				return console.error(err.stack || err);
			}

			var force = is_it_time_yet();
			
			Promise.map(apps, function (app) {
				return proceed_app(app, force);
			})
			.then(function() {

				return Promise.join(
					proceed_file(process.env.HOME + '/.pm2/pm2.log', false),
					proceed_file(process.env.HOME + '/.pm2/agent.log', false)
				);
			})
			.then(function() {
				if (currentConfig.rotation_mode === 'reopen') {
					pm2.reloadLogs();
				}
			})
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
