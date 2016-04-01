Node DDP Client
===============

A callback style [DDP](https://github.com/meteor/meteor/blob/devel/packages/livedata/DDP.md) ([Meteor](http://meteor.com/)'s Distributed Data Protocol) node client, originally based alansikora's [node-js_ddp-client](https://github.com/alansikora/node-js_ddp-client) and Meteor's python client. Uses a more callback style approach.

The client implements version 1 of DDP, as well as fallbacks to pre1 and pre2.

Installation
============

```
  npm install ddp
```

Authentication
==============
Built-in authentication support was removed in ddp 0.7.0 due to changes in Meteor version 0.8.2.

DDP Authentication is now implemented by [vsivsi/ddp-login](https://github.com/vsivsi/ddp-login).

A quick and dirty (but insecure) alternative is to use plain-text logins via a method call:

```js
// logging in with e-mail
ddpclient.call("login", [
  { user : { email : "user@domain.com" }, password : "password" }
], function (err, result) { ... });

// logging in with username
ddpclient.call("login", [
  { user : { username : "username" }, password : "password" }
], function (err, result) { ... });
```


Example
=======

Please see the example in `examples/example.js`. Or here for reference:

```js
var DDPClient = require("ddp");

var ddpclient = new DDPClient({
  // All properties optional, defaults shown
  host : "localhost",
  port : 3000,
  ssl  : false,
  autoReconnect : true,
  autoReconnectTimer : 500,
  maintainCollections : true,
  ddpVersion : '1',  // ['1', 'pre2', 'pre1'] available
  // uses the SockJs protocol to create the connection
  // this still uses websockets, but allows to get the benefits
  // from projects like meteorhacks:cluster
  // (for load balancing and service discovery)
  // do not use `path` option when you are using useSockJs
  useSockJs: true,
  // Use a full url instead of a set of `host`, `port` and `ssl`
  // do not set `useSockJs` option if `url` is used
  url: 'wss://example.com/websocket'
});

/*
 * Connect to the Meteor Server
 */
ddpclient.connect(function(error, wasReconnect) {
  // If autoReconnect is true, this callback will be invoked each time
  // a server connection is re-established
  if (error) {
    console.log('DDP connection error!');
    return;
  }

  if (wasReconnect) {
    console.log('Reestablishment of a connection.');
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

  /*
   * Observe a collection.
   */
  var observer = ddpclient.observe("posts");
  observer.added = function(id) {
    console.log("[ADDED] to " + observer.name + ":  " + id);
  };
  observer.changed = function(id, oldFields, clearedFields, newFields) {
    console.log("[CHANGED] in " + observer.name + ":  " + id);
    console.log("[CHANGED] old field values: ", oldFields);
    console.log("[CHANGED] cleared fields: ", clearedFields);
    console.log("[CHANGED] new fields: ", newFields);
  };
  observer.removed = function(id, oldValue) {
    console.log("[REMOVED] in " + observer.name + ":  " + id);
    console.log("[REMOVED] previous value: ", oldValue);
  };
  setTimeout(function() { observer.stop() }, 6000);
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
 * You can also disable autoReconnect and
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

SockJS Mode
===============

By using the `useSockJs` option like below, DDP connection will use [SockJs](https://github.com/sockjs) protocol to establish the WebSocket connection.

```js
var ddpClient = new DDPClient({ useSockJs: true });
```

Meteor server uses SockJs to implement it's DDP server. With this mode, we can get the benefits provided by [meteorhacks:cluster](https://github.com/meteorhacks/cluster). Some of those are load balancing and service discovery.

* For load balancing you don't need to anything.
* For service discovery, just use the `path` option to identify the service you are referring to.

> With this mode, `path` option has a special meaning. So, thing twice before using `path` option when you are using this option.

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
