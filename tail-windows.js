
module.exports = function(RED) {
    "use strict";
    var Tail = require('./tail.js').Tail;
    // var Tail = require('tail').Tail;
    var fs = require('fs');
    var platform = require('os').platform();

    if (!platform.match(/^win/)) {
        throw RED._("Windows ONLY");
    }
    
    function TailWindowsNode(config) {
        RED.nodes.createNode(this, config);
        
        this.filename = config.filename || "";
        this.create = config.create || false;
        this.fromBeginning = config.fromBeginning;
        this.flushAtEOF = config.flushAtEOF;
        this.skipBlank = config.skipBlank || false;
        this.useTrim = config.useTrim || false;
        this.interval = config.interval || 0;
        this.separator = config.separator || "";
        this.encoding = config.encoding || "";
        var node = this;
        var tail;

        const echo = config.echo || false;
        if (echo) node.warn("start");

        node.status({fill: "grey", shape: "ring", text: "waiting for file"});
        
        try {
            if (!fs.existsSync(node.filename) && node.create) {
                fs.writeFileSync(node.filename, "");
            }
        }
        catch (err) {
            node.error(err.toString());
            node.status({ fill: "red", shape: "dot", text: "create file error" });
        }

        var timer;
        var interval = 0;
        var timing = function () {
            timer = setInterval((function () {
                if (!fs.existsSync(node.filename)) {
                    // if (echo) node.warn("tick...");
                    if (interval == 0) {
                        node.error("cannot open '" + node.filename + "' for reading: No such file or directory");
                        interval = 1000;
                        clearInterval(timer);
                        timing();
                    }
                    return;
                }
                clearInterval(timer);
                if (interval !== 0) node.error("'" + node.filename + "' has appeared, following new file");

                var options = {
                    // logger: console,
                    // useWatchFile: true,
                    // follow: true,
                    fsWatchOptions: {
                        persistent: true,
                        interval: (parseInt(node.interval) > 0 ? parseInt(node.interval) : 250)
                    },
                    fromBeginning: node.fromBeginning || false,
                    flushAtEOF: node.flushAtEOF || false,
                    separator: new RegExp((node.separator.trim()!==""?node.separator.trim():"[\r]{0,1}\n"),"gi"),
                    encoding: (node.encoding.trim() !== "" ? node.encoding.trim() : "utf-8")
                };
                if (echo) node.warn(options);

                try {
                    tail = new Tail(node.filename, options);
                    if (tail) 
                    {
                        tail.on("line", function (data) {
                            if (echo) node.warn("line. skipBlank: " + node.skipBlank + (node.skipBlank ? ", useTrim: " + node.useTrim : ""));
                            
                            if (!node.skipBlank || ((node.useTrim ? data.toString().trim() : data.toString()) !== "")) {
                                node.send({
                                    payload: data,
                                    topic: node.filename
                                });
                            }
                            node.status({fill: "green", shape: "dot", text: "active"});
                        });

                        tail.on("error", function (error) {
                            node.error(error.toString());

                            if (error.toString().toLowerCase().indexOf("' has become inaccessible: No such file or directory".toLowerCase()) !== -1) {
                                node.status({fill: "grey", shape: "ring", text: "waiting for file"});
                            }
                            else if (error.toString().toLowerCase().indexOf("' has appeared, following new file".toLowerCase()) !== -1) {
                                node.status({fill: "green", shape: "dot", text: "active"});
                            }
                            else node.status({fill: "red", shape: "dot", text: "error"});
                        });

                        node.status({fill: "green", shape: "dot", text: "active"});
                    } 
                    else {
                        node.error("create tail error");
                        node.status({fill: "red", shape: "dot", text: "create tail error"});
                    }
                }
                catch (err) {
                    node.error(err.toString());
                    node.status({fill: "red", shape: "dot", text: "initialize error"});
                }            
                
            }), interval);
        }
        timing();


        this.on("close", function() {
            clearInterval(timer);
            if (echo) node.warn(tail);
            if (tail) {
                try {
                    if (tail.isWatching) tail.unwatch();
                    node.status({fill: "blue", shape: "dot", text: "active, not watching"});
                } 
                catch (err) {
                    node.error(err.toString());
                    node.status({fill: "red", shape: "dot", text: "unwatch error"});
                }
                tail = undefined;
                if (echo) node.warn("Unwatch");
            }
            node.status({});
        });
    }

    RED.nodes.registerType("tail-windows", TailWindowsNode);
}
