var express = require('express'),
config = require('../conf/config'),
app = express(),
_ = require('underscore'),
db = require('./db');

//app.use(express.logger());
app.use(express.compress());
app.use(express.json());
app.use(express.urlencoded());

app.use(function (req, res, next) {
    res.header('X-Requester-IP', req.connection.remoteAddress);
    next();
});

app.use('/', express.static(__dirname + '/../public'));

app.get('/api', function(req, res) {
    res.status(200).sendfile('api.html');
});

app.get('/api/utilization/:circuits', function(req, res) {
    db.getRecentRate(req.params.circuits.split(','), 700, function(err, results) {
	// Include local timestamp for client-side time calculations
	results.timestamp = Date.now();

	res.json(results);
    });
});

function query(options, cb) {
    var params,
        where = "",
        fields = options.fields;

    if (options.where) {
	var wheres = [];
	params = [];
	_.each(options.where, function(t, k) {
	    wheres.push(k + " = ?");
	    params.push(t);
	});
	where = "WHERE " + wheres.join(" AND ");
    }

    if (!fields) {
	if (options.type == "device") {
	    fields = ["id", "name", "ip", "community", "last_config_refresh"];
	} else if (options.type == "circuit") {
	    fields = ["id", "name"];
	} else if (options.type == "circuit_end") {
	    fields = ["id"];
	}
    }
	
    db.query("SELECT " + fields.join(",") + " FROM "+ options.type + " " + where +
	     " ORDER BY LOWER(name)", params, function(err, results) {
	if (err) return cb(err);
	_.each(results, function(result) {
	    if (result.name) result.name = result.name.replace('.uen.net','');
	    if (!result.community || result.community.match(/^\s*$/) || result.community == config.defaultCommunity) {
		result.community = '{default}';
	    } else {
		result.community = result.community.replace(/^.*?(.{0,4})$/, "...$1");
	    }
	    if (result.last_config_refresh) result.refresh = new Date(result.last_config_refresh).toString().replace(/ GMT.*/, '');
	});
	cb(null, results);
    });
}

function queryInterfaces(id, cb) {
    if ("function" == typeof id) {
	cb = id;
	id = undefined;
    }

    var where = "",
        params = [];
    if (id) {
	where = "WHERE id = ?";
	params = [id];
    }

    db.query("SELECT id, name, poll_frequency FROM circuit " + where + " ORDER BY UPPER(name)", params, function(err, circuits) {
	if (err) return cb(err);
	if (!circuits || circuits.length == 0) return cb();

	db.query("SELECT circuit_id, end, interface_id, direction FROM circuit_end", function(err, ends) {
	    if (err) return cb(err);
	    if (!ends || ends.length == 0) return cb();

	    db.query("SELECT interface.id, device.id device_id, device.name device_name, ip, interface.name interface_name, snmp_index, description, status, speed FROM interface INNER JOIN device ON device.id = device_id WHERE interface.id IN (?)", [_.pluck(ends, 'interface_id')], 
		     function(err, interfaces) {
			 if (err) return cb(err);

			 _.each(circuits, function(circuit) {
			     circuit.ends = {A: _.filter(ends, function(end) { return end.circuit_id == circuit.id && end.end == 'A'; })[0],
					     Z: _.filter(ends, function(end) { return end.circuit_id == circuit.id && end.end == 'Z'; })[0] };
			     _.each(circuit.ends, function(end) {
				 end.interface = _.filter(interfaces, function(int) { return int.id == end.interface_id; })[0];
				 if (end.interface) {
				     end.interface.short_name = shortIntName(end.interface.interface_name);
				 }
			     });
			     if (circuit.ends.A && circuit.ends.A.interface && circuit.ends.Z && circuit.ends.Z.interface) {
				 circuit.bandwidth = _.min([circuit.ends.A.interface.speed + 0, circuit.ends.Z.interface.speed + 0]);
			     }
			 });

			 cb(null, circuits);
		     });
	});
    });
}

function shortIntName(name) {
    name = name.replace(/^HundredGig(abit)?E(thernet)?/, 'Hun');
    name = name.replace(/^TenGig(abit)?E(thernet)?/, 'Ten');
    // GigabitEthernet should come after anything containing GigabitEthernet
    name = name.replace(/^Gig(abit)?E(thernet)?/, 'Gig');
    name = name.replace(/^Serial/, 'Ser');
    name = name.replace(/^Loopback/, 'Lo');
    return name;
}


app.get('/api/device/list', function(req, res) {
    query({type: "device"}, function(err, results) {
	if (err) return res.json({error: err});
	res.json(results);
    });
});

app.delete('/api/device/:id', function(req, res) {
    if (req.params.id) {
	db.query("DELETE FROM device WHERE id = ?", [req.params.id], function (err, result) {
	    if (err) return res.json({error: err});
	    
	    db.query("DELETE FROM interface WHERE device_id = ?", [req.params.id], function (err, result) {
		if (err) return res.json({error: err});

		res.json({status: "OK"});
	    });
	});
    } else {
	res.json({error: "MISSING_ID"});
    }
});

// Add a new device
app.put('/api/device', function(req, res) {
    var ip = req.body.ip,
    community = req.body.community || '';

    query({type:"device", where: {ip: ip}}, function(err, result) {
	if (err) return res.json({error: err});
	if (result.length > 0) return res.json({error:"DUPLICATE_DEVICE"});

	db.query("INSERT INTO device SET ?", { ip: ip, community: community }, function (err, result) {
	    if (err) return res.json({error: err});

	    var id = result.insertId;

	    require('child_process').exec("(cd " + __dirname + '/../scripts; ./update_devices.pl ' + ip + ')', function(error, stdout, stderr) {
		query({type:"device", where: {id: id, ip: ip}},
		    function(err, results) {
			res.json({status: "OK", device: results[0]});
		    });
	    });
	});
    });
});

// Update a device
app.post('/api/device/:id', function(req, res) {
    var id = req.params.id,
    community = req.body.community || config.defaultCommunity;

    query({type:"device", where: {id: id}}, function(err, result) {
	if (err) return res.json({error: err});
	if (result.length > 0) return res.json({error:"DEVICE_NOT_FOUND"});

	db.query("UPDATE device SET ? WHERE id = ?", [{ name: name, ip: ip, community: community }, id], function (err, result) {
	    if (err) return res.json({error: err});

	    query({type:"device", where: {id: id }},
		  function(err, results) {
		      res.json({status: "OK", device: results[0]});
		  });
	});
    });
});

app.get('/api/device/:device_id/interface/list', function(req, res) {
    var where = "1=1";
    if (req.query.active == 1) {
	where += " AND (status = 1 OR admin = 1 AND LENGTH(description) > 0)";
    }
    if (req.query.mpls == 0) {
	where += ' AND name NOT LIKE "%mpls layer%"';
    }
    db.query("SELECT id, name, snmp_index, speed, description, status FROM interface WHERE device_id = ? AND " + where + " ORDER BY LOWER(name)",
	     [req.params.device_id], function(err, results) {
		 if (err) return res.json({error: err});

		 _.each(results, function(result) {
		     result.short_name = shortIntName(result.name);
		 });
		 res.json(results);
	     });
});

// List of all circuits, with associated interfaces and devices
app.get('/api/circuit/list', function(req, res) {
    queryInterfaces(function(err, circuits) {
	if (err) return res.json({error: err});

	res.json(circuits);
    });
});

// Add a new circuit
app.put('/api/circuit', function(req, res) {
    var data = { name: req.body.name,
		 a_interface: req.body.a_interface_id,
		 a_direction: req.body.a_direction,
		 z_interface: req.body.z_interface_id,
		 z_direction: req.body.z_direction };

    var invalid_params = [];
    _.each(data, function(v, k) {
	if (_.isEmpty(v)) invalid_params.push(k);
    });
    if (invalid_params.length > 0) return res.json({error: "MISSING_PARAMS", error_data: invalid_params });
    data.poll_frequency = parseInt(req.body.poll_frequency, 10) || 300;

    query({type: "circuit", where: {name: data.name}}, function(err, result) {
	if (err) return res.json({error: err});
	if (result.length > 0) return res.json({error:"DUPLICATE_CIRCUIT"});

	db.query("INSERT INTO circuit SET ?", { name: data.name, poll_frequency: data.poll_frequency }, function (err, result) {
	    if (err) return res.json({error: err});

	    var circuit_id = result.insertId;

	    db.query("INSERT INTO circuit_end (circuit_id, end, interface_id, direction) VALUES ?",
		     [[[circuit_id, 'A', data.a_interface, data.a_direction],
		       [circuit_id, 'Z', data.z_interface, data.z_direction]]],
		     function (err, result) {
			 if (err) return res.json({error: err});

			 queryInterfaces(circuit_id, function(err, circuits) {
			     if (err) return res.json({error: err});

			     res.json({status: "OK", circuit: circuits[0]});
			 });
		     });
	});
    });
});

// Update a circuit
app.post('/api/circuit/:id', function(req, res) {
    var circuit_id = req.params.id,
        data = { name: req.body.name,
		 a_interface: req.body.a_interface_id,
		 a_direction: req.body.a_direction,
		 z_interface: req.body.z_interface_id,
		 z_direction: req.body.z_direction };

    var invalid_params = [];
    _.each(data, function(v, k) {
	if (_.isEmpty(v)) invalid_params.push(k);
    });
    if (invalid_params.length > 0) return res.json({error: "MISSING_PARAMS", error_data: invalid_params });
    data.poll_frequency = parseInt(req.body.poll_frequency, 10) || 300;

    query({type: "circuit", where: {id: circuit_id}}, function(err, result) {
	if (err) return res.json({error: err});
	if (result.length == 0) return res.json({error:"CIRCUIT_NOT_FOUND"});

	db.query("UPDATE circuit SET ? WHERE id = ?", [{ name: data.name, poll_frequency: data.poll_frequency }, circuit_id], function (err, result) {
	    if (err) return res.json({error: err});

	    db.query("DELETE FROM circuit_end WHERE circuit_id = ?", [circuit_id], function (err, result) {
		if (err) return res.json({error: err});

		db.query("INSERT INTO circuit_end (circuit_id, end, interface_id, direction) VALUES ?",
			 [[[circuit_id, 'A', data.a_interface, data.a_direction],
			   [circuit_id, 'Z', data.z_interface, data.z_direction]]],
			 function (err, result) {
			     if (err) return res.json({error: err});

			     queryInterfaces(circuit_id, function(err, circuits) {
				 if (err) return res.json({error: err});

				 res.json({status: "OK", circuit: circuits[0]});
			     });
			 });
	    });
	});
    });
});

app.delete('/api/circuit/:id', function(req, res) {
    if (req.params.id) {
	db.query("DELETE FROM circuit WHERE id = ?", [req.params.id], function (err, result) {
	    if (err) return res.json({error: err});
	    
	    res.json({status: "OK"});
	});
    } else {
	res.json({error: "MISSING_ID"});
    }
});

app.listen(80, function() {
    process.setgid(33);
    process.setuid(33);
});
