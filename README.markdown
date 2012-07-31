Node DDP Client
===============

A callback style DDP (meteor's distributed data protocol) node client.

Based _heavily_ on alansikora's [node-js_ddp-client](https://github.com/alansikora/node-js_ddp-client), and meteor's python client.

Unfinished at this point, but should do most of what you want it to do.

Example
=======

Please see the example in `examples/example.js`. Or here for reference:

```js
var DDPClient = require("ddp-client"); 

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
