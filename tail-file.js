
module.exports = function(RED) {
    "use strict";
    var Tail = require('./tail.js').Tail;
    var fs = require('fs');
    var platform = require('os').platform();

    if (!platform.match(/^win/)) {
        throw RED._("currently Windows ONLY");
    }
    
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
        var node = this;
        var tail;

        const errors = config.errors || false;
        const echo = config.echo || false;
        if (echo) node.warn(`Start`);


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
                if (errors || echo) node.error(err.toString());
                node.status({ fill: "red", shape: "dot", text: "create file error" });
            }


            var options = {
                logger: config.echo ? console : null,
                fsWatchOptions: {
                    persistent: true,
                    interval: (parseInt(node.interval) > 0 ? parseInt(node.interval) : 100)
                },
                encoding: (node.encoding.trim() !== "" ? node.encoding.trim() : "utf-8"),
                separator: (node.split ? RegExp(((node.separator.trim() !== "") ? node.separator.trim() : "[\r]{0,1}\n"), "gi") : ""),
                fromBeginning: node.fromBeginning,
                maxBytes: (node.bytes ? ((parseInt(node.maxBytes) > 0) ? parseInt(node.maxBytes) : 5120) : 0),
                mode: node.mode,
                flushAtEOF: node.flushAtEOF,
                rememberLast: (node.mode ? node.rememberLast : false)
            };
            if (echo) node.warn(options);

            try {
                tail = new Tail(node.filename, options);
                if (tail) {
                    tail.on("line", function (data) {
                        // if (echo) node.warn(`line. skipBlank: ${node.skipBlank}${(node.skipBlank ? `; useTrim: ${node.useTrim}` : "")}`);

                        if (!node.skipBlank || ((node.useTrim ? data.toString().trim() : data.toString()) !== "")) {
                            node.send({
                                payload: data,
                                topic: node.filename
                            });
                        }
                        node.status({ fill: "green", shape: "dot", text: "active" });
                    });

                    tail.on("truncated", function () {
                        if (errors || echo) node.error(`${node.filename}: file truncated`);
                        node.status({ fill: "green", shape: "dot", text: "active" });
                    });

                    tail.on("noent", function () {
                        if (errors || echo) node.error(`cannot open '${node.filename}' for reading: No such file or directory`);
                        node.status({ fill: "grey", shape: "ring", text: "waiting for file" });
                    });

                    tail.on("disappears", function () {
                        if (errors || echo) node.error(`'${node.filename}' has become inaccessible: No such file or directory`);
                        node.status({ fill: "grey", shape: "ring", text: "waiting for file" });
                    });

                    tail.on("reappears", function () {
                        if (errors || echo) node.error(`'${node.filename}' has appeared, following new file`);
                        node.status({ fill: "green", shape: "dot", text: "active" });
                    });

                    tail.on("notfound", function (entry, buffer) {
                        if (errors || echo) node.error(`'${node.filename}' last entry not found! ENTRY='${entry}'; BUFFER='${buffer}'`);
                        node.status({ fill: "red", shape: "ring", text: "entry not found" });
                    });

                    tail.on("error", function (error) {
                        if (errors || echo) node.error(error.toString());
                        node.status({ fill: "red", shape: "dot", text: "error" });
                        tail.unwatch();
                    });

                    if (errors || echo) node.error(`${node.filename}: tail started`);
                    node.status({ fill: "green", shape: "dot", text: "active" });
                }
                else {
                    if (errors || echo) node.error(`create tail error`);
                    node.status({ fill: "red", shape: "dot", text: "create tail error" });
                }
            }
            catch (err) {
                if (errors || echo) node.error(err.toString());
                node.status({ fill: "red", shape: "dot", text: "initialize error" });
            }
            if (callback) callback();
        }


        function stop(callback) {
            if (tail) {
                try {
                    tail.unwatch();
                    if (errors || echo) node.error(`${node.filename}: tail stopped`);
                    node.status({ fill: "grey", shape: "ring", text: "stopped" });
                }
                catch (err) {
                    if (errors || echo) node.error(err.toString());
                    node.status({ fill: "red", shape: "dot", text: "unwatch error" });
                }
                tail = undefined;
            }
            if (callback) callback();
        }


        this.on("close", function () {
            stop(function () {
                node.status({});
                if (echo) node.warn(`Unwatch`);
            });
        });


        this.on('input', function(msg) {
            // if (echo) node.warn(msg);
            switch ((msg.topic).toLowerCase()) 
            {
                case "tail-file-start".toLowerCase():
                    stop(function () {
                        // if (echo) node.warn(`tail: ${tail}`);
                        start();
                    });
                    break;
                
                case "tail-file-stop".toLowerCase():
                    stop();
                    break;

                case "tail-file-filename".toLowerCase():
                    stop(function () {
                        node.filename = msg.payload.toString() || "";
                        start();
                    });
                    break;
            }
        });
    }

    RED.nodes.registerType("tail-file", TailFileNode);
}
