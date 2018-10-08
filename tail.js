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

environment = process.env['NODE_ENV'] || 'development';

Tail = class Tail extends events.EventEmitter {

  readBlock() {
    if (this.logger) this.logger.info("<readBlock>");
    var block, stream;

    boundMethodCheck(this, Tail);

    if (this.queue.length >= 1) {
      block = this.queue[0];
      if (block.end > block.start)
      {
        stream = fs.createReadStream(this.filename, {
          flags: 'r', // 'rx' 'r+'
          encoding: this.encoding,
          start: block.start,
          end: block.end - 1,
          autoClose: true
        });

        stream.on('error', (error) => {
          if (this.logger) this.logger.info("<error>");
          if (this.logger) this.logger.error(`Tail error: ${error}`);
          return this.emit('error', error);
        });

        stream.on('end', () => {
          if (this.logger) this.logger.info("<end>");
          var x;
          x = this.queue.shift();
          if (this.queue.length > 0) this.internalDispatcher.emit("next");
          if (this.flushAtEOF && this.buffer.length > 0) {
            if (this.logger) this.logger.info("end line: " +"|" + this.buffer + "|");
            this.emit("line", this.buffer);
            return this.buffer = '';
          }
          if (this.logger) this.logger.info("end length: " + this.buffer.length + ( (this.buffer.length>0)?(" |" + this.buffer + "|"):""));
        });

        return stream.on('data', (data) => {
          if (this.logger) this.logger.info("<data>");
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
              if (this.logger) this.logger.info("data line: " + "|" + chunk + "|");
              results.push(this.emit("line", chunk));
            }
            return results;
          }
          if (this.logger) this.logger.info("data length: " + this.buffer.length + ( (this.buffer.length>0)?(" |" + this.buffer + "|"):""));
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
      fsWatchOptions: this.fsWatchOptions = {}, 
      encoding: this.encoding = "utf-8", 
      mode: this.mode = "", 
      flushAtEOF: this.flushAtEOF = false, 
      fromBeginning = false, 
      rememberLast: this.rememberLast = false, 
      maxBytes: this.maxBytes = 0, 
      separator: this.separator = /[\r]{0,1}\n/
    } = options);

    if (this.logger) {
      this.logger.info("<constructor>");
      this.logger.info(`fsWatchOptions: ${JSON.stringify(this.fsWatchOptions)}`);
      this.logger.info(`filename: ${this.filename}`);
      this.logger.info(`encoding: ${this.encoding}`);
      this.logger.info(`flushAtEOF: ${this.flushAtEOF}`);
      if (this.mode) this.logger.info(`mode: ${this.mode}`);
      if (this.mode) this.logger.info(`rememberLast: ${this.rememberLast}`);
      if (this.maxBytes) this.logger.info(`maxBytes: ${this.maxBytes}`);
      if (this.separator) this.logger.info(`separator: ${this.separator.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[^\x20-\x7E]/g, '_')}`);
    }

    this.online = true;
    this.buffer = '';
    this.internalDispatcher = new events.EventEmitter();
    this.queue = [];
    this.isWatching = false;
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
        // if (this.logger) this.logger.info("tick... interval: " + interval);
        if (!fs.existsSync(this.filename)) {
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
    if (this.logger) this.logger.info("<change>");
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
    if (stats.size < this.pos) { //scenario where texts is not appended but it's actually a w+
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

    if (this.logger) this.logger.info(`fromBeginning: ${fromBeginning}`);

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
    if (this.pos === 0) this.change(this.filename);

    if (this.logger) this.logger.info("following file: ", this.filename);

    return fs.watchFile(this.filename, this.fsWatchOptions, (curr, prev) => {
      return this.watchFileEvent(curr, prev);
    });
  }

  watchFileEvent(curr, prev) {
    if (this.logger) this.logger.info("---------------------------");
    if (this.logger) this.logger.info("prev: " + JSON.stringify({
      "dev": prev.dev,
      "ino": prev.ino,
      "size": prev.size
    }, null, 2));
    if (this.logger) this.logger.info("curr: " + JSON.stringify({
      "dev": curr.dev,
      "ino": curr.ino,
      "size": curr.size
    }, null, 2));
    // if (this.logger) this.logger.info("prev.ino: " + prev.ino+"");
    // if (this.logger) this.logger.info("curr.ino: " + curr.ino+"");
    
    if (curr.ino > 0) {
      if (!this.online) {
        if (this.logger) this.logger.info("'" + this.filename + "' has appeared, following new file");
        this.emit("reappears");
      }

      // 0 1 2 3 4 (=5)
      //
      // 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 (=20)
      //                     1  2  3  4  5  6  7  8  9  10
      //
      // 0 1 2 3 4 5 6 7 8 9 10 11 12 (=13)
      //           1 2 3 4 5 6  7  8  |9  10|
      //
      // 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 (=15)
      //           1 2 3 4 5 6  7  8  9  10
      //
      // 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 (=16)
      //             1 2 3 4 5  6  7  8  9  10
      
      if (curr.size > prev.size) {
        if ((this.buffer.length > 0) && !((prev.size - this.buffer.length) < 0)) {
          prev.size = prev.size - this.buffer.length;
          this.buffer = '';
        }

        var maxbytes = this.maxBytes || curr.size;
        if (this.logger) this.logger.info(`maxbytes: ${maxbytes}`);

        this.pos = curr.size;
        this.queue.push({
          start: ((curr.size - prev.size) > maxbytes) ? curr.size - maxbytes : prev.size, // prev.size,
          end: curr.size
        });
        if (this.queue.length === 1) return this.internalDispatcher.emit("next");
      }
      else {
        if (curr.size < prev.size) {
          this.pos = curr.size;
          this.queue = [];
          this.buffer = '';
          this.emit("truncated");
        } 
        else {
          if ((this.buffer.length > 0) && !((prev.size - this.buffer.length) < 0)) {
            prev.size = curr.size - this.buffer.length;
            this.buffer = '';

            this.pos = curr.size;
            this.queue.push({
              start: prev.size,
              end: curr.size
            });
            if (this.queue.length === 1) return this.internalDispatcher.emit("next");
          }
        }
      } 
    }
    else {
      if (this.online) {
        if (this.logger) this.logger.info("'" + this.filename + "' has become inaccessible: No such file or directory");
        this.emit("disappears");
      }
    }
    this.online = (curr.ino > 0);
  }

  unwatch() {
    if (this.logger) this.logger.info("<unwatch>");
    if (timer) clearInterval(timer);
    if (this.isWatching) fs.unwatchFile(this.filename);
    this.isWatching = false;
    this.queue = [];
    this.buffer = "";
    if (this.logger) return this.logger.info("unwatch: ", this.filename);
  }
};

exports.Tail = Tail;
