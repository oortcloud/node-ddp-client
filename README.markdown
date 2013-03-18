Node DDP Client
===============

A callback style DDP ([Meteor](http://meteor.com/)'s Distributed Data Protocol) node client.

Based _heavily_ on alansikora's [node-js_ddp-client](https://github.com/alansikora/node-js_ddp-client), and meteor's python client. Uses a more callback style approach.

The client implements the pre1 version of DDP. It is unfinished at this point, but should do most of what you want it to do.

Installation
============

```
  npm install ddp
```

Example
=======

Please see the example in `examples/example.js`. Or here for reference:

```js
var DDPClient = require("ddp");

var ddpclient = new DDPClient({
    host: "localhost", 
    port: 3000,
    /* optional: */
    auto_reconnect: true,
    auto_reconnect_timer: 500
  });

ddpclient.connect(function() {
  console.log('connected!');
  
  ddpclient.call('test-function', ['foo', 'bar'], function(err, result) {
    console.log('called function, result: ' + result);
  })
  
  ddpclient.subscribe('posts', [], function() {
    console.log('posts complete:');
    console.log(ddpclient.collections.posts);
  })
});

/*
 * Useful for debugging and learning the ddp protocol
 */
ddpclient.on('message', function(msg) {
	console.log("ddp message: " + msg);
});	

/* 
 * If you need to do something specific on close or errors.
 * (You can also disable auto_reconnect and call ddpclient.connect()
 *  when you are ready to re-connect.)
*/
ddpclient.on('socket-close', function(code, message) {
  console.log("Close: %s %s", code, message);
});
ddpclient.on('socket-error', function(error) {
  console.log("Error: %j", error);
});
```

Unimplemented Features
====
* Server to Client messages
  * 'addedBefore'
  * 'movedBefore'
  * 'error'
  * 'updated'
* EJSON support



Thanks
======

Many thanks to Alan Sikora, and also Mike Bannister(@possibilities) for the initial ddp client.

Contributions:
 * Chris Mather (@eventedmind)
 * Thomas Sarlandie (@sarfata)