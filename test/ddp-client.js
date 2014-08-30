var assert = require('assert'),
    sinon  = require('sinon'),
    rewire = require('rewire'),
    events = require('events'),
    EJSON  = require('ddp-ejson');

var DDPClient = rewire("../lib/ddp-client");

var wsConstructor, wsMock;


function prepareMocks() {
  wsMock = new events.EventEmitter();

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
    assert.deepEqual(wsConstructor.args, [['ws://localhost:3000/websocket']]);
  });

  it('should connect to the provided host', function() {
    new DDPClient({'host': 'myserver.com'}).connect();
    assert.deepEqual(wsConstructor.args, [['ws://myserver.com:3000/websocket']]);
  });

  it('should connect to the provided host and port', function() {
    new DDPClient({'host': 'myserver.com', 'port': 42}).connect();
    assert.deepEqual(wsConstructor.args, [['ws://myserver.com:42/websocket']]);
  });

  it('should use ssl if the port is 443', function() {
    new DDPClient({'host': 'myserver.com', 'port': 443}).connect();
    assert.deepEqual(wsConstructor.args, [['wss://myserver.com:443/websocket']]);
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


describe('Collection maintenance', function() {
  var addedMessage    = '{"msg":"added","collection":"posts","id":"2trpvcQ4pn32ZYXco","fields":{"text":"A cat was here","value":true}}';
  var changedMessage  = '{"msg":"changed","collection":"posts","id":"2trpvcQ4pn32ZYXco","fields":{"text":"A dog was here"}}';
  var changedMessage2 = '{"msg":"changed","collection":"posts","id":"2trpvcQ4pn32ZYXco","cleared":["value"]}';
  var removedMessage  = '{"msg":"removed","collection":"posts","id":"2trpvcQ4pn32ZYXco"}';

  it('should maintain collections by default', function() {
    var ddpclient = new DDPClient();
    ddpclient._message(addedMessage);
    // ensure collections exist and are populated by add messages
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A cat was here");
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
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A cat was here");
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].value, true);
  });

  it('should response to "changed" messages', function() {
    var ddpclient = new DDPClient();
    ddpclient._message(addedMessage);
    ddpclient._message(changedMessage);
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A dog was here");
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].value, true);
  });

  it('should response to "changed" messages with "cleared"', function() {
    var ddpclient = new DDPClient();
    ddpclient._message(addedMessage);
    ddpclient._message(changedMessage);
    ddpclient._message(changedMessage2);
    assert.equal(ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].text, "A dog was here");
    assert(!ddpclient.collections.posts['2trpvcQ4pn32ZYXco'].hasOwnProperty('value'));
  });

  it('should response to "removed" messages', function() {
    var ddpclient = new DDPClient();
    ddpclient._message(addedMessage);
    ddpclient._message(removedMessage);
    assert(!ddpclient.collections.posts.hasOwnProperty('2trpvcQ4pn32ZYXco'));
  });
});
