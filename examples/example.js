var DDPClient = require("../lib/ddp-client");

var ddpclient = new DDPClient({
  host: "localhost",
  port: 3000,
  /* optional: */
  auto_reconnect: true,
  auto_reconnect_timer: 500,
});

ddpclient.connect(function(error) {
  console.log('connected!');

  if (error) {
    console.log('DDP connection error!');
    return;
  }

  // Call a Meteor Method entitled 'test-function'
  ddpclient.call('test-function', ['foo', 'bar'], function(err, result) {
    if (err) console.log('METHOD ERROR: ', err);
    console.log('METHOD RESULTS: ', result);
  });

  // Subscribe to a Meteor Publication entitled 'posts'
  ddpclient.subscribe('posts', [], function() {
    console.log('\n\nSUBSCRIPTION READY:');
    console.log(ddpclient.collections.posts);
    console.log('\n\n');
  });
});

/*
 * Useful for debugging and learning the ddp protocol
 */
ddpclient.on('message', function(msg) {
  console.log("RECEIVED MESSAGE: " + msg + "\n");
});

/* 
 * If you need to do something specific on close or errors.
 * You can also disable auto_reconnect and 
 * call ddpclient.connect() when you are ready to re-connect.
*/
ddpclient.on('socket-close', function(code, message) {
  console.log("SOCKET CLOSE: %s %s", code, message);
});

ddpclient.on('socket-error', function(error) {
  console.log("SOCKET ERROR: %j", error);
});
