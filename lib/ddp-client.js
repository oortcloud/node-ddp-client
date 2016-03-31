"use strict";

var util = require("util");
var events = require("events");
var WebSocket = require("faye-websocket");
var EJSON = require("ddp-ejson");
var request = require('request');
var pathJoin = require('path').join;
var _ = require("ddp-underscore-patched");

var DDPClient = function(opts) {
  var self = this;

  opts = opts || {};

  // backwards compatibility
  if ("use_ssl" in opts)              { opts.ssl = opts.use_ssl; }
  if ("auto_reconnect" in opts)       { opts.autoReconnect = opts.auto_reconnect; }
  if ("auto_reconnect_timer" in opts) { opts.autoReconnectTimer = opts.auto_reconnect_timer; }
  if ("maintain_collections" in opts) { opts.maintainCollections = opts.maintain_collections; }
  if ("ddp_version" in opts)          { opts.ddpVersion = opts.ddp_version; }

  // default arguments
  self.host = opts.host || "localhost";
  self.port = opts.port || 3000;
  self.path = opts.path;
  self.ssl  = opts.ssl  || self.port === 443;
  self.tlsOpts = opts.tlsOpts || {};
  self.useSockJs = opts.useSockJs || false;
  self.autoReconnect = ("autoReconnect" in opts) ? opts.autoReconnect : true;
  self.autoReconnectTimer = ("autoReconnectTimer" in opts) ? opts.autoReconnectTimer : 500;
  self.maintainCollections = ("maintainCollections" in opts) ? opts.maintainCollections : true;
  self.url  = opts.url;
  // support multiple ddp versions
  self.ddpVersion = ("ddpVersion" in opts) ? opts.ddpVersion : "1";
  self.supportedDdpVersions = ["1", "pre2", "pre1"];

  // Expose EJSON object, so client can use EJSON.addType(...)
  self.EJSON = EJSON;

  // very very simple collections (name -> [{id -> document}])
  if (self.maintainCollections) {
    self.collections = {};
  }

  // internal stuff to track callbacks
  self._isConnecting = false;
  self._isReconnecting = false;
  self._nextId = 0;
  self._callbacks = {};
  self._updatedCallbacks = {};
  self._pendingMethods = {};
  self._observers = {};
};


DDPClient.ERRORS = {
  DISCONNECTED: new Error("DDPClient: Disconnected from DDP server")
};


/**
 * Inherits from EventEmitter
 */
util.inherits(DDPClient, events.EventEmitter);


DDPClient.prototype._prepareHandlers = function() {
  var self = this;

  self.socket.on("open", function() {
    // just go ahead and open the connection on connect
    self._send({
      msg : "connect",
      version : self.ddpVersion,
      support : self.supportedDdpVersions
    });
  });

  self.socket.on("error", function(error) {
    // error received before connection was established
    if (self._isConnecting) {
      self.emit("failed", error.message);
    }

    self.emit("socket-error", error);
  });

  self.socket.on("close", function(event) {
    self.emit("socket-close", event.code, event.reason);
    self._endPendingMethodCalls();
    self._recoverNetworkError();
  });

  self.socket.on("message", function(event) {
    self._message(event.data);
    self.emit("message", event.data);
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
  if (self.autoReconnect && ! self._connectionFailed && ! self._isClosing) {
    self._clearReconnectTimeout();
    self.reconnectTimeout = setTimeout(function() { self.connect(); }, self.autoReconnectTimer);
    self._isReconnecting = true;
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

  } else if (data.msg === "failed") {
    if (self.supportedDdpVersions.indexOf(data.version) !== -1) {
      this.ddpVersion = data.version;
      self.connect();
    } else {
      self.autoReconnect = false;
      self.emit("failed", "Cannot negotiate DDP version");
    }

  } else if (data.msg === "connected") {
    self.session = data.session;
    self.emit("connected");

  // method result
  } else if (data.msg === "result") {
    var cb = self._callbacks[data.id];

    if (cb) {
      cb(data.error, data.result);
      delete self._callbacks[data.id];
    }

  // method updated
  } else if (data.msg === "updated") {

    _.each(data.methods, function (method) {
      var cb = self._updatedCallbacks[method];
      if (cb) {
        cb();
        delete self._updatedCallbacks[method];
      }
    });

  // missing subscription
  } else if (data.msg === "nosub") {
    var cb = self._callbacks[data.id];

    if (cb) {
      cb(data.error);
      delete self._callbacks[data.id];
    }

  // add document to collection
  } else if (data.msg === "added") {
    if (self.maintainCollections && data.collection) {
      var name = data.collection, id = data.id;

      if (! self.collections[name])     { self.collections[name] = {}; }
      if (! self.collections[name][id]) { self.collections[name][id] = {}; }

      self.collections[name][id]._id = id;

      if (data.fields) {
        _.each(data.fields, function(value, key) {
          self.collections[name][id][key] = value;
        });
      }

      if (self._observers[name]) {
        _.each(self._observers[name], function(observer) {
          observer.added(id);
        });
      }
    }

  // remove document from collection
  } else if (data.msg === "removed") {
    if (self.maintainCollections && data.collection) {
      var name = data.collection, id = data.id;

      if (! self.collections[name][id]) {
        return;
      }

      var oldValue = self.collections[name][id];

      delete self.collections[name][id];

      if (self._observers[name]) {
        _.each(self._observers[name], function(observer) {
          observer.removed(id, oldValue);
        });
      }
    }

  // change document in collection
  } else if (data.msg === "changed") {
    if (self.maintainCollections && data.collection) {
      var name = data.collection, id = data.id;

      if (! self.collections[name])     { return; }
      if (! self.collections[name][id]) { return; }

      var oldFields     = {},
          clearedFields = data.cleared || [],
          newFields = {};

      if (data.fields) {
        _.each(data.fields, function(value, key) {
            oldFields[key] = self.collections[name][id][key];
            newFields[key] = value;
            self.collections[name][id][key] = value;
        });
      }

      if (data.cleared) {
        _.each(data.cleared, function(value) {
            delete self.collections[name][id][value];
        });
      }

      if (self._observers[name]) {
        _.each(self._observers[name], function(observer) {
          observer.changed(id, oldFields, clearedFields, newFields);
        });
      }
    }

  // subscriptions ready
  } else if (data.msg === "ready") {
    _.each(data.subs, function(id) {
      var cb = self._callbacks[id];
      if (cb) {
        cb();
        delete self._callbacks[id];
      }
    });

  // minimal heartbeat response for ddp pre2
  } else if (data.msg === "ping") {
    self._send(
      _.has(data, "id") ? { msg : "pong", id : data.id } : { msg : "pong" }
    );
  }
};


DDPClient.prototype._getNextId = function() {
  return (this._nextId += 1).toString();
};


DDPClient.prototype._addObserver = function(observer) {
  if (! this._observers[observer.name]) {
    this._observers[observer.name] = {};
  }
  this._observers[observer.name][observer._id] = observer;
};


DDPClient.prototype._removeObserver = function(observer) {
  if (! this._observers[observer.name]) { return; }

  delete this._observers[observer.name][observer._id];
};

//////////////////////////////////////////////////////////////////////////
// USER functions -- use these to control the client

/* open the connection to the server
 *
 *  connected(): Called when the 'connected' message is received
 *               If autoReconnect is true (default), the callback will be
 *               called each time the connection is opened.
 */
DDPClient.prototype.connect = function(connected) {
  var self = this;
  self._isConnecting = true;
  self._connectionFailed = false;
  self._isClosing = false;

  if (connected) {
    self.addListener("connected", function() {
      self._clearReconnectTimeout();

      connected(undefined, self._isReconnecting);
      self._isConnecting = false;
      self._isReconnecting = false;
    });
    self.addListener("failed", function(error) {
      self._isConnecting = false;
      self._connectionFailed = true;
      connected(error, self._isReconnecting);
    });
  }

  if (self.useSockJs) {
    self._makeSockJSConnection();
  } else {
    var url = self._buildWsUrl();
    self._makeWebSocketConnection(url);
  }
};

DDPClient.prototype._endPendingMethodCalls = function() {
  var self = this;
  var ids = _.keys(self._pendingMethods);
  self._pendingMethods = {};

  ids.forEach(function (id) {
    if (self._callbacks[id]) {
      self._callbacks[id](DDPClient.ERRORS.DISCONNECTED);
      delete self._callbacks[id];
    }

    if (self._updatedCallbacks[id]) {
      self._updatedCallbacks[id]();
      delete self._updatedCallbacks[id];
    }
  });
};

DDPClient.prototype._makeSockJSConnection = function() {
  var self = this;

  // do the info hit
  var protocol = self.ssl ? "https://" : "http://";
  var randomValue = "" + Math.ceil(Math.random() * 9999999);
  var path = pathJoin("/", self.path || "", "sockjs/info");
  var url = protocol + self.host + ":" + self.port + path;

  var requestOpts = { 'url': url, 'agentOptions': self.tlsOpts };

  request.get(requestOpts, function(err, res, body) {
    if (err) {
      self._recoverNetworkError();
    } else if (body) {
      var info;
      try {
        info = JSON.parse(body);
      } catch (e) {
        console.error(e);
      }
      if (!info || !info.base_url) {
        // no base_url, then use pure WS handling
        var url = self._buildWsUrl();
        self._makeWebSocketConnection(url);
      } else if (info.base_url.indexOf("http") === 0) {
        // base url for a different host
        var url = info.base_url + "/websocket";
        url = url.replace(/^http/, "ws");
        self._makeWebSocketConnection(url);
      } else {
        // base url for the same host
        var path = info.base_url + "/websocket";
        var url = self._buildWsUrl(path);
        self._makeWebSocketConnection(url);
      }
    } else {
      // no body. weird. use pure WS handling
      var url = self._buildWsUrl();
      self._makeWebSocketConnection(url);
    }
  });
};

DDPClient.prototype._buildWsUrl = function(path) {
  var self = this;
  var url;
  path = path || self.path || "websocket";
  var protocol = self.ssl ? "wss://" : "ws://";
  if (self.url && !self.useSockJs) {
    url = self.url;
  } else {
    url = protocol + self.host + ":" + self.port;
    url += (path.indexOf("/") === 0)? path : "/" + path;
  }
  return url;
};

DDPClient.prototype._makeWebSocketConnection = function(url) {
  var self = this;
  self.socket = new WebSocket.Client(url, null, self.tlsOpts);
  self._prepareHandlers();
};

DDPClient.prototype.close = function() {
  var self = this;
  self._isClosing = true;
  self.socket.close();
  self.removeAllListeners("connected");
  self.removeAllListeners("failed");
};


// call a method on the server,
//
// callback = function(err, result)
DDPClient.prototype.call = function(name, params, callback, updatedCallback) {
  var self = this;
  var id = self._getNextId();

  self._callbacks[id] = function () {
    delete self._pendingMethods[id];

    if (callback) {
      callback.apply(this, arguments);
    }
  };

  self._updatedCallbacks[id] = function () {
    delete self._pendingMethods[id];

    if (updatedCallback) {
      updatedCallback.apply(this, arguments);
    }
  };

  self._pendingMethods[id] = true;

  self._send({
    msg    : "method",
    id     : id,
    method : name,
    params : params
  });
};


DDPClient.prototype.callWithRandomSeed = function(name, params, randomSeed, callback, updatedCallback) {
  var self = this;
  var id = self._getNextId();

  if (callback) {
    self._callbacks[id] = callback;
  }

  if (updatedCallback) {
    self._updatedCallbacks[id] = updatedCallback;
  }

  self._send({
    msg        : "method",
    id         : id,
    method     : name,
    randomSeed : randomSeed,
    params     : params
  });
};

// open a subscription on the server, callback should handle on ready and nosub
DDPClient.prototype.subscribe = function(name, params, callback) {
  var self = this;
  var id = self._getNextId();

  if (callback) {
    self._callbacks[id] = callback;
  }

  self._send({
    msg    : "sub",
    id     : id,
    name   : name,
    params : params
  });

  return id;
};

DDPClient.prototype.unsubscribe = function(id) {
  var self = this;

  self._send({
    msg : "unsub",
    id  : id
  });
};

/**
 * Adds an observer to a collection and returns the observer.
 * Observation can be stopped by calling the stop() method on the observer.
 * Functions for added, changed and removed can be added to the observer
 * afterward.
 */
DDPClient.prototype.observe = function(name, added, changed, removed) {
  var self = this;
  var observer = {};
  var id = self._getNextId();

  // name, _id are immutable
  Object.defineProperty(observer, "name", {
    get: function() { return name; },
    enumerable: true
  });

  Object.defineProperty(observer, "_id", { get: function() { return id; }});

  observer.added   = added   || function(){};
  observer.changed = changed || function(){};
  observer.removed = removed || function(){};

  observer.stop = function() {
    self._removeObserver(observer);
  };

  self._addObserver(observer);

  return observer;
};

module.exports = DDPClient;
