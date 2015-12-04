pm2-logrotate-imp
=================

An opinionated and hopefully improved log rotator for pm2, inspired on the original pm2-logrotate module.

This log rotator starts as a spin-off of the official [pm2-logrotate module](https://github.com/pm2-hive/pm2-logrotate)
and will diverge to support more configuration options. All credits for the original rotator go to the pm2-logrotate
[authors and contributors](https://github.com/pm2-hive/pm2-logrotate/graphs/contributors).

## Installation

Tested on node-5.10.x, requires pm2.

```sh
  pm2 install pm2-logrotate-imp
```

## Improved rotation

<b>Lower memory footprint, less CPU usage and quicker rotations</b>

This rotator can use pm2's reloadLogs to handle log files without copying content. Use "rotation_mode" configuration property to enable it.

Notice that due to [this issue](https://github.com/Unitech/pm2/issues/800), pm2 does not rotate its own logs. As a workaround, pm2's own
logs are rotate using the "copytruncate" method.

## Configuration

There are several values you can change in this module:

- "interval_unit": A unit of time in the [formats supported by Moment.js](http://momentjs.com/docs/#/manipulating/add/). Default is 'd' (days).
- "interval": An amount of time expressed in "interval_unit" units ather which files will be rotated. Default is 7.
- "max_size": A maximum file size that will cause forced rotation of the files. Default is "10M".
- "retain": Number of rotated files to retain, or 'none' to never delete files. Defaults to 'none'.
- "date_mode": Date mode used in rotated file names. Valid values are 'utc' for UTC time or 'system' for local system time. Defaults to 'system'.
- "date_format": A string in the [formats supported by Moment.js](http://momentjs.com/docs/#/displaying/format/). Default is 'YYYY-MM-DD_HH-mm-ss'
- "rotation_mode": Changes the way log files are rotated, "copytruncate" or "reload". "copytruncate" creates a new file and copies content from the original log file.
Once completed, the original log file is truncated. "reload" renames the original log file, then asks pm2 to restart logging. Since this does not involve
copying data, it is faster. Default is "reload".


After having installed the module:

```sh
  pm2 set pm2-logrotate-imp:<param> <value>
```

Examples:

```sh
  pm2 set pm2-logrotate-imp:max_size 1M
  pm2 set pm2-logrotate-imp:interval_unit months
```

Sets max file size for starting rotation to 1 MB and time units to months.

To get the current configuration, use:

```sh
  pm2 get pm2-logrotate-imp:max_size
```
