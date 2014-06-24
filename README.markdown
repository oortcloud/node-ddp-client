Node DDP Client
===============

A callback style [DDP](https://github.com/meteor/meteor/blob/devel/packages/livedata/DDP.md) ([Meteor](http://meteor.com/)'s Distributed Data Protocol) node client, originally based alansikora's [node-js_ddp-client](https://github.com/alansikora/node-js_ddp-client) and Meteor's python client. Uses a more callback style approach.

The client implements the pre1 and pre2 versions of DDP.

Installation
============

```
  npm install ddp
```

Authentication
==============
Built-in authentication support was removed in ddp 0.7.0 due to changes in Meteor version 0.8.2. If you need authentication, try https://github.com/vsivsi/ddp-login.


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
  auto_reconnect_timer: 500,
  use_ssl: false,
  maintain_collections: true // Set to false to maintain your own collections.
});

/*
 * Connect to the Meteor Server
 */
ddpclient.connect(function(error) {
  // If auto_reconnect is true, this callback will be invoked each time
  // a server connection is re-established
  if (error) {
    console.log('DDP connection error!');
    return;
  }

  console.log('connected!');

  setTimeout(function () {
    /*
     * Call a Meteor Method
     */
    ddpclient.call(
      'deletePosts',             // name of Meteor Method being called
      ['foo', 'bar'],            // parameters to send to Meteor Method
      function (err, result) {   // callback which returns the method call results
        console.log('called function, result: ' + result);
      },
      function () {              // callback which fires when server has finished
        console.log('updated');  // sending any updated documents as a result of
        console.log(ddpclient.collections.posts);  // calling this method
      }
    );
  }, 3000);

  /*
   * Call a Meteor Method while passing in a random seed.
   * Added in DDP pre2, the random seed will be used on the server to generate
   * repeatable IDs. This allows the same id to be generated on the client and server
   */
  var Random = require("ddp-random"),
      random = Random.createWithSeeds("randomSeed");  // seed an id generator

  ddpclient.callWithRandomSeed(
    'createPost',              // name of Meteor Method being called
    [{ _id : random.id(),      // generate the id on the client
      body : "asdf" }],
    "randomSeed",              // pass the same seed to the server
    function (err, result) {   // callback which returns the method call results
      console.log('called function, result: ' + result);
    },
    function () {              // callback which fires when server has finished
      console.log('updated');  // sending any updated documents as a result of
      console.log(ddpclient.collections.posts);  // calling this method
    }
  );

  /*
   * Subscribe to a Meteor Collection
   */
  ddpclient.subscribe(
    'posts',                  // name of Meteor Publish function to subscribe to
    [],                       // any parameters used by the Publish function
    function () {             // callback when the subscription is complete
      console.log('posts complete:');
      console.log(ddpclient.collections.posts);
    }
  );
});

/*
 * Useful for debugging and learning the ddp protocol
 */
ddpclient.on('message', function (msg) {
  console.log("ddp message: " + msg);
});

/*
 * Close the ddp connection. This will close the socket, removing it
 * from the event-loop, allowing your application to terminate gracefully
 */
ddpclient.close();

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

/*
 * You can access the EJSON object used by ddp.
 */
var oid = new ddpclient.EJSON.ObjectID();
```

Unimplemented Features
====
The node DDP client does not implement ordered collections, something that while in the DDP spec has not been implemented in Meteor yet.

Thanks
======

Many thanks to Alan Sikora for the ddp-client which formed the inspiration for this code.

Contributions:
 * Tom Coleman (@tmeasday)
 * Thomas Sarlandie (@sarfata)
 * Mason Gravitt (@emgee3)
 * Mike Bannister (@possiblities)
 * Chris Mather (@eventedmind)
 * James Gill (@jagill)
 * Vaughn Iverson (@vsivsi)
