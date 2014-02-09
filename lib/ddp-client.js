var WebSocket = require('faye-websocket'),
    _ = require('underscore'),
    util = require('util'),
    events = require('events'),
    EJSON = require('meteor-ejson'),
    SRP = require('node-srp'),

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

  // add support for EJSON
  self.use_ejson = ('use_ejson' in opts) ? opts.use_ejson : true;

  // very very simple collections (name -> [{id -> document}])
  if (self.maintain_collections)
    self.collections = {};

  // internal stuff to track callbacks
  self._next_id = 0;
  self._callbacks = {};
};

/**
 * Inherits from EventEmitter
 */
util.inherits(DDPClient, events.EventEmitter);

DDPClient.prototype._prepareHandlers = function() {
  var self = this;

  self.socket.on('open', function() {
    // just go ahead and open the connection on connect
    var connectionPayload = {
      msg: 'connect',
      version: 'pre1',
      support: ['pre1']
    };

    // if reconnecting, try existing DDP session  
    // removed for now, per conversation with sixolet on IRC,
    // reconnect on server side still needs work 

    /*
    if (self.session) connectionPayload.session = self.session;
    */

    self._send(connectionPayload);
  });

  self.socket.on('error', function(error) {
    self.emit('socket-error', error);
  });

  self.socket.on('close', function(event) {
    self.emit('socket-close', event.code, event.reason);
    self._recoverNetworkError();
  });

  self.socket.on('message', function(event) {
    self.emit('message', event.data);

    self._message(event.data);
  });
};

DDPClient.prototype._clearReconnectTimeout = function() {
  var self = this;
  if (self.reconnectTimeout) {
    clearTimeout(self.reconnectTimeout);
    self.reconnectTimeout = null;
  }
}

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
  var self = this;

  if (self.use_ejson) {
    data = EJSON.stringify(data);
  } else {
    data = JSON.stringify(data);
  }

  this.socket.send(data);

};

// handle a message from the server
DDPClient.prototype._message = function(data) {
  var self = this;

  // XXX: In theory data could be a Buffer (for binary frames), perhaps when
  // there is streaming over DDP.  We should check that data is a String.
  if (self.use_ejson) {
    data = EJSON.parse(data);
  } else {
    data = JSON.parse(data);
  }

  // TODO: 'error'
  // TODO: 'updated'     -- not sure exactly what the point is here
  // TODO: 'addedBefore' -- not yet implemented in Meteor
  // TODO: 'movedBefore' -- not yet implemented in Meteor

  if (!data.msg) {
    return;

  } else if (data.msg === 'failed') {
    self.emit('failed', data);

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
  //XXX: These aren't in faye-websocket.  Are they still needed?
  //var options = self.use_ssl ? {rejectUnauthorized: self.use_ssl_strict} : {};
  //self.socket = new WebSocket.Client(protocol + self.host + ':' + self.port + '/' + self.path, options);
  self.socket = new WebSocket.Client(protocol + self.host + ':' + self.port + '/' + self.path);
  self._prepareHandlers();
};

DDPClient.prototype._login = function(loginParams, password, callback) {
  var self = this;

  var srp = new SRP.Client(password);  //put your password in here
  var initialRequest = srp.startExchange();
  initialRequest.user = loginParams;

  self.call('beginPasswordExchange', [initialRequest], function(err, result) {
    if(err) {
        callback(err);
        return;
    }
    
    var response = srp.respondToChallenge(result);
  
    self.call('login', [{ srp : response }], function (err, result) {

      if(err) {
        callback(err);
        return;
      }

      var conf = srp.verifyConfirmation({ HAMK : result.HAMK });

      if (conf) {
        callback(null);
      } else {
        callback({error:"The HAMK doesn't match. Possible MITM attack"});
      }

    });
  });
}

DDPClient.prototype.loginWithEmail = function(email, password, callback) {
  this._login({email: email}, password, callback);
}

DDPClient.prototype.loginWithUsername = function(username, password, callback) {
  this._login({username: username}, password, callback);
}

DDPClient.prototype.loginWithToken = function(token, callback) {
  var self = this;
  self.call("login", [{resume: token}], callback);
}

DDPClient.prototype.close = function() {
  var self = this;
  self._isClosing = true;
  self.socket.close();
};

// call a method on the server,
//
// callback = function(err, result)
DDPClient.prototype.call = function(name, params, callback) {
  var self = this;
  var id = self._nextId();

  if (callback)
    self._callbacks[id] = callback;

  self._send({msg: 'method', id: id, method: name, params: params});
};

// open a subscription on the server, callback should handle on ready and nosub
DDPClient.prototype.subscribe = function(name, params, callback) {
  var self = this;
  var id = self._nextId();

  if (callback)
    self._callbacks[id] = callback;

  self._send({msg: 'sub', id: id, name: name, params: params});
};

DDPClient.prototype.unsubscribe = function(id) {
  var self = this;

  self._send({msg: 'unsub', id: id});
};

module.exports = DDPClient;
