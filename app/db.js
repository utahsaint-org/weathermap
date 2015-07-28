var last;
var mysql = require('mysql'),
    crypto = require('crypto'),
    config = { user: 'root', password: '', database: 'snmp', 'supportBigNumbers': true },
    _ = require('underscore'),
    conn,
    db;

// Reconnect if connection is refused or drops
function handleDisconnect() {
    conn = mysql.createConnection(config);

    conn.connect(function(err) {
	if(err) {
	    conn = undefined;
	    setTimeout(handleDisconnect, 2000);
	}
    });  

    conn.on('error', function(err) {
	if(err.code === 'PROTOCOL_CONNECTION_LOST') {
	    handleDisconnect();
	} else {
	    throw err;
	}
    });
}

handleDisconnect();

function processResults(err, results, cb) {
    if (err) return cb(err);

    if (results && results.length > 0) {
	_.each(results, function(result) {
	    result.date = new Date(result.timestamp * 1000);
	    try {
		result.value = JSON.parse(result.value);
	    } catch(e) {
		result.value = {};
	    }
	});
    }
    cb(null, results);
}

module.exports = {
    query: function () { conn.query.apply(conn, Array.prototype.slice.call(arguments)) },
    getRecentRate: function(circuits, delta, cb) {
	var oldestTimestamp = Math.floor(Date.now() / 1000) - delta;
	conn.query("SELECT circuit.name name, timestamp, in_bytes, out_bytes, 64bit, end, direction, speed, poll_frequency FROM circuit INNER JOIN interface_raw_poll poll INNER JOIN circuit_end ce ON ce.circuit_id = circuit.id INNER JOIN interface i on i.id = poll.interface_id AND i.id = ce.interface_id WHERE circuit.name IN (?) AND timestamp >= ? GROUP BY circuit.name, end, timestamp ORDER BY timestamp DESC",
		   [circuits, oldestTimestamp],
		   function(err, rows) {
		       var polls = {};
		       _.each(rows, function(row) {
			   if (!polls[row.name]) polls[row.name] = { A: [], Z: []};
			   var poll = polls[row.name];

			   // Done if we got 2 good measurements for each end
			   if (poll.A.length == 2 && poll.Z.length == 2) return;

			   var data = { timestamp: parseInt(row.timestamp,10),
					bytes: row.direction == 'O' ? parseInt(row.out_bytes,10) : parseInt(row.in_bytes,10),
					speed: parseInt(row.speed,10),
					poll_frequency: parseInt(row.poll_frequency,10),
				        "64bit": row["64bit"] == 1 };

			   if (row.end == 'A') {
			       // Eliminate dup polls due to SNMP caching
			       if (poll.A.length == 1 && poll.A[0].bytes == data.bytes) {
				   return;
			       }
			       poll.A.push(data);
			   }

			   if (row.end == 'Z') {
			       // Eliminate dup polls due to SNMP caching
			       if (poll.Z.length == 1 && poll.Z[0].bytes == data.bytes) {
				   return;
			       }
			       poll.Z.push(data);
			   }
		       });				   
		       rows = undefined;

		       var measures = {};
		       _.each(_.keys(polls), function(circuit) {
			   if (!measures[circuit]) measures[circuit] = { A: undefined , Z: undefined, speed: undefined, timestamp: undefined };
			   _.each(['A', 'Z'], function(end) {
			       var poll0 = polls[circuit][end][0],
			           poll1 = polls[circuit][end][1];

			       if (!poll0 || !poll1) return;

			       measures[circuit][end] = calculateBPS(poll1.bytes, poll1.timestamp, poll0.bytes, poll0.timestamp, poll1['64bit']);
			       measures[circuit].speed = _.min(_.compact([measures[circuit].speed, poll0.speed])) || undefined;
			       measures[circuit].timestamp = poll1.timestamp;
			       measures[circuit].poll_frequency = poll1.poll_frequency;
			   });
		       });
		       polls = undefined;
		       cb(null, measures);

		       // Compute bits per second rate
		       function calculateBPS(startCount, startTime, endCount, endTime, HC) {
			   if (endTime < startTime || !_.isNumber(endTime) || !_.isNumber(startTime) || !_.isNumber(endCount) || !_.isNumber(startCount)) return;
			   if (endTime == startTime)  return 0;

			   // Handle counter wrap
			   if (endCount < startCount) {
			       endCount += Math.pow(2,(HC ? 64 : 32));
			   }
			   return Math.floor((endCount - startCount) / (endTime - startTime) * 8);
		       }
		   }
		  );
    },
    retrieve: function(type, ip, variance, timestamp, cb) {
	if ("function" == typeof variance) {
	    cb = variance;
	    variance = timestamp = 0;
	}
	if ("function" == typeof timestamp) {
	    cb = timestamp;
	    timestamp = Math.floor(Date.now() / 1000);
	}
	var query = "SELECT * FROM poll WHERE type = ? AND ip = ?",
	    params = [type, ip];
	if (timestamp) {
	    timestamp = Math.floor(parseInt(timestamp, 10));
	    query += " AND timestamp BETWEEN ? AND ?";
	    params.push(timestamp - variance, timestamp + variance);
	}
	conn.query(query + " ORDER BY timestamp DESC LIMIT 1", params, function(err, results) {
	    processResults(err, results, cb);
	});
    },
    end: function() {
	conn.end();
    }
};
