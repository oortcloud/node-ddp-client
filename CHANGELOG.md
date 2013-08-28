0.3.4 - 2013-08-28
 - added EJSON support (default is off) with a couple tests

0.3.3 - 2013-05-29
 - fixed bug where an exception could be thrown when sending a message on a socket that is not opened anymore (issue #18)
 - added some tests (work in progress)

0.3.2 - 2013-04-08
  - fixed bug where client would reconnect when closing (@tarangp)

0.3.1 - 2013-04-06
  - added a failed message to the connect callback if version negotiation fails.

0.3.0 - 2013-03-18
  - moved over to DDP-pre1