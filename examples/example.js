var DDPClient = require("../lib/ddp-client");

var ddpclient = new DDPClient({
  host: "localhost",
  port: 3000,
  /* optional: */
  auto_reconnect: true,
  auto_reconnect_timer: 500,
  use_ejson: true  // default is false
});

ddpclient.connect(function(error) {
  console.log('connected!');

  if (error) {
    console.log('DDP connection error!');
    return;
  }

  ddpclient.call('test-function', ['foo', 'bar'], function(err, result) {
    console.log('called function, result: ' + result);
  });

  ddpclient.subscribe('posts', [], function() {
    console.log('posts complete:');
    console.log(ddpclient.collections.posts);
  });
});

/*
 * Useful for debugging and learning the ddp protocol
 */
ddpclient.on('message', function(msg) {
  console.log("ddp message: " + msg);
});

/* 
 * If you need to do something specific on close or errors.
 * You can also disable auto_reconnect and 
 * call ddpclient.connect() when you are ready to re-connect.
*/
ddpclient.on('socket-close', function(code, message) {
  console.log("Close: %s %s", code, message);
});

ddpclient.on('socket-error', function(error) {
  console.log("Error: %j", error);
});
