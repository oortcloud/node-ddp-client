var DDPClient = require("../lib/ddp-client");

var ddpclient = new DDPClient({
  // All properties optional, defaults shown
  host : "localhost",
  port : 3000,
  path : "websocket",
  ssl  : false,
  autoReconnect : true,
  autoReconnectTimer : 500,
  maintainCollections : true,
  ddpVersion : '1'  // ['1', 'pre2', 'pre1'] available
});

/*
 * Connect to the Meteor Server
 */
ddpclient.connect(function(error) {
  // If autoReconnect is true, this callback will be invoked each time
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
