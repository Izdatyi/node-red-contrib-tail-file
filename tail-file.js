
module.exports = function(RED) {
    'use strict';
    var Tail = require('./tail').Tail;
    var fs = require('fs-extra');
    var path = require('path');
    var platform = require('os').platform();

    function TailFileNode(config) {
        RED.nodes.createNode(this, config);

        const debug = config.debug || false;
        const logger = config.debug ? console : null;

        const configDef = {
            filename: this.filename = config.filename || "",
            createFile: this.createFile = config.createFile || false,
            mode: this.mode = config.mode || "",
            encoding: this.encoding = config.encoding || "",
            split: this.split = config.split || false,
            separator: this.separator = config.separator || "",
            fromBeginning: this.fromBeginning = config.fromBeginning || false,
            flushAtEOF: this.flushAtEOF = config.flushAtEOF || false,
            rememberLast: this.rememberLast = config.rememberLast || false,
            lineBytes: this.lineBytes = config.lineBytes || 0,
            limitSize: this.limitSize = config.limitSize || false,
            maxBytes: this.maxBytes = config.maxBytes || 0,
            skipBlank: this.skipBlank = config.skipBlank || false,
            useTrim: this.useTrim = config.useTrim || false,
            sendError: this.sendError = config.sendError || false,
            interval: this.interval = config.interval || 0,
        };
        var node = this;

        const chokidarDef = {
            persistent: true,
            ignoreInitial: true,
            usePolling: true,
            interval: 100,
            binaryInterval: 300,
            alwaysStat: true,
            awaitWriteFinish: {
                stabilityThreshold: (parseInt(node.interval) > 0 ? parseInt(node.interval) : (node.mode ? 200 : 100)),
                pollInterval: 100
            },
            ignorePermissionErrors: true,
            atomic: true
        };

        var message = {};
        var tail;

        
        if (debug) node.warn(`Start`);
        start();


        function start(callback)
        {
            node.status({ fill: "grey", shape: "ring", text: "waiting for file" });
        
            if (node.createFile && node.filename && !fs.existsSync(node.filename))
            {
                if (!fs.existsSync(path.dirname(node.filename))) {
                    if (debug) node.warn(`Create dir '${path.dirname(node.filename)}'`);
                    try {
                        fs.ensureDirSync(path.dirname(node.filename));
                    } catch(err) {
                        node.emit("err", err.toString());
                        node.status({ fill: "red", shape: "dot", text: "create dir error" });
                    }
                }

                if (fs.existsSync(path.dirname(node.filename)) && !fs.existsSync(node.filename)) {
                    if (debug) node.warn(`Create file '${node.filename}'`);
                    try {
                        fs.writeFileSync(node.filename, "", {
                            encoding: (node.encoding.trim() !== "" ? node.encoding.trim() : "utf-8")
                        });
                    } catch (err) {
                        node.emit("err", err.toString());
                        node.status({ fill: "red", shape: "dot", text: "create file error" });
                    }
                }
            }


            try {
                var options = {
                    logger: logger,
                    platform: platform,
                    encoding: (node.encoding.toLowerCase().trim() !== "" ? node.encoding.toLowerCase().trim() : "utf-8"),
                    separator: (((node.encoding.toLowerCase().trim() !== "binary") && node.split) ? RegExp(((node.separator.toString().trim() !== "") ? node.separator.toString().trim() : "[\r]{0,1}\n"), "gi") : ""),
                    fromBeginning: node.fromBeginning,
                    maxBytes: (node.limitSize ? ((parseInt(node.maxBytes) > 0) ? parseInt(node.maxBytes) : 5120) : 0),
                    mode: node.mode,
                    flushAtEOF: node.flushAtEOF,
                    rememberLast: (node.mode ? node.rememberLast : false),
                    lineBytes: ((parseInt(node.lineBytes) > 0) ? parseInt(node.lineBytes) : 512),
                    chokidar: (node.chokidar ? node.chokidar : chokidarDef)
                };
                if (!node.chokidar) {
                    options.chokidar.awaitWriteFinish.stabilityThreshold = (parseInt(node.interval) > 0 ? parseInt(node.interval) : (node.mode ? 200 : 100))
                }
                if (debug) node.warn(options);
 

                try {
                    tail = new Tail(node.filename, options);
                }
                catch (err) {
                    node.emit("err", `tail for '${node.filename}' failed: ${err.toString()}`);
                    node.status({ fill: "red", shape: "dot", text: "create tail error" });
                    return;
                }

                if (tail) {
                    tail.on("line", function (data) {
                        if (node.encoding.toLowerCase().trim() === "binary") {
                            if (!node.skipBlank || data) {
                                try {
                                    var byteArray = [];
                                    for (var i = 0; i < data.length; ++i) {
                                        byteArray.push(data.charCodeAt(i) & 0xff)
                                    }
                                    node.send({
                                        payload: Buffer.from(byteArray),
                                        topic: node.filename
                                    });    
                                } catch (err) {
                                    node.emit("err", `data for '${node.filename}' failed: ${err.toString()}`);
                                    node.status({ fill: "red", shape: "dot", text: "data error" });
                                    return;
                                }
                            }
                        }
                        else {
                            if (!node.skipBlank || ((node.useTrim ? data.toString().trim() : data.toString()) !== "")) {
                                node.send({
                                    payload: data.toString(),
                                    topic: node.filename
                                });
                            }                            
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
                    node.emit("err", `${node.filename}: create tail error`);
                    node.status({ fill: "red", shape: "dot", text: "create tail error" });
                }
            }
            catch (err) {
                node.emit("err", `initialize for '${node.filename}' failed: ${err.toString()}`);
                node.status({ fill: "red", shape: "dot", text: "initialize error" });
            }
            if (callback) callback();
        }


        function stop(callback) {
            if (tail) {
                try {
                    tail.unwatch();
                    if (node.filename) node.emit("err", `${node.filename}: tail stopped`);
                }
                catch (err) {
                    node.emit("err", `unwatch for '${node.filename}' failed: ${err.toString()}`);
                    node.status({ fill: "red", shape: "dot", text: "unwatch error" });
                }
                tail = undefined;
            }
            if (callback) callback();
        }


        this.on('err', function(err, msg = message) {
            msg.filename = node.filename;
            node.error(err, msg);
            if (node.sendError) {
                var sendMessage = RED.util.cloneMessage(msg);
                delete sendMessage.payload;
                sendMessage.error = err;
                node.send(sendMessage);
            }
        })

        this.on('close', function(done) {
            stop(function () {
                node.status({});
                if (debug) node.warn(`Unwatch`);
                done();
            });
        });

        this.on('input', function(msg) {
            message = msg;
            switch ((msg.topic).toLowerCase()) 
            {
                case "tail-file-stop".toLowerCase():
                    stop(function () {
                        node.status({ fill: "grey", shape: "ring", text: "stopped" });
                    });
                    break;

                case "tail-file-start".toLowerCase():
                    stop(function () {
                        start();
                    });
                    break;
                
                case "tail-file-filename".toLowerCase():
                    if ("payload" in msg) {
                        stop(function () {
                            node.filename = msg.payload.toString() || "";
                            start();
                        });
                    }
                    break;
                
                case "tail-file-config".toLowerCase():
                    if (("payload" in msg) && 
                        (Object.prototype.toString.call(msg.payload).toLowerCase() == "[object Object]".toLowerCase()))
                    {
                        node.filename = (("filename" in msg.payload) ? msg.payload.filename.toString() : configDef.filename);

                        node.createFile = ((("createFile" in msg.payload) && (Object.prototype.toString.call(msg.payload.createFile).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.createFile : configDef.createFile);

                        node.mode = ((("mode" in msg.payload) && ((msg.payload.mode.toString() === "") || (msg.payload.mode.toLowerCase() == "replaced"))) ? msg.payload.mode.toLowerCase() : configDef.mode);

                        if ("encoding" in msg.payload) {
                            var encoding = msg.payload.encoding.toLowerCase().trim();
                            if (
                                (encoding == "utf8") || (encoding == "utf-8") ||
                                (encoding == "ucs2") || (encoding == "ucs-2") ||
                                (encoding == "utf16le") || (encoding == "utf-16le") ||
                                (encoding == "latin1") || (encoding == "binary") ||
                                (encoding == "base64") || (encoding == "ascii") ||
                                (encoding == "hex")
                            ){
                                encoding = encoding.replace("utf8", "utf-8");
                                encoding = encoding.replace("ucs-2", "ucs2");
                                encoding = encoding.replace("utf-16le", "utf16le");
                                node.encoding = encoding;
                            }
                            else node.encoding = configDef.encoding;
                        }
                        else node.encoding = configDef.encoding;

                        node.split = ((("split" in msg.payload) && (Object.prototype.toString.call(msg.payload.split).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.split : configDef.split);

                        node.separator = (("separator" in msg.payload) ? msg.payload.separator.toString() : configDef.separator);

                        if (("separator" in msg.payload) && !(("split" in msg.payload) && (Object.prototype.toString.call(msg.payload.split).toLowerCase() == "[object Boolean]".toLowerCase())))
                        {
                            node.split = true;
                        }

                        node.fromBeginning = ((("fromBeginning" in msg.payload) && (Object.prototype.toString.call(msg.payload.fromBeginning).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.fromBeginning : configDef.fromBeginning);

                        node.flushAtEOF = ((("flushAtEOF" in msg.payload) && (Object.prototype.toString.call(msg.payload.flushAtEOF).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.flushAtEOF : configDef.flushAtEOF);

                        node.rememberLast = ((("rememberLast" in msg.payload) && (Object.prototype.toString.call(msg.payload.rememberLast).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.rememberLast : configDef.rememberLast);

                        node.lineBytes = (("lineBytes" in msg.payload) ? msg.payload.lineBytes.toString().trim() : configDef.lineBytes);

                        node.limitSize = ((("limitSize" in msg.payload) && (Object.prototype.toString.call(msg.payload.limitSize).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.limitSize : configDef.limitSize);

                        node.maxBytes = (("maxBytes" in msg.payload) ? msg.payload.maxBytes.toString().trim() : configDef.maxBytes);

                        if (("maxBytes" in msg.payload) && !(("limitSize" in msg.payload) && (Object.prototype.toString.call(msg.payload.limitSize).toLowerCase() == "[object Boolean]".toLowerCase())))
                        {
                            node.limitSize = true;
                        }

                        node.skipBlank = ((("skipBlank" in msg.payload) && (Object.prototype.toString.call(msg.payload.skipBlank).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.skipBlank : configDef.skipBlank);

                        node.useTrim = ((("useTrim" in msg.payload) && (Object.prototype.toString.call(msg.payload.useTrim).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.useTrim : configDef.useTrim);

                        if ((("useTrim" in msg.payload) && (Object.prototype.toString.call(msg.payload.useTrim).toLowerCase() == "[object Boolean]".toLowerCase())) && !(("skipBlank" in msg.payload) && (Object.prototype.toString.call(msg.payload.skipBlank).toLowerCase() == "[object Boolean]".toLowerCase())))
                        {
                            node.skipBlank = true;
                        }

                        node.sendError = ((("sendError" in msg.payload) && (Object.prototype.toString.call(msg.payload.sendError).toLowerCase() == "[object Boolean]".toLowerCase())) ? msg.payload.sendError : configDef.sendError);

                        node.interval = (("interval" in msg.payload) ? msg.payload.interval.toString().trim() : configDef.interval);

                        
                        if (("chokidar" in msg.payload) && (Object.prototype.toString.call(msg.payload.chokidar).toLowerCase() === "[object Object]".toLowerCase())) {
                            node.chokidar = msg.payload.chokidar;
                        }
                        else delete node.chokidar;


                        stop(function () {
                            start();
                        });
                    }
                    else node.emit("err", `incorrect configuration`);
                    break;
            }
        });
    }

    RED.nodes.registerType("tail-file", TailFileNode);
}
