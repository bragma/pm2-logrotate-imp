var Promise = require('bluebird');
var moment = require('moment');
var Rolex = require('rolex');

var path = require('path');
var pmx = require('pmx');
var pm2 = require('pm2');
var pm2cst = require('pm2/constants');
var util = require('util');

var fs = Promise.promisifyAll(require('fs'));
var pm2connectAsync = Promise.promisify(pm2.connect);
var pm2listAsync = Promise.promisify(pm2.list);
var pm2reloadLogsAsync = Promise.promisify(pm2.reloadLogs);

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


function retainOrDeleteFiles(file, retain) {
	var fileBaseName = file.substr(0, file.length - 4) + '__';
	var readPath = path.join(path.dirname(fileBaseName), "/");

	return fs.readdirAsync(readPath)
		.then(function(files) {
			// Filter in only old rotated files
			// Sort them by name - This may be totally incorrect if the date is not sortable
			// Reverse the sorting order
			var rotated_files = files.filter(function(file) {
				return fileBaseName === (readPath + file).substr(0, fileBaseName.length);
			}).sort().reverse();

			// Retain the specified amount of files
			// Keep in the array the files to be deleted
			var to_delete = rotated_files.splice(retain);

			// Delete all files
			return Promise.map(to_delete, function(file) {
				file = readPath + file;
				return fs.unlinkAsync(file)
					.then(function() {
						console.log('"' + file + '" has been deleted');
					})
					.catch(function(err) {
						console.error(err.stack || err);
					});
			});
		})
		.catch(function(err) {
			console.error(err.stack || err);
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

function processFile(file, force, conf) {
	var file_name_date = conf.date_mode === 'system' ? moment() : moment.utc();
	var final_name = file.substr(0, file.length - 4) + '__'
		+ file_name_date.format(conf.date_format) + '.log';

	// Rename the file or
	// Copy the file content and truncate
	return (conf.rotation_mode === 'reload'
		? fs.renameAsync(file, final_name)
		: promisePipe(
			fs.createReadStream(file),
			fs.createWriteStream(final_name, { 'flags': 'a' })
		).then(function() {
			return fs.truncateAsync(file, 0);
		})
	)
		.then(function() {
			console.log('"' + final_name + '" has been created (' + (force ? 'time' : 'size') + ' exceeded)');
		})
		.catch(function(err) {
			console.error(err.stack || err);
		})
		.finally(function() {
			// Either we failed or succeded, check if rotated files need to be deleted
			if (conf.retain !== undefined) {
				return retainOrDeleteFiles(file, conf.retain);
			}
		});

}

function checkAndRotate(file, force, conf) {

	return fs.statAsync(file)
		.then(function(stat) {
			if (gl_file_list.indexOf(file) === -1) {
				gl_file_list.push(file);
				if (force || stat.size >= conf.max_size) {
					return processFile(file, force, conf);
				}
			}
		})
		.catch(function(err) {
			// We can ignore missing files here
			if (err.code !== "ENOENT") {
				console.error(err.stack || err);
			}
		});
}

function checkAndRotateAppfiles(app, force, conf) {

	var files = [];

	if (app.pm2_env.pm_out_log_path) {
		files.push(path.normalize(app.pm2_env.pm_out_log_path));
	}

	if (app.pm2_env.pm_err_log_path) {
		files.push(path.normalize(app.pm2_env.pm_err_log_path));
	}

	if (app.pm2_env.pm_log_path) {
		files.push(path.normalize(app.pm2_env.pm_log_path));
	}

	return Promise.map(files.filter(function(item, pos, self) {
		return self.indexOf(item) == pos;
	}), function(file) {
		return checkAndRotate(file, force, conf);
	});
}

function is_it_time_yet(conf) {
	var NOW = moment().startOf(conf.interval_unit);

	if (NOW.diff(BEGIN, conf.interval_unit) >= conf.interval) {
		BEGIN = NOW;
		return true;
	}
	else {
		return false;
	}
}

// Connect to local PM2
pm2connectAsync()
	.then(function() {

		function worker() {
			// Get process list managed by PM2
			pm2listAsync()
				.then(function(apps) {
					var force = is_it_time_yet(currentConfig);
					return Promise.map(apps, function(app) {
						return checkAndRotateAppfiles(app, force, currentConfig);
					})
						.finally(function() {

							// HACK: Since pm2 does not reload its own logs, we have to fallback
							// to copytruncate method.
							// See: https://github.com/Unitech/pm2/issues/800

							var conf = util._extend({}, currentConfig);
							conf.rotation_mode = "copytruncate";

							return Promise.join(
								checkAndRotate(pm2cst.PM2_LOG_FILE_PATH, false, conf),
								checkAndRotate(pm2cst.INTERACTOR_LOG_FILE_PATH, false, conf)
							);
						})
						.finally(function() {
							if (currentConfig.rotation_mode === 'reload') {
								return pm2reloadLogsAsync();
							}
						});
				})
				.catch(function(err) {
					console.error(err.stack || err);
				});
		}

		setTimeout(function() {
			setInterval(function() {
				gl_file_list = [];
				worker();
			}, WORKER_INTERVAL);
		}, (WORKER_INTERVAL - (Date.now() % WORKER_INTERVAL)));


	})
	.catch(function(err) {
		console.error(err.stack || err);
	});

// Return log files when keymetrix asks the list
pmx.action('list files', function(reply) {
	return reply(gl_file_list);
});
