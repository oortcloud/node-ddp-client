var assert = require('assert'),
    sinon  = require('sinon'),
    rewire = require('rewire'),
    events = require('events'),
    EJSON  = require('ddp-ejson');

var DDPClient = rewire("../lib/ddp-client");

var wsConstructor, wsMock;


function prepareMocks() {
  wsMock = new events.EventEmitter();
  wsMock.close = sinon.stub();

  wsConstructor = sinon.stub();
  wsConstructor.returns(wsMock);
  DDPClient.__set__('WebSocket', { Client: wsConstructor });
}


describe("Connect to remote server", function() {
  beforeEach(function() {
    prepareMocks();
  });

  it('should connect to localhost by default', function() {
    new DDPClient().connect();

    assert(wsConstructor.calledOnce);
    assert(wsConstructor.calledWithNew());
    assert(wsConstructor.call);
    assert.deepEqual(wsConstructor.args, [['ws://localhost:3000/websocket', null, {}]]);
  });

  it('should connect to the provided host', function() {
    new DDPClient({'host': 'myserver.com'}).connect();
    assert.deepEqual(wsConstructor.args, [['ws://myserver.com:3000/websocket', null, {}]]);
  });

  it('should connect to the provided host and port', function() {
    new DDPClient({'host': 'myserver.com', 'port': 42}).connect();
    assert.deepEqual(wsConstructor.args, [['ws://myserver.com:42/websocket', null, {}]]);
  });

  it('should use ssl if the port is 443', function() {
    new DDPClient({'host': 'myserver.com', 'port': 443}).connect();
    assert.deepEqual(wsConstructor.args, [['wss://myserver.com:443/websocket', null, {}]]);
  });

  it('should propagate tls options if specified', function() {
    var tlsOpts = {
      'ca': ['fake_pem_content']
    }
    new DDPClient({'host': 'myserver.com', 'port': 443, 'tlsOpts': tlsOpts}).connect();
    assert.deepEqual(wsConstructor.args, [['wss://myserver.com:443/websocket', null, tlsOpts]]);
  });

  it('should connect to the provided url', function() {
    new DDPClient({'url': 'wss://myserver.com/websocket'}).connect();
    assert.deepEqual(wsConstructor.args, [['wss://myserver.com/websocket', null, {} ]]);
  });

  it('should fallback to sockjs if url and useSockJs:true are provided', function() {
    var ddpclient = new DDPClient({'url': 'wss://myserver.com/websocket', 'useSockJs': true});
    ddpclient._makeSockJSConnection = sinon.stub();
    ddpclient.connect();
    assert.ok(ddpclient._makeSockJSConnection.called);
  });

  it('should clear event listeners on close', function(done) {
    var ddpclient = new DDPClient();
    var callback = sinon.stub();

    ddpclient.connect(callback);
    ddpclient.close();
    ddpclient.connect(callback);

    setTimeout(function() {
      assert.equal(ddpclient.listeners('connected').length, 1);
      assert.equal(ddpclient.listeners('failed').length, 1);
      done();
    }, 15);
  });

  it('should call the connection callback when connection is established', function(done) {
    var ddpclient = new DDPClient();
    var callback = sinon.spy();

    ddpclient.connect(callback);
    wsMock.emit('message', { data: '{ "msg": "connected" }' });

    setTimeout(function() {
      assert(callback.calledWith(undefined, false));
      done();
    }, 15);
  });

  it('should pass socket errors occurring during connection to the connection callback', function(done) {
    var ddpclient = new DDPClient();
    var callback = sinon.spy();

    var socketError = "Network error: ws://localhost:3000/websocket: connect ECONNREFUSED";

    ddpclient.connect(callback);
    wsMock.emit('error', { message: socketError });

    setTimeout(function() {
      assert(callback.calledWith(socketError, false));
      done();
    }, 15);
  });
});


describe('Automatic reconnection', function() {
  beforeEach(function() {
    prepareMocks();
  });

  /* We should be able to get this test to work with clock.tick() but for some weird
     reasons it does not work. See: https://github.com/cjohansen/Sinon.JS/issues/283
   */
  it('should reconnect when the connection fails', function(done) {
    var ddpclient = new DDPClient({ autoReconnectTimer: 10 });

    ddpclient.connect();
    wsMock.emit('close', {});

    // At this point, the constructor should have been called only once.
    assert(wsConstructor.calledOnce);

    setTimeout(function() {
      // Now the constructor should have been called twice
      assert(wsConstructor.calledTwice);
      done();
    }, 15);
  });

  it('should reconnect only once when the connection fails rapidly', function(done) {
    var ddpclient = new DDPClient({ autoReconnectTimer: 5 });

    ddpclient.connect();
    wsMock.emit('close', {});
    wsMock.emit('close', {});
    wsMock.emit('close', {});

    // At this point, the constructor should have been called only once.
    assert(wsConstructor.calledOnce);

    setTimeout(function() {
      // Now the constructor should have been called twice
      assert(wsConstructor.calledTwice);
      done();
    }, 15);
  });

  it('should save currently running method calls', function() {
    var ddpclient = new DDPClient();
    ddpclient._getNextId = sinon.stub().returns('_test');
    ddpclient._send = Function.prototype;

    ddpclient.connect();
    ddpclient.call();

    assert("_test" in ddpclient._pendingMethods)
  });

  it('should remove id when callback is called', function() {
    var ddpclient = new DDPClient();
    ddpclient._getNextId = sinon.stub().returns('_test');
    ddpclient._send = Function.prototype;

    ddpclient.connect();
    ddpclient.call();

    assert("_test" in ddpclient._pendingMethods)

    ddpclient._callbacks._test();
    assert(!("_test" in ddpclient._pendingMethods))
  });

  it('should remove id when updated-callback is called', function() {
    var ddpclient = new DDPClient();
    ddpclient._getNextId = sinon.stub().returns('_test');
    ddpclient._send = Function.prototype;

    ddpclient.connect();
    ddpclient.call();

    assert("_test" in ddpclient._pendingMethods)

    ddpclient._updatedCallbacks._test();
    assert(!("_test" in ddpclient._pendingMethods))
  });

  it('should end method calls which could not be completed', function() {
    var ddpclient = new DDPClient();
    var callback = sinon.spy();
    var updatedCallback = sinon.spy();

    ddpclient._pendingMethods = { _test: true };
    ddpclient._callbacks = { _test: callback };
    ddpclient._updatedCallbacks = { _test: updatedCallback };

    ddpclient.connect();
    ddpclient.socket.emit('close', {});

    assert(callback.calledOnce);
    assert(callback.calledWithExactly(DDPClient.ERRORS.DISCONNECTED));

    assert(updatedCallback.calledOnce);

    // callbacks should be removed after calling them
    assert(!("_test" in ddpclient._callbacks));
    assert(!("_test" in ddpclient._updatedCallbacks));
    assert(!("_test" in ddpclient._pendingMethods));
  });
});


describe('EJSON', function() {
  var DDPMessage = '{"msg":"added","collection":"posts","id":"2trpvcQ4pn32ZYXco","fields":{"date":{"$date":1371591394454},"bindata":{"$binary":"QUJDRA=="}}}';
  var EJSONObject = EJSON.parse(DDPMessage);

  it('should expose the EJSON object', function(done) {
    var ddpclient = new DDPClient();

    assert(ddpclient.EJSON);
    assert(ddpclient.EJSON.addType);

    done();
  });

  it('should decode binary and dates', function(done) {
    var ddpclient = new DDPClient({ use_ejson : true });

    ddpclient._message(DDPMessage);

    assert.deepEqual(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].date, new Date(1371591394454));

    assert.deepEqual(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].bindata, new Uint8Array([65, 66, 67, 68]));

    ddpclient.socket = {};
    ddpclient.socket.send = function (opts) {
      assert(opts.indexOf("date")          !== -1);
      assert(opts.indexOf("$date")         !== -1);
      assert(opts.indexOf("1371591394454") !== -1);

      assert(opts.indexOf("bindata")       !== -1);
      assert(opts.indexOf("$binary")       !== -1);
      assert(opts.indexOf("QUJDRA==")      !== -1);
    };

    ddpclient._send(EJSONObject.fields);

    done();
  });

});


describe('Collection maintenance and observation', function() {
  var addedMessage    = '{"msg":"added","collection":"posts","id":"2trpvcQ4pn32ZYXco","fields":{"text":"A cat was here","value":true}}';
  var changedMessage  = '{"msg":"changed","collection":"posts","id":"2trpvcQ4pn32ZYXco","fields":{"text":"A dog was here"}}';
  var changedMessage2 = '{"msg":"changed","collection":"posts","id":"2trpvcQ4pn32ZYXco","cleared":["value"]}';
  var removedMessage  = '{"msg":"removed","collection":"posts","id":"2trpvcQ4pn32ZYXco"}';
  var observer;

  it('should maintain collections by default', function() {
    var ddpclient = new DDPClient(), observed = false;
    observer = ddpclient.observe("posts");
    observer.added = function(id) { if (id === '2trpvcQ4pn32ZYXco') observed = true; }

    ddpclient._message(addedMessage);
    // ensure collections exist and are populated by add messages
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A cat was here");
    assert(observed, "addition observed");
  });

  it('should maintain collections if maintainCollections is true', function() {
    var ddpclient = new DDPClient({ maintainCollections : true });
    ddpclient._message(addedMessage);
    // ensure collections exist and are populated by add messages
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A cat was here");
  });

  it('should not maintain collections if maintainCollections is false', function() {
    var ddpclient = new DDPClient({ maintainCollections : false });
    ddpclient._message(addedMessage);
    // ensure there are no collections
    assert(!ddpclient.collections);
  });

  it('should response to "added" messages', function() {
    var ddpclient = new DDPClient();
    ddpclient._message(addedMessage);
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco']._id, "2trpvcQ4pn32ZYXco");
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A cat was here");
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].value, true);
  });

  it('should response to "changed" messages', function() {
    var ddpclient = new DDPClient(), observed = false;
    observer = ddpclient.observe("posts");
    observer.changed = function(id, oldFields, clearedFields, newFields) {
      if (id === "2trpvcQ4pn32ZYXco"
        && oldFields.text === "A cat was here"
        && newFields.text === "A dog was here") {
        observed = true;
      }
    };

    ddpclient._message(addedMessage);
    ddpclient._message(changedMessage);
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A dog was here");
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].value, true);
    assert(observed, "field change observed");
  });

  it('should response to "changed" messages with "cleared"', function() {
    var ddpclient = new DDPClient(), observed = false;
    observer = ddpclient.observe("posts");
    observer.changed = function(id, oldFields, clearedFields) {
      if (id === "2trpvcQ4pn32ZYXco" && clearedFields.length === 1 && clearedFields[0] === "value") {
        observed = true;
      }
    };

    ddpclient._message(addedMessage);
    ddpclient._message(changedMessage);
    ddpclient._message(changedMessage2);
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A dog was here");
    assert(!ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].hasOwnProperty('value'));
    assert(observed, "cleared change observed")
  });

  it('should response to "removed" messages', function() {
    var ddpclient = new DDPClient(), oldval;
    observer = ddpclient.observe("posts");
    observer.removed = function(id, oldValue) { oldval = oldValue; };

    ddpclient._message(addedMessage);
    ddpclient._message(removedMessage);
    assert(!ddpclient.collections.posts.hasOwnProperty('2trpvcQ4pn32ZYXco'));
    assert(oldval, "Removal observed");
    assert.equal(oldval.text, "A cat was here");
    assert.equal(oldval.value, true);
  });
});


describe("SockJS", function() {
  it("should use direct WS connection if there is a path", function() {
    var ddpclient = new DDPClient();
    ddpclient._makeWebSocketConnection = sinon.stub();
    ddpclient.connect();

    assert.ok(ddpclient._makeWebSocketConnection.called);
  });

  it("should fallback to sockjs if there useSockJS option", function() {
    var ddpclient = new DDPClient({ useSockJs: true });
    ddpclient._makeSockJSConnection = sinon.stub();
    ddpclient.connect();

    assert.ok(ddpclient._makeSockJSConnection.called);
  });

  describe("after info hit", function() {
    var request = require("request");
    it("should connect to the correct url", function(done) {
      var get = function(opts, callback) {
        assert.equal(opts.url, "http://the-host:9000/sockjs/info");
        done();
      };

      WithRequestGet(get, function() {
        var opts = {
          host: "the-host",
          port: 9000
        };
        var ddpclient = new DDPClient(opts);
        ddpclient._makeSockJSConnection();
      });
    });

    it("should support custom paths", function(done) {
      var get = function(opts, callback) {
        assert.equal(opts.url, "http://the-host:9000/search/sockjs/info");
        done();
      };

      WithRequestGet(get, function() {
        var opts = {
          host: "the-host",
          port: 9000,
          path: "search"
        };
        var ddpclient = new DDPClient(opts);
        ddpclient._makeSockJSConnection();
      });
    });

    it("should retry if there is an error", function() {
      var error = { message: "error" };
      var get = function(opts, callback) {
        callback(error);
      };

      WithRequestGet(get, function() {
        var ddpclient = new DDPClient();
        ddpclient._recoverNetworkError = sinon.stub();
        ddpclient._makeSockJSConnection();
        assert.ok(ddpclient._recoverNetworkError.called);
      });
    });

    it("should use direct WS if there is no body", function() {
      var info = null;
      var get = function(opts, callback) {
        callback(null, null, info);
      };

      WithRequestGet(get, function() {
        var ddpclient = new DDPClient();
        ddpclient._makeWebSocketConnection = sinon.stub();
        ddpclient._makeSockJSConnection();

        var wsUrl = "ws://localhost:3000/websocket";
        assert.ok(ddpclient._makeWebSocketConnection.calledWith(wsUrl));
      });
    });

    it("should use direct WS if there is no base_url", function() {
      var info = '{}';
      var get = function(opts, callback) {
        callback(null, null, info);
      };

      WithRequestGet(get, function() {
        var ddpclient = new DDPClient();
        ddpclient._makeWebSocketConnection = sinon.stub();
        ddpclient._makeSockJSConnection();

        var wsUrl = "ws://localhost:3000/websocket";
        assert.ok(ddpclient._makeWebSocketConnection.calledWith(wsUrl));
      });
    });

    it("should use full base url if it's starts with http", function() {
      var info = '{"base_url": "https://somepath"}';
      var get = function(opts, callback) {
        callback(null, null, info);
      };

      WithRequestGet(get, function() {
        var ddpclient = new DDPClient();
        ddpclient._makeWebSocketConnection = sinon.stub();
        ddpclient._makeSockJSConnection();

        var wsUrl = "wss://somepath/websocket";
        assert.ok(ddpclient._makeWebSocketConnection.calledWith(wsUrl));
      });
    });

    it("should compute url based on the base_url if it's not starts with http", function() {
      var info = '{"base_url": "/somepath"}';
      var get = function(opts, callback) {
        callback(null, null, info);
      };

      WithRequestGet(get, function() {
        var ddpclient = new DDPClient();
        ddpclient._makeWebSocketConnection = sinon.stub();
        ddpclient._makeSockJSConnection();

        var wsUrl = "ws://localhost:3000/somepath/websocket";
        assert.ok(ddpclient._makeWebSocketConnection.calledWith(wsUrl));
      });
    });

    it("should propagate tls options", function(done) {
      var tlsOpts = {'ca': ['fake_pem_content']};
      var get = function(opts, callback) {
        assert.equal(opts.agentOptions, tlsOpts);
        done();
      };

      WithRequestGet(get, function() {
        var opts = {
          host: "the-host",
          port: 9000,
          path: "search",
          tlsOpts: tlsOpts
        };
        var ddpclient = new DDPClient(opts);
        ddpclient._makeSockJSConnection();
      });
    });
  });
});

function WithRequestGet(getFn, fn) {
  var request = require("request");
  var originalGet = request.get;
  request.get = getFn;

  fn();

  request.get = originalGet;
}
