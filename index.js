'use strict';

/**
 * Module dependencies.
 **/
var _ 			= require('lodash'),
	co	= require('co'),
	fs 			= require('fs'),
	async 		= require('async'),
	mongoose 	= require('mongoose'),
	chalk 		= require('chalk'),
	path 		= require('path'),
	spawn 		= require('child_process').spawn;

mongoose.Promise = global.Promise;

function Seeder() {
	this.connected = false;
}

Seeder.prototype.connect = function(db, cb) {
	var _this = this;
	this.db = db;
	mongoose.connect(db, function(err) {
		// Log Error
		if (err) {
			console.error(chalk.red('Could not connect to MongoDB!'));
			console.log(err);
		} else {
			_this.connected = true;
			console.log(chalk.green('Successfully initialized mongoose-seed'));
			cb();
		}
	});
};

Seeder.prototype.start = function(path, models, dump) {
	var _this = this;

	if (dump && typeof(dump) === 'boolean' && dump === true) {
		this.dump(path, function() {
			_this.loadModels(models);
			_this.clearModels(models, function() {
				_this.readData(path, models, function(data) {
					_this.populateModels(data);
				});
			});
		});
	} else {
		this.loadModels(models);
		this.clearModels(models, function() {
			_this.readData(path, models, function(data) {
				_this.populateModels(data);
			});
		});
	}
};

Seeder.prototype.readData = function(path, models, cb) {
	var data = [];
	var migrations_path = path;
	var files = fs.readdirSync(migrations_path);
	var count = files.length;
	files.forEach(function (file, i) {
	    if (~file.indexOf('.json')) {
	        var model = require(migrations_path + '/' + file);
	        data.push(model);
	    }
	    if (count === (i + 1)) {
	    	cb(data);
	    }
	});
};

Seeder.prototype.loadModels = function(models) {
	models.forEach(function(model) {
		require(path.resolve(model.path));
	});
};

Seeder.prototype.invalidModelCheck = function(models, cb) {
	var invalidModels = [];

	models.forEach(function(model) {
		if(_.indexOf(mongoose.modelNames(), model) === -1) {
			invalidModels.push(model);
		}
	});

	if (invalidModels.length) {
		cb(new Error('Models not registered in Mongoose: ' + invalidModels));
	} else {
		cb();
	}
};

Seeder.prototype.clearModels = function(models, cb) {
	if(!this.connected) {
		return new Error('Not connected to db, exiting function');
	}

	var modelNames = [];

	// Convert to array if not already
	if (Array.isArray(models)) {
		models.forEach(function(model) {
			modelNames.push(model.name);
		});
	} else {
		console.error(chalk.red('Error: Invalid model type'));
		return;
	}

	// Confirm that all Models have been registered in Mongoose
	var invalidModels = this.invalidModelCheck(modelNames, function(err) {
		if (err) {
			console.error(chalk.red('Error: ' + err.message));
			return;
		}

		// Clear each model
		async.each(modelNames, function(modelName, done) {
			var Model = mongoose.model(modelName);
			Model.remove({}, function(err) {
				if (err) {
					console.error(chalk.red('Error: ' + err.message));
					return;
				}
				console.log(modelName + 's collection cleared');
				done();
			});
		}, function(err) {
		// Final async callback
			if(err) { return; }
			cb();
		});
	});
};

Seeder.prototype.populateModels = function(seedData) {
	if(!this.connected) {
		return new Error('Not connected to db, exiting function');
	}

	var modelNames = _.unique(_.pluck(seedData,'model'));

	// Confirm that all Models have been registered in Mongoose
	var invalidModels = this.invalidModelCheck(modelNames, function(err) {
		if (err) {
			console.error(chalk.red('Error: ' + err.message));
			return;
		}

		co(function*(){
			for (const entry of seedData) {
				var Model = mongoose.model(entry.model);
				let j = 0;
				for (const document of entry.documents) {
					yield Model.create(document, function(err) {
						if (err) {
							console.error(chalk.red('Error creating document [' + j + '] of ' + entry.model + ' model'));
							console.error(chalk.red('Error: ' + err.message));
							return;
						}
						console.log('Successfully created document [' + j + '] of ' + entry.model + ' model');
					});
					j++;
				}
			}
			mongoose.connection.close();
			console.log(chalk.green('Successfully populate mongoose-seed'));
			process.exit();
		});

	});
};

Seeder.prototype.dump = function(path, cb) {
	var db = this.db.split('/'),
		dbname = '',
		date = new Date();

	if (typeof(db[3]) !== 'undefined') {
		dbname = db[3];
	}

	var args = ['--db', dbname, '--out', path + '/../backup/' + dbname + '-' + date.getTime(), '--quiet'];
	var mongodump = spawn('/usr/local/bin/mongodump', args);

	mongodump.stdout.on('data', function (data) {
	   	console.error(chalk.red('stdout: ' + data));
	});
	mongodump.stderr.on('data', function (data) {
	   	console.error(chalk.red('stderr: ' + data));
	});
	mongodump.on('exit', function (code) {
	   	console.log(chalk.green('Successfully dump mongoose-seed'));
	});

	if (cb && typeof(cb) === 'function') {
		cb();
	}
}

module.exports = new Seeder();
