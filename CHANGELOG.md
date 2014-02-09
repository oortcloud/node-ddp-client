0.4.4 - 2014-02-09

  - Fix a bug where if the server responded to an error on the first step of SRP authentication it was not handled correctly (i.e when the user is not found)

0.4.3 - 2013-12-19

  - Fix bug with socket reconnects tailspinning into an infinite loop (#30 by @jagill)
  - Fix bug when use_ejson was not always set properly by default. (#29 by @jagill)

0.4.2 - 2013-12-14
  - Use EJSON by default (#28)

0.4.1 - 2013-12-07
  - Ability to switch off collections monitoring

0.4.0 - 2013-12-07
  - Switched to faye-websockets (#26 by @jagill)

0.3.6 - 2013-11-07
  - fixed bug with default params when ignoring root certs (in case the machine doesn't have the cert)
  - Added DDP login with SRP authentication

0.3.5 - 2013-11-05
 - Added non strict SSL option in case of missing root certificates

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
