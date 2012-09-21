var WebSocket = require('ws');
var _ = require('underscore');

DDPClient = function(opts) {
  var self = this;
  
  // default arguments
  self.host = opts.host || 'localhost';
  self.port = opts.port || 3000;
  self.path = opts.path || 'websocket';
  self.use_ssl = opts.use_ssl || self.port === 443;
  
  // very very simple collections (name -> [{id -> document}])
  self.collections = {};
  
  // internal stuff to track callbacks
  self._next_id = 0;
  self._callbacks = {};
}

DDPClient.prototype._prepareHandlers = function() {
  var self = this;
  
  // just go ahead and open the connection on connect
  self.socket.on('open', function() {
    self._send({msg: 'connect'});
  });
  
  // all messages go to the handler
  self.socket.on('message', function(data, flags) {
    self._message(data, flags);
  });
}


///////////////////////////////////////////////////////////////////////////
// RAW, low level functions
DDPClient.prototype._send = function(data) {
  
  this.socket.send(JSON.stringify(data));
}

// handle a message from the server
DDPClient.prototype._message = function(data, flags) {
  var self = this;
  var data = JSON.parse(data);
  
  
  // TODO: 'error'
  // TODO -- method acks <- not sure exactly what the point is here
  
  if (!data.msg) {
    return;
    
  } else if (data.msg === 'connected') {
    if (self._callbacks.connected)
      self._callbacks.connected();
  
  // method result
  } else if (data.msg === 'result') {
    var cb = self._callbacks[data.id];
    
    if (cb) {
      cb(data.error, data.result);
      delete self._callbacks[data.id]
    }
  
  // missing subscription
  } else if (data.msg === 'nosub') {
    var cb = self._callbacks[data.id];
    
    if (cb) {
      cb(data.error);
      delete self._callbacks[data.id]
    }
    
  } else if (data.msg === 'data') {
    
    if (data.collection) {
      self._updateCollection(data);
      
    // subscription complete
    } else if (data.subs) {
      
      _.each(data.subs, function(id) { 
        var cb = self._callbacks[id];
        if (cb) {
          cb();
          delete self._callbacks[id]
        }
      });
    }
    
  }
}

DDPClient.prototype._nextId = function() {
  
  return (this._next_id += 1).toString();
}

DDPClient.prototype._updateCollection = function(data) {
  var self = this;
  
  var name = data.collection, id = data.id;
  
  if (!self.collections[name])
    self.collections[name] = {};
  if (!self.collections[name][id])
    self.collections[name][id] = {}
  
  if (data.set) {
    _.each(data.set, function(value, key) {
      self.collections[name][id][key] = value;
    });
  }
  if (data.unset) {
    _.each(data.unset, function(value) {
      delete self.collections[name][id][value];
    });
  }
  
  // clean up
  if (self.collections[name][id] === {})
    delete self.collections[name][id];
}


//////////////////////////////////////////////////////////////////////////
// USER functions -- use these to control the client

// open the connection to the server
DDPClient.prototype.connect = function(callback) {
  var self = this;
  
  if (callback)
    self._callbacks.connected = callback;
  
  // websocket
  var protocol = self.use_ssl ? 'wss://' : 'ws://';
  self.socket = new WebSocket(protocol + self.host + ':' + self.port + '/' + self.path);
  self._prepareHandlers();
}

DDPClient.prototype.close = function() {
  var self = this;
  
  self.socket.close();
}

// call a method on the server,
//
// callback = function(err, result)
DDPClient.prototype.call = function(name, params, callback) {
  var self = this;
  var id = self._nextId()
  
  if (callback)
    self._callbacks[id] = callback;
  
  self._send({msg: 'method', id: id, method: name, params: params});
}

// open a subscription on the server, callback should handle on ready and nosub
DDPClient.prototype.subscribe = function(name, params, callback) {
  var self = this;
  var id = self._nextId()
  
  if (callback)
    self._callbacks[id] = callback;
  
  self._send({msg: 'sub', id: id, name: name, params: params});
}

module.exports = DDPClient;