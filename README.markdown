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
var DDPClient = require("ddpclient-callbacks"); 

var ddpclient = new DDPClient("localhost", 3000);

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
```

Thanks
======

Many thanks to Alan Sikora, and also Mike Bannister(@possibilities).
