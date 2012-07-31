var DDPClient = require("../lib/ddp-client"); 

var ddpclient = new DDPClient({host: "localhost", port: 3000});

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