// Extract levels from utilizationColors, sorted in numerical order
function getUtilizationLevels(utilizationColors) {
    utilizationLevels = [];
    Object.keys(utilizationColors).forEach(function(util) {
        util = parseInt(util, 10);
        utilizationLevels.push(util);
    });
    utilizationLevels = utilizationLevels.sort(function(a, b) {
        return a - b;
    });
    return utilizationLevels;
}

// Generate CSS rules for utilization levels and link width
function createCSS(mapSelector, utilizationColors, bandwidths, minWidth, maxWidth) {
    // Generate utilization CSS rules
    var ruleTemplates = {
        ".stroke<util>": "stroke: <color>;",
        ".fill<util>": "fill: <color>;",
        "#stub<util>": "stroke-width: 0; fill: <color>;"
    }; // marker-ends

    var css = "\n.Generated_CSS_for_utilization_colors { }\n";
    Object.keys(utilizationColors).forEach(function(util) {
        util = parseInt(util, 10);

        var color = utilizationColors[util];
        Object.keys(ruleTemplates).forEach(function(selector) {
            var style = ruleTemplates[selector];
            selector = selector.replace(/<util>/g, util);
            style = style.replace(/<color>/g, color);
            css += mapSelector + " " + selector + " { " + style + " }\n";
        });
    });

    // Generate link CSS rules
    css += "\n.Generated_CSS_for_links { }\n";
    var count = Object.keys(bandwidths).length;
    var widths = maxWidth - minWidth + 1;
    var i = 0;
    Object.keys(bandwidths).sort(function(a, b) { return bandwidths[a] - bandwidths[b]; }).forEach(function(k) {
	css += mapSelector + " ." + bwClass(k) + " { stroke-width: " +
	    Math.floor(minWidth + (((widths - 1) / (count - 1)) * i || 0)) + "px; }\n";
	i++;
    });
    d3.select("html").append("style").attr("type", "text/css").text(css);
}

function bwClass(bw) {
    return "bw" + bw.replace('.', '_');
}

// Create markers for each utilization level
function createMarkers(levels, svg) { // levels is an array of utilization levels
    if (svg.select("defs").empty()) svg.append("defs");

    var markers = {
        stub: "M 0 1 L 2 1 L 6 3 L 6 7 L 2 9 L 0 9 z" // MUTED STUB
//            , fullstub: "M 0 0 L 6 3 L 6 7 L 0 10 z",   // FULL STUB
//            , "stub-arrow": "M 0 0 L 6 5 L 0 10 z",  // STUBBY ARROW
//            , "stub-top": "M 0 0 L 6 3 L 6 5 L 0 5 z",  // HALF STUB FOR MULTILINK TOP
//            , "stub-bottom": "M 0 5 L 6 5 L 6 7 L 0 10 z"  // HALF STUB FOR MULTILINK BOTTOM
    };

    Object.keys(markers).forEach(function(marker) {
	svg.select("defs").selectAll("marker." + marker)
            .data(levels)
            .enter()
            .append("marker")
            .classed(marker, true)
            .attr({
                fill: "#333",
                viewBox: "0 0 10 10",
                refX: 6,
                refY: 5,
                markerUnits: "strokeWidth",
                markerWidth: "3.5",
                markerHeight: "2.5",
                orient: "auto"
            })
            .attr("class", function(d) {
                return "stroke" + d;
            })
            .attr("id", function(d) {
                return marker + d;
            })
            .append("path")
            .attr("d", markers[marker]);
    });
}

// Create filters
function createFilters(svg) {
    if (svg.select("defs").empty()) svg.append("defs");

    var filter = svg.select("defs").append("filter").attr("id", "label-shadow");
    filter.append("feFlood").attr("flood-color", "black");
    filter.append("feComposite").attr({ in2: "SourceGraphic", operator: "in" });
    filter.append("feGaussianBlur").attr("stdDeviation", 2);
    filter.append("feComposite").attr("operator", "over");
    filter.append("feComposite").attr("operator", "over");
    filter.append("feComposite").attr("in", "SourceGraphic");
}

// Reverse a link name
function linkReverse(link) {
    return link.replace(/^([^-]+)-([^-]+)/g, "$2-$1");
}

// Convert a large number to a readable short number (10^9 -> 1.0G)
function bitsToReadable(bits) {
    function divide(n, d) {
        return (Math.floor(n / d * 10) / 10)
            .toString()
            .substr(0, 3)
            .replace(/\.$/,'');
    }

    var pows = [[9, "G"], [6, "M"], [3, "k"]];
    for (var i = 0; i < pows.length; i++) {
        var div = Math.pow(10, pows[i][0]);
        if (bits >= div) {
            return divide(bits, div) + pows[i][1];
        }
    }
    if (bits > 0) return divide(bits, 1);
}

// Set the utilization level for a half-link
function setLinkUtil(utilizationLevels, linkName, bits, time) {
    var link = d3.select("#link-" + linkName);

    if (link.empty()) return;

    var bits = parseInt(bits, 10),
        pct = bits / link.attr('data-bw') * 100,
        text = bitsToReadable(bits),
        util;

    if (pct > 100) pct = 100;
    if (pct < 0) pct = 0;

    for (var i = 0, len = utilizationLevels.length; i < len; i++) {
        if (pct <= utilizationLevels[i]) {
            util = utilizationLevels[i];
            break;
        }
    }

    if ("undefined" != typeof util) {
        var currClass = ((link.attr("class") || '').match(/(stroke\d+)/) || [''])[1]
        if (currClass) link.classed(currClass, false);

        link
	    .classed("stroke" + util, true)
	    .attr("data-current-bw", bits);

	if (time) {
	    link.attr("data-last-update", time);
	}

        if (link.classed("stub-arrow")) {
            link.attr("marker-end", "url(#stub-arrow" + util + ")");
        } else {
            link.attr("marker-end", "url(#stub" + util + ")");
        }
    }
    if (text) {
        d3.select("g#label-" + linkName).style("display", null).select("text").text(text);
    } else {
        d3.select("g#label-" + linkName).style("display", "none");
    }
}

// Update circuit utilization
var lastUpdated;
function updateUtil(url, refresh, timeSelector) {
    function updateClock(timeSelector, timeout) {
	// Timeout any non-refreshed links
	function timeoutLinks(refresh) {
	    d3.selectAll('[data-last-update]').each(function() {
		var link = d3.select(this),
   		    linkCircuit = link.attr('data-circuit');
		
		var linkTimeout = link.attr('data-poll-frequency') * 2 + 2 * refresh,
		now = (Date.now() - dateDiff) / 1000;
		if (now - link.attr('data-last-update') >= linkTimeout) {
		    var circuit = (link.attr('id').match(/^link-(.+)$/) || [])[1];
		    if (circuit) {
			setLinkUtil(utilizationLevels, circuit, 0);
			console.log('Timed out ', circuit, ' as [' + link.attr('data-last-update') + '] >=', linkTimeout, 'seconds after', now);
		    }
		}
	    });
	}

	var time = d3.select(timeSelector),
	    updated = Math.floor((Date.now() - lastUpdated)/1000);

	if (!time.empty() && lastUpdated) {
	    time.text("Updated " + updated + " seconds ago");
	}

	// Flag clock if updates exceed interval
	if (time.classed("error") != updated > timeout) {
	    time.classed("error", updated > timeout);
	}

	timeoutLinks(timeout);

	setTimeout(function() { updateClock(timeSelector, timeout) }, 1000);
    }

    var links = {};
    d3.selectAll('[data-circuit]').each(function() {
	var e = d3.select(this);
	var l = e.attr('data-circuit');
	links[l] = true;

	if (e.attr('data-add-links')) {
	    e.attr('data-add-links').split(',').forEach(function(circuit) { links[circuit.replace(/\.reverse$/,'')] = true; });
	}
	if (e.attr('data-subtract-links')) {
	    e.attr('data-subtract-links').split(',').forEach(function(circuit) { links[circuit.replace(/\.reverse$/,'')] = true; });
	}
    });
    d3.json(url + "/" + Object.keys(links).join(','), function(data) {
	var updated,
	    links = Object.keys(data || {});

	// Adjust for any local time difference
	if (data && data.timestamp) dateDiff = Date.now() - data.timestamp;

	links.forEach(function(linkOut) {
	    if (linkOut == 'timestamp') return;

	    var linkIn = linkReverse(linkOut);
	    if (d3.select('#link-' + linkOut).empty() && d3.select('#link-' + linkIn).empty()) return;

	    var circuit= d3.select('#link-' + linkOut).attr('data-circuit');

	    d3.select('#link-' + linkOut).attr('data-poll-frequency', data[linkOut].poll_frequency);
	    d3.select('#link-' + linkIn).attr('data-poll-frequency', data[linkOut].poll_frequency);

	    updated = true;

	    var linkTimeout = d3.select('#link-' + linkOut).attr('data-poll-frequency') * 2 + refresh,
	        now = (Date.now() - dateDiff) / 1000;
	    if (now - data[linkOut].timestamp < linkTimeout) {
		var dataOut = data[linkOut].A,
		    dataIn = data[linkOut].Z;

		if (dataOut == 0) console.log(linkOut + '.A had 0 bps at ' + data.timestamp);
		if (dataIn == 0) console.log(linkOut + '.Z had 0 bps at ' + data.timestamp);

		var link = d3.select('#link-' + linkOut);
		if (!link.empty() && link.attr('data-add-links')) {
		    link.attr('data-add-links').split(',').forEach(function(circuit) {
			var c = circuit.replace(/\.reverse$/,'');
			if (data[c] && data[c].A && data[c].Z) {
			    dataOut += circuit.match(/\.reverse$/) ? data[c].Z : data[c].A;
			    dataIn += circuit.match(/\.reverse$/) ? data[c].A : data[c].Z;
			}
		    });
		}
		if (!link.empty() && link.attr('data-subtract-links')) {
		    link.attr('data-subtract-links').split(',').forEach(function(circuit) {
			var c = circuit.replace(/\.reverse$/,'');
			if (data[c] && data[c].A && data[c].Z) {
			    dataOut -= circuit.match(/\.reverse$/) ? data[c].Z : data[c].A;
			    dataIn -= circuit.match(/\.reverse$/) ? data[c].A : data[c].Z;
			}
		    });
		}
				
		setLinkUtil(utilizationLevels, linkOut, dataOut, data[linkOut].timestamp);
		setLinkUtil(utilizationLevels, linkIn, dataIn, data[linkOut].timestamp);
	    } else {
		console.log('No update for', linkOut, ' as [' + data[linkOut].timestamp + '] >=', linkTimeout, 'seconds after', now, (dateDiff ? ', time adjusted by ' + dateDiff/1000 + 's' : ''));
	    }
	});
	if (updated) {
	    if (!lastUpdated) {
		lastUpdated = Date.now();
		if (timeSelector) updateClock(timeSelector, refresh);
	    } else {
		lastUpdated = Date.now();
	    }
	}
	if (refresh) setTimeout(function() { updateUtil(url, refresh, timeSelector) }, refresh * 1000);

	triggerEvent('updateUtil');
    });
}

function Map(configURL, mapSelector, timeSelector, nameSelector, acronymSelector) {
    var utilizationLevels,
        dateDiff = 0,
        svg;

    if (!mapSelector) {
        var id = 'map_' + Math.floor(Math.random() * Date.now());
        svg = d3.select('body').append('svg').attr('id', id);
        mapSelector = "#" + id;
    } else {
        svg = d3.select(mapSelector);
    }

    this.init = function(cb) {
        d3.json(configURL, function(err, data) {
            if (err) {
                if (cb) cb(err);
            } else {
                initMap(data);

                if (cb) cb();
            }
        });
    };

    // Initialize the map
    function initMap(config) {
        var bandwidths = {};
        Object.keys(config.links).forEach(function(k) {
            var bw = config.links[k].bw;
            bandwidths[bw] = bitsFromReadable(bw);
        });

        createCSS(mapSelector, config.utilizationColors, bandwidths, config.linkStyle.minWidth, config.linkStyle.maxWidth);
	utilizationLevels = getUtilizationLevels(config.utilizationColors);
        createMarkers(utilizationLevels, svg);
	createFilters(svg);

        Object.keys(config.nodes).forEach(function(k) {
            var node = config.nodes[k];
	    if ("undefined" != typeof(node[0])) {
		addNode(k, node[0], node[1], { type: node[2] });
	    } else {
		addNode(k, node.coords[0], node.coords[1], node);
	    }
        });

        Object.keys(config.links).forEach(function(k) {
            var link = config.links[k],
                nodes = k.split('-'),
		options = {};
	    ["sum", "group", "linkDelta", "inLabelDelta", "outLabelDelta", "add", "subtract"].forEach(function(option) {
		    options[option] = link[option];
		});
	    if (link.nodes) nodes = link.nodes;
            addLink(k, nodes[0], nodes[1], link.bw, options);
        });

	if (config.mapName && nameSelector) {
	    var name = d3.select(nameSelector);
	    if (!name.empty()) {
		name.text(config.mapName);
	    }
	}

	if (config.mapName && acronymSelector) {
	    var acronym = d3.select(acronymSelector);
	    if (!acronym.empty()) {
		acronym.text(config.acronym);
	    }
	}

	if (config.utilizationURL) {
	    updateUtil(config.utilizationURL, config.updateInterval, timeSelector);
	}

	if (config.recheckConfig) {
	    checkConfigETag(config.recheckConfig);
	}    

	if (config.logo) {
	    d3.select('#logo').attr('src', 'images/' + config.logo).style('display','inline');
	}
    }

    // Periodically check the E-Tag header from the config file, and refresh page if it changes
    var origConfigETag;
    function checkConfigETag(interval) {
	var xhr = d3.xhr(configURL);
	xhr.send("HEAD", function(err, response) {
		var ETag = response.getResponseHeader("ETag");
		if (ETag) {
		    if (!origConfigETag) {
			origConfigETag = ETag;
		    } else {
			if (origConfigETag != ETag) {
			    window.location.reload();
			}
		    }
		}
	    setTimeout(function() { checkConfigETag(interval) }, interval * 1000);
	});
    }

    // Convert human-readable bandwidth into bits
    function bitsFromReadable(bw) {
        var n = parseFloat(bw, 10);
        var m = (bw.match(/^[\d\.]+(\D)/) || ['',''])[1].toUpperCase();
        var pows = {"G": 9, "M": 6,  "K": 3};

        if (pows[m]) {
            n = n * Math.pow(10, pows[m]);
        }
        return n;
    }

    // Create utilization scale key
    createUtilScale = function(x, y) {
        var group = svg.append("g"),
            boxes = group
                .selectAll("rect")
                .data(utilizationLevels);

        boxes
            .enter()
            .append("rect")
            .attr({
                width: 15,
                height: 10,
                x: 10
            })
            .attr("class", function(d) {
                return "fill" + d;
            })
            .attr("y", function(d, i) {
                return (i + 1) * 10;
            });

        boxes
            .enter()
            .append("text")
            .attr({
                class: "ub",
                width: 15,
                height: 10,
		x: 30
            })
            .attr("y", function(d, i) {
                return (i + 1) * 10 + 8;
            })
            .text(function(d) {
                return (d > 0 ? "< " : "") + d + "%";
            });

        if (x || y) {
            x = parseInt(x, 10) || 0;
            y = parseInt(y, 10) || 0;
            group.attr("transform", "translate(" + x + "," + y + ")");
        }
    }

    // Put a node on the map at x,y with text
    function addNode(text, x, y, options) {
	options = options || {};
	options.type = options.type || "circle";
	options.radius = options.radius || 18;
	options.class = options.class || "node";

	if (options.type == "edge") {
	    options.type = "circle";
	    options.class = "edge";
	}

	if (!options.label) {
	    options.label = [text];
	} else if (!Array.isArray(options.label)) {
	    options.label = [options.label];
	}

        if (options.type == 'circle') {
	    var textY = y,
	        textY2, label2;
	    if (options.label.length > 1) {
		textY2 = textY + 8;
		textY -= 8;
	    }

	    options.size = options.size || 18;
            svg.append("circle")
                .classed(options.class, true)
                .attr("cx", x)
                .attr("cy", y)
                .attr("r", options.size)
                .attr("id", "node-" + text);
            svg.append("text")
                .classed(options.class, true)
                .attr("x", x)
                .attr("y", textY)
                .attr("fill", "#333")
                .attr("id", "node-" + text + "-text")
                .text(options.label[0]);

	    if (options.label.length > 1) {
		svg.append("text")
                    .classed(options.class, true)
                    .attr("x", x)
                    .attr("y", textY2)
                    .attr("fill", "#333")
                    .attr("id", "node-" + text + "-text2")
                    .text(options.label[1]);
	    }
        } else if (options.type == 'square') {
	    options.size = options.size || 36;
            var width = options.size,
                height = options.size,
                dX = width / 2,
                dY = height / 2,
	        dY1 = dY,
	        dY2;

	    if (options.label.length > 1) {
		dY2 = dY1 + 8;
		dY1 -= 8;
	    }

            var group = svg.append('g')
                .attr({
                    id: "node-" + text,
                    transform: "translate(" + (x - dX) + "," + (y - dY) + ")",
                    // Place-holders for connecting links
                    cx: x,
                    cy: y
                });
            group.append("rect")
                .classed("edge", true)
                .attr({
                    x: 0,
                    y: 0,
                    width: width,
                    height: width,
                    rx: 5
                });
            group.append("text")
                .classed("edge", true)
                .attr({
                    x: dX,
                    y: dY1
                })
                .text(options.label[0]);

	    if (options.label.length > 1) {
		group.append("text")
                    .classed("edge", true)
                    .attr({
			x: dX,
			y: dY2
                    })
                    .text(options.label[1]);
	    }
        } else if (options.type = 'cloud') {
//<path d="M33.5,34.5c3.689,0,7-3.529,7-7.409c0-3.649-2.65-7-6.02-7.34c0.06-0.47,0.09-0.98,0.09-1.49
//	 c0-5.99-4.631-10.84-10.36-10.84c-4.56,0-8.42,3.07-9.819,7.34c-0.711-0.21-1.461-0.27-2.221-0.32c-5.62-0.38-8.34,1.54-8.34,8.792
//	 c0,0.469,0.029,0.92,0.109,1.35C1.97,25.072,0.5,26.922,0.5,29.121c0,2.561,2.54,5.379,5,5.379H33.5L33.5,34.5z" style="stroke:black; fill:red"/>
	}
	if (options.link) {
	    d3.selectAll('#node-' + text + ", #node-" + text + "-text, #node-" + text + "-text2")
		.on('click', function() {
		    document.location.href = options.link;
		});
	}
    }

    // Connect node1 to node2 with two half-links and set link type
    // optionally set utilization level of each half-link
    function addLink(linkName, node1, node2, bw, options) {
        var n1 = svg.select("#node-" + node1),
            n2 = svg.select("#node-" + node2),
            linkName2 = linkReverse(linkName),
	    options = options || {},
            bits = bitsFromReadable(bw),
	    deltaX = (options.linkDelta || [0,0])[0],
	    deltaY = (options.linkDelta || [0,0])[1],
	    inLabelDeltaX = (options.inLabelDelta || [0,0])[0],
	    inLabelDeltaY = (options.inLabelDelta || [0,0])[1],
	    outLabelDeltaX = (options.outLabelDelta || [0,0])[0],
	    outLabelDeltaY = (options.outLabelDelta || [0,0])[1];

	var origLinkName = linkName;
	if (linkName.indexOf(',') != -1) {
	    linkName2 = linkName.split(',')[1];
	    linkName = linkName.split(',')[0];
	}

        if (n1 && n1.length == 1 && n2 && n2.length == 1) {
            var x1 = parseInt(n1.attr("cx"), 10),
                y1 = parseInt(n1.attr("cy"), 10),
                x3 = parseInt(n2.attr("cx"), 10),
                y3 = parseInt(n2.attr("cy"), 10);
                x2 = (x1 + (x3 - x1) / 2) + deltaX, // (x2,y2) half-way between x1 & x3, shifted by delta
		y2 = (y1 + (y3 - y1) / 2) + deltaY;

            if (deltaX || deltaY) {
                // Find a point on a bezier curve
                // http://en.wikipedia.org/wiki/B%C3%A9zier_curve
                function B(t, p0, p1, p2) {
                    return Math.pow(1 - t, 2) * p0 + 2 * (1 - t) * t * p1 + Math.pow(t, 2) * p2;
                }

                // Find point p1 for a bezier curve that passes through Bt at t = 0.5 (middle)
                // Based on B() solved for p1
                function C(Bt, p0, p2) {
                    return (Bt - 0.25 * p0 - 0.25 * p2) / 0.5;
                }

                var p1x = C(x2, x1, x3), // Calculate p1(x,y) for a bezier curve passing through (x2,y2)
                    p1y = C(y2, y1, y3),
                    cx1 = C(B(0.25, x1, p1x, x3), x1, x2), // Compute p1's for half-bezier curves that meet at (x2,y2)
                    cy1 = C(B(0.25, y1, p1y, y3), y1, y2),
                    cx2 = C(B(0.75, x1, p1x, x3), x2, x3),
                    cy2 = C(B(0.75, y1, p1y, y3), y2, y3);

                var label1 = svg.insert("g", "#node-" + node1)
                    .attr({
                        id: "label-" + linkName,
                        transform: "translate(" + (B(0.5, x1, cx1, x2) - 19 + outLabelDeltaX) + "," +
			(B(0.5, y1, cy1, y2) - 9 + outLabelDeltaY) + ")"
                    })
		    .classed("label", true)
                    .style("display", "none");
                label1.append("text")
                    .attr({
                        class: "label",
                        x: 5,
			    y: 13,
			filter: "url(#label-shadow)"
                    });
                svg.insert("path", "g#label-" + linkName)
                    .attr({ id: "link-" + linkName,
			    "data-circuit": origLinkName,
                            "data-bw": bits })
                    .classed(bwClass(bw), true)
                    .classed('link', true)
                    .attr("d", "M " + x1 + " " + y1 + " Q " + cx1 + " " + cy1 + " " + x2 + " " + y2);

                var label2 = svg.insert("g", "#node-" + node2)
                    .attr({
                        id: "label-" + linkName2,
                        transform: "translate(" + (B(0.5, x2, cx2, x3) - 19 + inLabelDeltaX) + "," +
			(B(0.5, y2, cy2, y3) - 9 + inLabelDeltaY) + ")"
                    })
		    .classed("label", true)
                    .style("display", "none");
                label2.append("text")
                    .attr({
                        class: "label",
                        x: 5,
			    y: 13,
			filter: "url(#label-shadow)"
                    });
                svg.insert("path", "g#label-" + linkName2)
                    .attr({ id: "link-" + linkName2,
			    "data-circuit": origLinkName,
                            "data-bw": bits })
                    .classed(bwClass(bw), true)
                    .classed('link', true)
                    .attr("d", "M " + x3 + " " + y3 + " Q " + cx2 + " " + cy2 + " " + x2 + " " + y2);
            } else {
                var label1 = svg.insert("g", "#node-" + node1)
                    .attr({
                        id: "label-" + linkName,
                        transform: "translate(" + (x1 + (x2 - x1) / 2 - 19 + outLabelDeltaX) + "," +
			(y1 + (y2 - y1) / 2 - 9 + outLabelDeltaY) + ")"
                    })
		    .classed("label", true)
                    .style("display", "none");
                label1.append("text")
                    .attr({
                        class: "label",
                        x: 5,
			    y: 13,
			filter: "url(#label-shadow)"
                    });
                svg.insert("line", "g#label-" + linkName)
                    .attr({ id: "link-" + linkName,
			    "data-circuit": origLinkName,
                            "data-bw": bits })
                    .classed(bwClass(bw), true)
                    .classed('link', true)
                    .attr("x1", x1)
                    .attr("y1", y1)
                    .attr("x2", x2)
                    .attr("y2", y2);

                var label2 = svg.insert("g", "#node-" + node2)
                    .attr({
                        id: "label-" + linkName2,
                        transform: "translate(" + (x2 + (x3 - x2) / 2 - 19 + inLabelDeltaX) + "," +
			(y2 + (y3 - y2) / 2 - 9 + inLabelDeltaY) + ")"
                    })
		    .classed("label", true)
                    .style("display", "none");
                label2.append("text")
                    .attr({
                        class: "label",
                        x: 5,
			y: 13,
			filter: "url(#label-shadow)"
                    });
                svg.insert("line", "g#label-" + linkName2)
                    .attr({ id: "link-" + linkName2,
			    "data-circuit": origLinkName,
                            "data-bw": bits })
                    .classed(bwClass(bw), true)
                    .classed('link', true)
                    .attr("x1", x3)
                    .attr("y1", y3)
                    .attr("x2", x2)
                    .attr("y2", y2);
            }

	    if (options.add) {
		d3.select("#link-" + linkName).attr("data-add-links", options.add.join(","));
	    }

	    if (options.subtract) {
		d3.select("#link-" + linkName).attr("data-subtract-links", options.subtract.join(","));
	    }

            setLinkUtil(utilizationLevels, linkName, 0);
            setLinkUtil(utilizationLevels, linkName2, 0);
        }
    }
}

function triggerEvent(eventName) {
    var event; // The custom event that will be created

    if (document.createEvent) {
	event = document.createEvent("HTMLEvents");
	event.initEvent(eventName, true, true);
    } else {
	event = document.createEventObject();
	event.eventType = eventName;
    }

    event.eventName = eventName;

    if (document.createEvent) {
	document.dispatchEvent(event);
    } else {
	document.fireEvent("on" + event.eventType, event);
    }
}