Node DDP Client
===============

A callback style DDP (meteor's distributed data protocol) node client.

Based _heavily_ on alansikora's [node-js_ddp-client](https://github.com/alansikora/node-js_ddp-client), and meteor's python client. Uses a more callback style approach.

Unfinished at this point, but should do most of what you want it to do.

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

var ddpclient = new DDPClient({host: "localhost", port: 3000});

ddpclient.on('connect', function() {
  console.log('connected!');
  
  ddpclient.call('test-function', ['foo', 'bar'], function(err, result) {
    console.log('called function, result: ' + result);
  })
  
  ddpclient.subscribe('posts', [], function() {
    console.log('posts complete:');
    console.log(ddpclient.collections.posts);
  })
});

ddpclient.on('close', function(code, message) {
	console.log("Close: [%s] %s", code, message);
	// Automatically reconnect
	ddpclient.connect();
});

ddpclient.on('error', function(error) {
	console.log("Error: %s", error);
	// Reconnect after 1 sec.
	setTimeout(function() { ddpclient.connect(); }, 1000);
});

// Useful for debugging
ddpclient.on('message', function(msg) {
	console.log("ddp message: " + msg);
	// You can also do cool stuff to the msg before it's processed.
});	

ddpclient.connect();
```

Thanks
======

Many thanks to Alan Sikora, and also Mike Bannister(@possibilities) for the initial ddp client.

Contributions:
 * Chris Mather (@eventedmind)
 * Thomas Sarlandie (@sarfata)