var assert = require('assert'),
    sinon = require('sinon'),
    rewire = require('rewire'),
    events = require('events');

var DDPClient = rewire("../lib/ddp-client");

var wsConstructor, wsMock;

function prepareMocks() {
  wsMock = new events.EventEmitter();

  wsConstructor = sinon.stub();
  wsConstructor.returns(wsMock);
  DDPClient.__set__('WebSocket', wsConstructor);
}


describe("Connect to remote server", function() {
  beforeEach(function() {
    prepareMocks();
  });

  it('should connect to localhost by default', function() {
    new DDPClient().connect();

    assert(wsConstructor.calledOnce);
    assert(wsConstructor.calledWithNew());
    assert(wsConstructor.call)
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


  /* I am not sure why this test does not work. Something I am not doing well
     with clock.tick() - I am leaving it here, hoping to understand why sometime soon...

  it('should reconnect when the connection fails', function() {
    var clock = sinon.useFakeTimers();

    var ddpclient = new DDPClient();

    ddpclient.connect();
    wsMock.emit('error', {});

    // At this point, the constructor should have been called only once.
    assert(wsConstructor.calledOnce);

    // Wait 501 ms
    clock.tick(501);

    // Now the constructor should have been called twice
    console.log("Constructor called: %s time(s)", wsConstructor.callCount);
    assert(wsConstructor.calledTwice);

    clock.restore();
  });
  */
});
