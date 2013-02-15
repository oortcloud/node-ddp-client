var DDPClient = require("../lib/ddp-client"); 

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

/* Last but not least - Actually start the connection */
ddpclient.connect();
