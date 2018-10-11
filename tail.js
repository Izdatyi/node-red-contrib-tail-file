// based on:
// lucagrulla/node-tail
// https://github.com/lucagrulla/node-tail

var timer, Tail, environment, events, fs,
    boundMethodCheck = function (instance, Constructor) {
        if (!(instance instanceof Constructor)) {
            throw new Error('Bound instance method accessed before binding');
        }
    };

events = require("events");
fs = require('fs');
var chokidar = require('chokidar');

environment = process.env['NODE_ENV'] || 'development';

Tail = class Tail extends events.EventEmitter {

    readBlock() {
        if (this.logger) this.logger.info(`<readBlock>`);
        var block, stream;

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

                stream = fs.createReadStream(this.filename, {
                    flags: 'r', // 'rx' 'r+'
                    encoding: this.encoding,
                    start: block.start,
                    end: block.end - 1,
                    autoClose: true
                });

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

                            // this.last = this.buffer.slice(-parseInt(((this.buffer.length * 10 / 100) > 1024) ? 1024 : (this.buffer.length * 10 / 100)));
                            this.last = this.buffer.slice(-512);

                            if (pos >= 0) {
                                if (this.logger) this.logger.info(`pos: ${pos}`);
                                this.buffer = this.buffer.slice(pos);
                            }
                            else this.buffer = '';

                            if (this.logger) this.logger.info(`new last: (${this.last.length}) '...${this.last.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').substr(-70)}'`);
                        }

                        if (this.buffer.length > 0) {
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


                return stream.on('data', (data) => {
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
            encoding: this.encoding = "utf-8",
            separator: this.separator = /[\r]{0,1}\n/,
            fromBeginning = false,
            maxBytes: this.maxBytes = 0,
            flushAtEOF: this.flushAtEOF = false,
            mode: this.mode = "",
            rememberLast: this.rememberLast = false,
            interval: this.interval = 100
        } = options);

        if (this.logger) {
            this.logger.info(`<constructor>`);
            this.logger.info(`interval: ${this.interval}`);
            this.logger.info(`filename: ${this.filename}`);
            this.logger.info(`encoding: ${this.encoding}`);
            if (this.separator) this.logger.info(`separator: ${this.separator.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[^\x20-\x7E]/g, '_')}`);
            if (this.maxBytes) this.logger.info(`maxBytes: ${this.maxBytes}`);
            if (!this.mode) this.logger.info(`flushAtEOF: ${this.flushAtEOF}`);
            if (this.mode) this.logger.info(`mode: ${this.mode}`);
            if (this.mode) this.logger.info(`rememberLast: ${this.rememberLast}`);
        }

        // this.online = true;
        this.prev = null;
        this.curr = null;
        this.buffer = '';
        this.last = '';
        this.internalDispatcher = new events.EventEmitter();
        this.queue = [];
        this.isWatching = false;
        this.watcher = null;
        this.internalDispatcher.on('next', () => {
            return this.readBlock();
        });

        this.start(fromBeginning);
    }

    start(fromBeginning) {
        if (this.logger) this.logger.info("<start>");
        var interval = 0;
        var timing = function () {
            timer = setInterval(function () {
                // if (this.logger) this.logger.info(`tick... interval: ${interval}`);
                if (!this.filename || !fs.existsSync(this.filename)) {
                    if (interval == 0) {
                        this.emit("noent");
                        interval = 1000;
                        clearInterval(timer);
                        timing();
                    }
                    return;
                }
                clearInterval(timer);
                if (interval !== 0) this.emit("reappears");

                this.watch(fromBeginning);

            }.bind(this), interval);
        }.bind(this)
        timing();
    }

    change(filename) {
        if (this.logger) this.logger.info(`<change>`);
        var err, stats;
        boundMethodCheck(this, Tail);
        try {
            stats = fs.statSync(filename);
        } catch (error1) {
            err = error1;
            if (this.logger) this.logger.error(`'${e}' event for ${filename}. ${err}`);
            this.emit("error", `'${e}' event for ${filename}. ${err}`);
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
        if (this.logger) this.logger.info("<watch>");
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
            if (this.logger) this.logger.error(`watch for ${this.filename} failed: ${err}`);
            this.emit("error", `watch for ${this.filename} failed: ${err}`);
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

        
        this.watcher = chokidar.watch(this.filename, {
            // persistent (default: true). Indicates whether the process should continue to run as long as files are being watched. If set to false when using fsevents to watch, no more events will be emitted after ready, even if the process continues to run.
            persistent: true,

            // ignoreInitial (default: false). If set to false then add/addDir events are also emitted for matching paths while instantiating the watching as chokidar discovers these file paths (before the ready event).
            ignoreInitial: true,

            // usePolling (default: false). Whether to use fs.watchFile (backed by polling), or fs.watch. If polling leads to high CPU utilization, consider setting this to false. It is typically necessary to set this to true to successfully watch files over a network, and it may be necessary to successfully watch files in other non-standard situations. Setting to true explicitly on OS X overrides the useFsEvents default.
            // Windows: after rename - fired twice - bug?
            usePolling: true,

            // interval (default: 100). Interval of file system polling.
            interval: 100,
            // binaryInterval (default: 300). Interval of file system polling for binary files.
            binaryInterval: 300,

            // alwaysStat (default: false). If relying upon the fs.Stats object that may get passed with add, addDir, and change events, set this to true to ensure it is provided even in cases where it wasn't already available from the underlying watch events.
            alwaysStat: true,

            // awaitWriteFinish (default: false). By default, the add event will fire when a file first appears on disk, before the entire file has been written. Furthermore, in some cases some change events will be emitted while the file is being written. In some cases, especially when watching for large files there will be a need to wait for the write operation to finish before responding to a file creation or modification. Setting awaitWriteFinish to true (or a truthy value) will poll file size, holding its add and change events until the size does not change for a configurable amount of time. The appropriate duration setting is heavily dependent on the OS and hardware. For accurate detection this parameter should be relatively high, making file watching much less responsive. Use with caution.
            // awaitWriteFinish: true,
            awaitWriteFinish: {
                // awaitWriteFinish.stabilityThreshold (default: 2000). Amount of time in milliseconds for a file size to remain constant before emitting its event.
                // Количество времени в миллисекундах для того, чтобы размер файла оставался постоянным перед выпуском его события.
                stabilityThreshold: this.interval,
                // awaitWriteFinish.pollInterval (default: 100). File size polling interval.
                // Интервал опроса размера файла.
                pollInterval: 100
            },

            // ignorePermissionErrors (default: false). Indicates whether to watch files that don't have read permissions if possible. If watching fails due to EPERM or EACCES with this set to true, the errors will be suppressed silently.
            ignorePermissionErrors: true,

            // atomic (default: true if useFsEvents and usePolling are false). Automatically filters out artifacts that occur when using editors that use "atomic writes" instead of writing directly to the source file. If a file is re-added within 100 ms of being deleted, Chokidar emits a change event rather than unlink then add. If the default of 100 ms does not work well for you, you can override it by setting atomic to a custom value, in milliseconds.
            atomic: true // or a custom 'atomicity delay', in milliseconds (default 100)
        });
        

        this.watcher.on('ready', () => {
            if (this.logger) this.logger.info(`'ready'`);
        });

        this.watcher.on('error', (err) => {
            if (this.logger) this.logger.error(`watch for ${this.filename} failed: ${err}`);
            this.emit("error", `watch for ${this.filename} failed: ${err}`);
        });

        // this.watcher.on('addDir', (path, stats) => {
        //     if (this.logger) this.logger.info(`addDir' stats: ${JSON.stringify(stats)}`);
        // });
        // this.watcher.on('unlinkDir', (path) => {
        //     if (this.logger) this.logger.info(`'unlinkDir'`);
        // });
        // this.watcher.on('all', (event, path) => {
        //     if (this.logger) this.logger.info(`'all' event: ${event}`);
        // });
        // this.watcher.on('raw', (event, path, details) => {
        //     if (this.logger) this.logger.info(`'raw' event: ${event}; details: ${JSON.stringify(details)}`);    // , null, 2
        // });

        this.watcher.on('unlink', (path) => {
            // if (this.logger) this.logger.info(`'unlink'`);
            this.emit("disappears");
        });

        this.watcher.on('add', (path, stats) => {
            // if (this.logger) this.logger.info(`'add' stats: ${JSON.stringify(stats)}`);
            this.emit("reappears");
            return this.watchFileEvent(stats);
        });

        this.watcher.on('change', (path, stats) => {
            // if (this.logger) this.logger.info(`'change' tats: ${JSON.stringify(stats)}`);
            return this.watchFileEvent(stats);
        });
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

        // if (curr.ino > 0) {
        //     if (!this.online) this.emit("reappears");
        // }
        // else if (this.online) this.emit("disappears");
        // this.online = (curr.ino > 0);


        var maxbytes = this.maxBytes || this.curr.size;
        if (this.logger) this.logger.info(`maxbytes: ${maxbytes}`);

        // if (curr.ino > 0) {
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
                    // this.logger.info(`prev: ${JSON.stringify(this.prev, null, 2)}`);
                    // this.logger.info(`curr: ${JSON.stringify(this.curr, null, 2)}`);
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
                    // this.logger.info(`prev.ino: ${this.prev.ino+""}`);
                    // this.logger.info(`curr.ino: ${this.curr.ino+""}`);
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
        // }
    }

    unwatch() {
        if (this.logger) this.logger.info(`<unwatch>`);
        if (timer) clearInterval(timer);
        if (this.isWatching && this.watcher) this.watcher.close();
        this.isWatching = false;
        this.queue = [];
        this.buffer = '';
        this.last = '';
        if (this.logger) return this.logger.info(`unwatch: ${this.filename}`);
    }
};

exports.Tail = Tail;
