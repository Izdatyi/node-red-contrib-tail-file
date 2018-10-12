
module.exports = function(RED) {
    "use strict";
    var Tail = require('./tail').Tail;
    var fs = require('fs');
    var platform = require('os').platform();

    function TailFileNode(config) {
        RED.nodes.createNode(this, config);

        this.filename = config.filename || "";
        this.createFile = config.createFile || false;
        this.encoding = config.encoding || "";
        this.mode = config.mode || "";
        this.split = config.split || false;
        this.separator = config.separator || "";
        this.fromBeginning = config.fromBeginning || false;
        this.flushAtEOF = config.flushAtEOF || false;
        this.rememberLast = config.rememberLast || false;
        this.bytes = config.bytes || false;
        this.maxBytes = config.maxBytes || 0;
        this.skipBlank = config.skipBlank || false;
        this.useTrim = config.useTrim || false;
        this.interval = config.interval || 0;
        this.sendError = config.sendError || false;
        var node = this;
        var tail;
        var message = {};

        const debug = config.debug || false;
        if (debug) node.warn(`Start`);


        node.status({ fill: "grey", shape: "ring", text: "waiting for file" });
        start();

        
        function start(callback)
        {
            try {
                if (node.createFile && !fs.existsSync(node.filename)) {
                    fs.writeFileSync(node.filename, "");
                }
            }
            catch (err) {
                node.emit("err", err.toString());
                node.status({ fill: "red", shape: "dot", text: "create file error" });
            }


            var options = {
                logger: config.debug ? console : null,
                platform: platform,
                options: {
                    persistent: true,
                    interval: (parseInt(node.interval) > 0 ? parseInt(node.interval) : 200)
                },
                encoding: (node.encoding.trim() !== "" ? node.encoding.trim() : "utf-8"),
                separator: (node.split ? RegExp(((node.separator.trim() !== "") ? node.separator.trim() : "[\r]{0,1}\n"), "gi") : ""),
                fromBeginning: node.fromBeginning,
                maxBytes: (node.bytes ? ((parseInt(node.maxBytes) > 0) ? parseInt(node.maxBytes) : 5120) : 0),
                mode: node.mode,
                flushAtEOF: node.flushAtEOF,
                rememberLast: (node.mode ? node.rememberLast : false)
            };
            if (debug) node.warn(options);

            try {
                tail = new Tail(node.filename, options);
                if (tail) {
                    tail.on("line", function (data) {
                        // if (debug) node.warn(`line. skipBlank: ${node.skipBlank}${(node.skipBlank ? `; useTrim: ${node.useTrim}` : "")}`);

                        if (!node.skipBlank || ((node.useTrim ? data.toString().trim() : data.toString()) !== "")) {
                            node.send({
                                payload: data,
                                topic: node.filename
                            });
                        }
                        node.status({ fill: "green", shape: "dot", text: "active" });
                    });

                    tail.on("truncated", function () {
                        node.emit("err", `${node.filename}: file truncated`);
                        node.status({ fill: "green", shape: "dot", text: "active" });
                    });

                    tail.on("noent", function () {
                        if (node.filename) node.emit("err", `cannot open '${node.filename}' for reading: No such file or directory`);
                        node.status({ fill: "grey", shape: "ring", text: "waiting for file" });
                    });

                    tail.on("disappears", function () {
                        node.emit("err", `'${node.filename}' has become inaccessible: No such file or directory`);
                        node.status({ fill: "grey", shape: "ring", text: "waiting for file" });
                    });

                    tail.on("reappears", function () {
                        node.emit("err", `'${node.filename}' has appeared, following new file`);
                        node.status({ fill: "green", shape: "dot", text: "active" });
                    });

                    tail.on("notfound", function (entry, buffer) {
                        var sendMessage = RED.util.cloneMessage(message);
                        sendMessage.entry = entry;
                        sendMessage.buffer = buffer;
                        node.emit("err", `'${node.filename}' last entry not found!`, sendMessage);
                        node.status({ fill: "red", shape: "ring", text: "entry not found" });
                    });

                    tail.on("error", function (error) {
                        node.emit("err", error.toString());
                        node.status({ fill: "red", shape: "dot", text: "error" });
                        stop();
                    });

                    if (node.filename) node.emit("err", `${node.filename}: tail started`);
                    node.status({ fill: "green", shape: "dot", text: "active" });
                }
                else {
                    node.emit("err", `create tail error`);
                    node.status({ fill: "red", shape: "dot", text: "create tail error" });
                }
            }
            catch (err) {
                node.emit("err", err.toString());
                node.status({ fill: "red", shape: "dot", text: "initialize error" });
            }
            if (callback) callback();
        }


        function stop(callback) {
            if (tail) {
                try {
                    tail.unwatch();
                    if (node.filename) node.emit("err", `${node.filename}: tail stopped`);
                    node.status({ fill: "grey", shape: "ring", text: "stopped" });
                }
                catch (err) {
                    node.emit("err", err.toString());
                    node.status({ fill: "red", shape: "dot", text: "unwatch error" });
                }
                tail = undefined;
            }
            if (callback) callback();
        }


        this.on('close', function(done) {
            stop(function () {
                node.status({});
                if (debug) node.warn(`Unwatch`);
                done();
            });
        });

        this.on('input', function(msg) {
            message = msg;
            // if (debug) node.warn(`INPUT: ${JSON.stringify(msg, null, 2)}`);
            switch ((msg.topic).toLowerCase()) 
            {
                case "tail-file-stop".toLowerCase():
                    stop();
                    break;

                case "tail-file-start".toLowerCase():
                    stop(function () {
                        // if (debug) node.warn(`tail: ${tail}`);
                        start();
                    });
                    break;
                
                case "tail-file-filename".toLowerCase():
                    stop(function () {
                        node.filename = msg.payload.toString() || "";
                        start();
                    });
                    break;
            }
        });

        this.on('err', function(err, msg = message) {
            // if (debug) node.warn(`ERR err: ${err.toString()}; msg: ${JSON.stringify(msg,null,2)}`);
            msg.filename = node.filename;
            node.error(err, msg);
            if (node.sendError) {
                var sendMessage = RED.util.cloneMessage(msg);
                delete sendMessage.payload;
                sendMessage.error = err;
                node.send(sendMessage);
            }
        })
    }

    RED.nodes.registerType("tail-file", TailFileNode);
}
