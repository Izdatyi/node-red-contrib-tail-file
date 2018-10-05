// based on:
// lucagrulla/node-tail
// https://github.com/lucagrulla/node-tail

var Tail, environment, events, fs,
  boundMethodCheck = function (instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new Error('Bound instance method accessed before binding');
    }
  };

events = require("events");

fs = require('fs');

environment = process.env['NODE_ENV'] || 'development';

Tail = class Tail extends events.EventEmitter {

  readBlock() {
    var block, stream;

    boundMethodCheck(this, Tail);

    if (this.queue.length >= 1) {
      block = this.queue[0];
      if (block.end > block.start) {
        stream = fs.createReadStream(this.filename, {
          start: block.start,
          end: block.end - 1,
          encoding: this.encoding
        });

        stream.on('error', (error) => {
          if (this.logger) this.logger.error(`Tail error: ${error}`);
          return this.emit('error', error);
        });

        stream.on('end', () => {
          var x;
          x = this.queue.shift();
          if (this.queue.length > 0) this.internalDispatcher.emit("next");
          if (this.flushAtEOF && this.buffer.length > 0) {
            this.emit("line", this.buffer);
            return this.buffer = '';
          }
        });

        return stream.on('data', (data) => {
          var chunk, i, len, parts, results;
          if (this.separator === null) {
            return this.emit("line", data);
          } else {
            this.buffer += data;
            parts = this.buffer.split(this.separator);
            this.buffer = parts.pop();
            results = [];
            for (i = 0, len = parts.length; i < len; i++) {
              chunk = parts[i];
              results.push(this.emit("line", chunk));
            }
            return results;
          }
        });
      }
    }
  }

  constructor(filename, options = {}) {
    var fromBeginning;
    super(filename, options);
    this.readBlock = this.readBlock.bind(this);
    this.filename = filename;

    ({
      separator: this.separator = /[\r]{0,1}\n/,
      fsWatchOptions: this.fsWatchOptions = {},
      fromBeginning = false,
      logger: this.logger,
      flushAtEOF: this.flushAtEOF = false,
      encoding: this.encoding = "utf-8"
    } = options);

    if (this.logger) {
      this.logger.info("<constructor>");
      this.logger.info(`filename: ${this.filename}`);
      this.logger.info(`encoding: ${this.encoding}`);
    }

    this.online = true;
    this.buffer = '';
    this.internalDispatcher = new events.EventEmitter();
    this.queue = [];
    this.isWatching = false;
    this.internalDispatcher.on('next', () => {
      return this.readBlock();
    });
    this.watch(fromBeginning);
  }

  watch(fromBeginning) {
    var err, stats;

    if (this.isWatching) return;

    if (this.logger) this.logger.info(`enable watch. fromBeginning: ${fromBeginning}`);

    this.isWatching = true;

    try {
      stats = fs.statSync(this.filename);
    }
    catch (error1) {
      err = error1;
      if (this.logger) this.logger.error(`watch for ${this.filename} failed: ${err}`);
      this.emit("error", `watch for ${this.filename} failed: ${err}`);
      return;
    }

    this.pos = fromBeginning ? 0 : stats.size;

    if (this.logger) this.logger.info("following file: ", this.filename);

    return fs.watchFile(this.filename, this.fsWatchOptions, (curr, prev) => {
      return this.watchFileEvent(curr, prev);
    });
  }

  watchFileEvent(curr, prev) {
    if (curr.ino > 0) {
      if (!this.online) {
        if (this.logger) this.logger.info("'" + this.filename + "' has appeared, following new file");
        this.emit("error", "'" + this.filename + "' has appeared, following new file");
      }
    } else {
      if (this.online) {
        if (this.logger) this.logger.info("'" + this.filename + "' has become inaccessible: No such file or directory");
        this.emit("error", "'" + this.filename + "' has become inaccessible: No such file or directory");
      }
    }
    this.online = (curr.ino > 0);

    if (curr.size > prev.size) {
      this.pos = curr.size;
      this.queue.push({
        start: prev.size,
        end: curr.size
      });
      if (this.queue.length === 1) return this.internalDispatcher.emit("next");
    }
  }

  unwatch() {
    if (this.watcher) {
      this.watcher.close();
    } else {
      fs.unwatchFile(this.filename);
    }
    this.isWatching = false;
    this.queue = [];
    if (this.logger) return this.logger.info("unwatch: ", this.filename);
  }
};

exports.Tail = Tail;
