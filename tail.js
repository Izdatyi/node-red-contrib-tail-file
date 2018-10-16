// based on:
// lucagrulla/node-tail
// https://github.com/lucagrulla/node-tail

'use strict';
var Tail, environment, events, fs, chokidar,
    boundMethodCheck = function (instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new Error('Bound instance method accessed before binding');
        }
    };

events = require('events');
fs = require('fs');
chokidar = require('chokidar');

environment = process.env['NODE_ENV'] || 'development';

Tail = class Tail extends events.EventEmitter {

    readBlock() {
        if (this.logger) this.logger.info(`<readBlock> filename: ${this.filename}`);
        var block, stream, err;

        boundMethodCheck(this, Tail);

        if (this.queue.length >= 1) {
            block = this.queue[0];
            if (block.end > block.start) {
                var splitData = function () {
                    var chunk, i, len, parts, results;
                    parts = this.buffer.split(this.separator);
                    this.buffer = parts.pop();
                    results = [];
                    for (i = 0, len = parts.length; i < len; i++) {
                        chunk = parts[i];
                        if (this.logger) this.logger.info(`split chunk: (${chunk.length}) '${chunk.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`);
                        results.push(this.emit("line", chunk));
                    }
                    return results;
                }.bind(this)

                try {
                    stream = fs.createReadStream(this.filename, {
                        flags: 'r',
                        encoding: this.encoding,
                        start: block.start,
                        end: block.end - 1,
                        autoClose: true
                    });
                }
                catch (error1) {
                    err = error1;
                    if (this.logger) this.logger.error(`read for '${this.filename}' failed: ${err}`);
                    this.emit("error", `read for '${this.filename}' failed: ${err}`);
                    return;
                }

                if (stream)
                {
                    stream.on('error', (error) => {
                        if (this.logger) this.logger.info(`<error>`);
                        if (this.logger) this.logger.error(`Tail error: ${error}`);
                        return this.emit('error', error);
                    });

                    
                    stream.on('end', () => {
                        if (this.logger) this.logger.info(`<end>`);
                        var pos;
                        var x;
                        x = this.queue.shift();
                        if (this.queue.length > 0) this.internalDispatcher.emit("next");

                        if (this.mode) {
                            if (this.buffer.length > 0) {
                                if (this.rememberLast) {
                                    if (this.logger) this.logger.info(`buffer: (${this.buffer.length})`);

                                    if ((this.last.length > 0) && (this.buffer.length >= this.last.length)) {
                                        pos = this.buffer.indexOf(this.last);
                                        if (pos !== -1) pos = pos + this.last.length;
                                    }

                                    if (!(pos >= 0)) {
                                        if (this.logger) {
                                            this.logger.info(``);
                                            this.logger.info(`last: (${this.last.length})`);
                                            this.logger.info(`${this.last.toString().trim()}`);
                                            this.logger.info(``);
                                            this.logger.info(`buffer: (${this.buffer.length})`);
                                            this.logger.info(`${this.buffer.toString().trim()}`);
                                            this.logger.info(``);
                                        }
                                        this.emit('notfound', this.last, this.buffer);
                                    }

                                    this.last = this.buffer.slice(-this.lineBytes);

                                    if (pos >= 0) {
                                        if (this.logger) this.logger.info(`pos: ${pos}`);
                                        this.buffer = this.buffer.slice(pos);
                                    }
                                    else this.buffer = '';

                                    if (this.logger) this.logger.info(`new last: (${this.last.length}) '...${this.last.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').substr(-70)}'`);
                                }

                            
                                if (this.logger) this.logger.info(`buffer line: (${this.buffer.length})`);
                                if (!this.separator) {
                                    this.emit("line", this.buffer);
                                    return this.buffer = '';
                                }
                                else {
                                    splitData();
                                    return this.buffer = '';
                                }
                            }
                        }
                        else {
                            if (this.flushAtEOF && this.buffer.length > 0) {
                                if (this.logger) this.logger.info(`buffer line: (${this.buffer.length}) '${this.buffer.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`);
                                this.emit("line", this.buffer);
                                return this.buffer = '';
                            }
                        }

                        if (this.logger) this.logger.info(`end buffer: (${this.buffer.length}) '${this.buffer.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').substr(-70)}'`);
                    });


                    stream.on('data', (data) => {
                        if (this.logger) {
                            this.logger.info(`<data>`);
                            if (!this.mode && this.separator) this.logger.info(`separator: ${this.separator.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[^\x20-\x7E]/g, '_')}`);
                            this.logger.info(`data.length: ${data.length}`);
                        }

                        if (this.mode) {
                            return this.buffer += data;
                        }
                        else {
                            if (!this.separator) {
                                if (this.logger) this.logger.info(`data line: ${data.length}`);
                                return this.emit("line", data);
                            }
                            else {
                                this.buffer += data;
                                return splitData();
                            }
                        }

                        if (this.logger) this.logger.info(`data buffer: (${this.buffer.length}) '${this.buffer.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[^\x20-\x7E]/g, '\\_')}'`);
                    });
                }
                else this.emit("error", `create reader for '${this.filename}' failed`);
            }
        }
    }

    constructor(filename, options = {}) {
        var fromBeginning;
        super(filename, options);
        this.readBlock = this.readBlock.bind(this);
        this.change = this.change.bind(this);
        this.filename = filename;

        ({
            logger: this.logger,
            platform: this.platform = null,
            encoding: this.encoding = "utf-8",
            separator: this.separator = /[\r]{0,1}\n/,
            fromBeginning = false,
            maxBytes: this.maxBytes = 0,
            flushAtEOF: this.flushAtEOF = false,
            mode: this.mode = "",
            rememberLast: this.rememberLast = false,
            lineBytes: this.lineBytes = 512,
            chokidar: this.chokidar = {
                persistent: true,
                ignoreInitial: true,
                usePolling: true,
                interval: 100,
                binaryInterval: 300,
                alwaysStat: true,
                awaitWriteFinish: {
                    stabilityThreshold: (this.mode ? 200 : 100),
                    pollInterval: 100
                },
                ignorePermissionErrors: true,
                atomic: true
            }
        } = options);

        if (this.logger) {
            this.logger.info(`<constructor>`);
            this.logger.info(`platform: ${this.platform}`);
            this.logger.info(`chokidar: ${JSON.stringify(this.chokidar)}`);
            this.logger.info(`filename: ${this.filename}`);
            this.logger.info(`encoding: ${this.encoding}`);
            if (this.separator) this.logger.info(`separator: ${this.separator.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[^\x20-\x7E]/g, '_')}`);
            if (this.maxBytes) this.logger.info(`maxBytes: ${this.maxBytes}`);
            if (!this.mode) this.logger.info(`flushAtEOF: ${this.flushAtEOF}`);
            if (this.mode) this.logger.info(`mode: ${this.mode}`);
            if (this.mode) this.logger.info(`rememberLast: ${this.rememberLast}`);
            if (this.mode) this.logger.info(`lineBytes: ${this.lineBytes}`);
        }

        this.timer = undefined;
        this.prev = null;
        this.curr = null;
        this.buffer = '';
        this.last = '';
        this.internalDispatcher = new events.EventEmitter();
        this.queue = [];
        this.isWatching = false;
        this.watcher = undefined;
        this.internalDispatcher.on('next', () => {
            return this.readBlock();
        });

        this.start(fromBeginning);
    }

    start(fromBeginning) {
        if (this.logger) this.logger.info(`<start> filename: ${this.filename}`);
        var interval = 0;
        var timing = function () {
            this.timer = setInterval(function () {
                if (!this.filename || !fs.existsSync(this.filename)) {
                    if (interval == 0) {
                        this.emit("noent");
                        interval = 1000;
                        clearInterval(this.timer);
                        timing();
                    }
                    return;
                }
                clearInterval(this.timer);
                if (interval !== 0) this.emit("reappears");

                this.watch(fromBeginning);

            }.bind(this), interval);
        }.bind(this)
        timing();
    }

    change(filename) {
        if (this.logger) this.logger.info(`<change> filename: ${this.filename}`);
        var err, stats;
        boundMethodCheck(this, Tail);
        try {
            stats = fs.statSync(filename);
        } catch (error1) {
            err = error1;
            if (this.logger) this.logger.error(`'${e}' event for '${filename}'. ${err}`);
            this.emit("error", `'${e}' event for '${filename}'. ${err}`);
            return;
        }
        if (stats.size < this.pos) {
            this.pos = stats.size;
        }
        if (stats.size > this.pos) {
            this.queue.push({
                start: this.pos,
                end: stats.size
            });
            this.pos = stats.size;
            if (this.queue.length === 1) return this.internalDispatcher.emit("next");
        }
    }

    watch(fromBeginning) {
        if (this.logger) this.logger.info(`<watch> filename: ${this.filename}; isWatching : ${this.isWatching}`);
        var err, stats;

        if (this.isWatching) return;
        this.isWatching = true;
        if (this.logger) this.logger.info(`fromBeginning: ${fromBeginning}`);

        try {
            stats = fs.statSync(this.filename);
            this.curr = stats;
        }
        catch (error1) {
            err = error1;
            if (this.logger) this.logger.error(`watch for '${this.filename}' failed: ${err}`);
            this.emit("error", `watch for '${this.filename}' failed: ${err}`);
            return;
        }

        if (this.mode) {
            this.pos = fromBeginning ? 0 : stats.size;
            this.change(this.filename);
        }
        else {
            this.pos = fromBeginning ? 0 : stats.size;
            if (this.pos === 0) this.change(this.filename);
        }

        if (this.logger) this.logger.info(`following file: ${this.filename}`);

        
        try {
            this.watcher = chokidar.watch(this.filename, this.chokidar);
        }
        catch (error1) {
            err = error1;
            if (this.logger) this.logger.error(`watcher for '${this.filename}' failed: ${err}`);
            this.emit("error", `watcher for '${this.filename}' failed: ${err}`);
            return;
        }

        if (this.watcher)
        {
            this.watcher.on('ready', () => {
                if (this.logger) this.logger.info(`'ready'`);
            });

            this.watcher.on('error', (err) => {
                if (this.logger) this.logger.error(`watch for ${this.filename} failed: ${err}`);
                this.emit("error", `watch for ${this.filename} failed: ${err}`);
            });

            this.watcher.on('unlink', (path) => {
                this.emit("disappears");
            });

            this.watcher.on('add', (path, stats) => {
                this.emit("reappears");
                return this.watchFileEvent(stats);
            });

            this.watcher.on('change', (path, stats) => {
                return this.watchFileEvent(stats);
            });
        }
        else this.emit("error", `create watcher for '${this.filename}' failed`);
    }

    watchFileEvent(stats) {
        this.prev = this.curr || stats;
        this.curr = stats;
        
        var formatDateTime = function (DT) {
            var value =
                ("0" + DT.getDate()).substr(-2) + "." +
                ("0" + (DT.getMonth() + 1)).substr(-2) + "." +
                DT.getFullYear() + " " +
                DT.toLocaleString('ru-RU', { weekday: 'short' }) + " " +
                ("0" + DT.getHours()).substr(-2) + ":" +
                ("0" + DT.getMinutes()).substr(-2) + ":" +
                ("0" + DT.getSeconds()).substr(-2) + '.' +
                ("00" + DT.getMilliseconds()).substr(-3);
            return value;
        }

        if (this.logger) {
            this.logger.info(`--------------------------- (${new Date().getTime()}) ${formatDateTime(new Date())}`);
            if (this.mode) this.logger.info(`mode: ${this.mode}`);
        }

        var maxbytes = this.maxBytes || this.curr.size;
        if (this.logger) this.logger.info(`maxbytes: ${maxbytes}`);


        if (this.mode) {
            if (this.logger) this.logger.info(`curr.size: ${this.curr.size}`);

            this.queue = [];
            this.buffer = '';

            this.pos = this.curr.size;
            if (this.curr.size > 0) {
                this.queue.push({
                    start: (this.curr.size > maxbytes) ? this.curr.size - maxbytes : 0,
                    end: this.curr.size
                });
                if (this.queue.length === 1) return this.internalDispatcher.emit("next");
            }
            else this.last = '';
        }
        else {
            if (this.logger) {
                this.logger.info(`prev: ${JSON.stringify({
                    "dev": this.prev.dev,
                    "ino": this.prev.ino,
                    "size": this.prev.size
                }, null, 2)}`);
                this.logger.info(`curr: ${JSON.stringify({
                    "dev": this.curr.dev,
                    "ino": this.curr.ino,
                    "size": this.curr.size
                }, null, 2)}`);
            }

            if (this.curr.size > this.prev.size) {
                if ((this.queue.length === 0) && (this.buffer.length > 0) && !((this.prev.size - this.buffer.length) < 0)) {
                    this.prev.size = this.prev.size - this.buffer.length;
                    this.buffer = '';
                }

                this.pos = this.curr.size;
                this.queue.push({
                    start: ((this.curr.size - this.prev.size) > maxbytes) ? this.curr.size - maxbytes : this.prev.size,
                    end: this.curr.size
                });
                if (this.queue.length === 1) return this.internalDispatcher.emit("next");
            }
            else {
                if (this.curr.size < this.prev.size) {
                    this.pos = this.curr.size;
                    this.queue = [];
                    this.buffer = '';
                    this.emit("truncated");
                }
                else {
                    if ((this.queue.length === 0) && (this.buffer.length > 0) && !((this.prev.size - this.buffer.length) < 0)) {
                        this.prev.size = this.curr.size - this.buffer.length;
                        this.buffer = '';

                        this.pos = this.curr.size;
                        this.queue.push({
                            start: this.prev.size,
                            end: this.curr.size
                        });
                        if (this.queue.length === 1) return this.internalDispatcher.emit("next");
                    }
                }
            }
        }
    }

    unwatch() {
        if (this.logger) this.logger.info(`<unwatch> filename: ${this.filename}`);
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        if (this.isWatching && this.watcher) this.watcher.close();
        this.watcher = undefined;
        this.isWatching = false;
        this.queue = [];
        this.buffer = '';
        this.last = '';
        if (this.logger) return this.logger.info(`unwatch: ${this.filename}`);
    }
};

exports.Tail = Tail;
