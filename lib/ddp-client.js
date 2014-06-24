var WebSocket = require('faye-websocket'),
    _ = require('ddp-underscore-patched'),
    util = require('util'),
    events = require('events'),
    EJSON = require('ddp-ejson'),

DDPClient = function(opts) {
  var self = this;

  // default arguments
  opts = opts || {};
  self.host = opts.host || 'localhost';
  self.port = opts.port || 3000;
  self.path = opts.path || 'websocket';
  self.use_ssl = opts.use_ssl || self.port === 443;
  self.auto_reconnect = ('auto_reconnect' in opts) ? opts.auto_reconnect : true;
  self.auto_reconnect_timer = ('auto_reconnect_timer' in opts) ? opts.auto_reconnect_timer : 500;
  self.maintain_collections = ('maintain_collections' in opts) ? opts.maintain_collections : true;

  //May not work with faye-websockets
  self.use_ssl_strict = ('use_ssl_strict' in opts) ? opts.use_ssl_strict : true;

  // support multiple ddp versions
  self.ddp_version = ('ddp_version' in opts) ? opts.ddp_version : 'pre2';
  self.supported_ddp_versions = ['pre2', 'pre1'];

  // Expose EJSON object, so client can use EJSON.addType(...)
  self.EJSON = EJSON;

  // very very simple collections (name -> [{id -> document}])
  if (self.maintain_collections)
    self.collections = {};

  // internal stuff to track callbacks
  self._next_id = 0;
  self._callbacks = {};
  self._updatedCallbacks = {};
};

/**
 * Inherits from EventEmitter
 */
util.inherits(DDPClient, events.EventEmitter);


DDPClient.prototype._prepareHandlers = function() {
  var self = this;

  self.socket.on('open', function() {
    // just go ahead and open the connection on connect
    self._send({ 
      msg: 'connect',
      version: self.ddp_version,
      support: self.supported_ddp_versions
    });
  });

  self.socket.on('error', function(error) {
    self.emit('socket-error', error);
  });

  self.socket.on('close', function(event) {
    self.emit('socket-close', event.code, event.reason);
    self._recoverNetworkError();
  });

  self.socket.on('message', function(event) {
    self._message(event.data);
    self.emit('message', event.data);
  });
};

DDPClient.prototype._clearReconnectTimeout = function() {
  var self = this;
  if (self.reconnectTimeout) {
    clearTimeout(self.reconnectTimeout);
    self.reconnectTimeout = null;
  }
};

DDPClient.prototype._recoverNetworkError = function() {
  var self = this;
  if (self.auto_reconnect && ! self._connectionFailed && ! self._isClosing) {
    self._clearReconnectTimeout();
    self.reconnectTimeout = setTimeout(function() { self.connect(); }, self.auto_reconnect_timer);
  }
};

///////////////////////////////////////////////////////////////////////////
// RAW, low level functions
DDPClient.prototype._send = function(data) {
  this.socket.send(
    EJSON.stringify(data)
  );
};

// handle a message from the server
DDPClient.prototype._message = function(data) {
  var self = this;

  data = EJSON.parse(data);

  // TODO: 'addedBefore' -- not yet implemented in Meteor
  // TODO: 'movedBefore' -- not yet implemented in Meteor

  if (!data.msg) {
    return;

  } else if (data.msg === 'failed') {
    if (self.supported_ddp_versions.indexOf(data.version) !== -1) {
      this.ddp_version = data.version;
      self.connect();
    } else {
      self.auto_reconnect = false;
      self.emit('error', 'cannot negotiate ddp version');
    }

  } else if (data.msg === 'connected') {
    self.session = data.session;
    self.emit('connected');

  // method result
  } else if (data.msg === 'result') {
    var cb = self._callbacks[data.id];

    if (cb) {
      cb(data.error, data.result);
      delete self._callbacks[data.id];
    }

  // method updated
  } else if (data.msg === 'updated') {

    _.each(data.methods, function (method) {
      var cb = self._updatedCallbacks[method];
      if (cb) {
        cb();
        delete self._updatedCallbacks[method];
      }
    });

  // missing subscription
  } else if (data.msg === 'nosub') {
    var cb = self._callbacks[data.id];

    if (cb) {
      cb(data.error);
      delete self._callbacks[data.id];
    }

  // add document to collection
  } else if (data.msg === 'added') {
    if (self.maintain_collections && data.collection) {
      var name = data.collection, id = data.id;

      if (!self.collections[name])
        self.collections[name] = {};
      if (!self.collections[name][id])
        self.collections[name][id] = {};

      if (data.fields) {
        _.each(data.fields, function(value, key) {
          self.collections[name][id][key] = value;
        });
      }
    }

  // remove document from collection
  } else if (data.msg === 'removed') {
    if (self.maintain_collections && data.collection) {
      var name = data.collection, id = data.id;

      if (!self.collections[name][id])
        return;

      delete self.collections[name][id];
    }

  // change document in collection
  } else if (data.msg === 'changed') {
    if (self.maintain_collections && data.collection) {
      var name = data.collection, id = data.id;

      if (!self.collections[name]) return;
      if (!self.collections[name][id]) return;

      if (data.fields) {
        _.each(data.fields, function(value, key) {
            self.collections[name][id][key] = value;
        });
      }

      if (data.cleared) {
        _.each(data.cleared, function(value) {
            delete self.collections[name][id][value];
        });
      }
    }

  // subscriptions ready
  } else if (data.msg === 'ready') {
    _.each(data.subs, function(id) {
      var cb = self._callbacks[id];
      if (cb) {
        cb();
        delete self._callbacks[id];
      }
    });

  // minimal heartbeat response for ddp pre2
  } else if (data.msg === 'ping') {
    self._send(
      _.has(data, 'id') ? { msg : 'pong', id : data.id } : { msg : 'pong' }
    );
  }
};


DDPClient.prototype._nextId = function() {

  return (this._next_id += 1).toString();
};


//////////////////////////////////////////////////////////////////////////
// USER functions -- use these to control the client

/* open the connection to the server
 * 
 *  connected(): Called when the 'connected' message is received
 *               If auto_reconnect is true (default), the callback will be 
 *               called each time the connection is opened.
 */
DDPClient.prototype.connect = function(connected) {
  var self = this;
  self._connectionFailed = false;
  self._isClosing = false;

  if (connected) {
    self.addListener("connected", function() {
      self._clearReconnectTimeout();
      connected();
    });
    self.addListener("failed", function(error) {
      self._connectionFailed = true;
      connected(error);
    });
  }

  // websocket
  var protocol = self.use_ssl ? 'wss://' : 'ws://';
  self.socket = new WebSocket.Client(protocol + self.host + ':' + self.port + '/' + self.path);
  self._prepareHandlers();
};

DDPClient.prototype.close = function() {
  var self = this;
  self._isClosing = true;
  self.socket.close();
};

// call a method on the server,
//
// callback = function(err, result)
DDPClient.prototype.call = function(name, params, callback, updatedCallback) {
  var self = this;
  var id = self._nextId();

  if (callback)
    self._callbacks[id] = callback;

  if (updatedCallback)
    self._updatedCallbacks[id] = updatedCallback;    

  self._send({msg: 'method', id: id, method: name, params: params});
};

DDPClient.prototype.callWithRandomSeed = function(name, params, randomSeed, callback, updatedCallback) {
  var self = this;
  var id = self._nextId();

  if (callback)
    self._callbacks[id] = callback;

  if (updatedCallback)
    self._updatedCallbacks[id] = updatedCallback;    

  self._send({msg: 'method', id: id, method: name, randomSeed: randomSeed, params: params});
};

// open a subscription on the server, callback should handle on ready and nosub
DDPClient.prototype.subscribe = function(name, params, callback) {
  var self = this;
  var id = self._nextId();

  if (callback)
    self._callbacks[id] = callback;

  self._send({msg: 'sub', id: id, name: name, params: params});

  return id;
};

DDPClient.prototype.unsubscribe = function(id) {
  var self = this;

  self._send({msg: 'unsub', id: id});
};

module.exports = DDPClient;
