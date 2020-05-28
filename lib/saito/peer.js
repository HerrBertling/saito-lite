const io = require('socket.io-client');
const saito = require('./saito');

class Peer {

  constructor(app, peerjson = "") {

    this.app = app || {};

    this.peer 				= {};
    this.peer.host 			= "localhost";
    this.peer.port 			= "12101";
    this.peer.publickey 		= "";
    this.peer.version       = "";
    this.peer.protocol 			= "http";
    this.peer.synctype 			= "full";         // full = full blocks
							  // lite = lite blocks

    this.peer.initiator			= 0;		  // default non-initiator

    this.peer.receiveblks		= 1;
    this.peer.receivetxs 		= 1;
    this.peer.receivegts 		= 1;

    this.peer.modules			= [];
    this.peer.sendblks 			= 1;
    this.peer.sendtxs 			= 1;
    this.peer.sendgts 			= 1;
    this.peer.minfee			= 0.001;	  // minimum propagation fee

    this.peer.endpoint = {};
    this.peer.endpoint.host 		= "localhost";
    this.peer.endpoint.port 		= "12101";
    this.peer.endpoint.publickey 	= "";
    this.peer.endpoint.protocol 	= "http";

    this.peer.name = "";

    this.peer.keylist 			= [];
    this.handshake			= this.returnHandshake();
    this.handshake_completed            = 0;

    //
    // queue to prevent flooding
    //
    this.message_queue = [];
    this.message_queue_speed = 1000;             // sent
    this.message_queue_timer = null;

    //
    // track events
    //
    this.events_active = 0;

    //
    // lite-client configuration
    //
    if (this.app.SPVMODE == 1 || this.app.BROWSER == 1) {
      this.peer.synctype = "lite";
      this.handshake.peer.synctype      	= "lite";
      this.handshake.peer.receiveblks		= 1;
      this.handshake.peer.receivetxs		= 0;
      this.handshake.peer.receivegts		= 0;
    }

    if (peerjson != "") {
      let peerobj = JSON.parse(peerjson);

      if (peerobj.peer.endpoint == null) {
        peerobj.peer.endpoint 		= {};
        peerobj.peer.endpoint.host 	= peerobj.peer.host;
        peerobj.peer.endpoint.port 	= peerobj.peer.port;
        peerobj.peer.endpoint.protocol 	= peerobj.peer.protocol;
      }

      this.peer = peerobj.peer;

      //
      // handshake reset every time
      //
      this.peer.handshake;

    }

  }




  initialize() {

    //
    // manage blockchain sync queue
    //
    this.message_queue_timer = setInterval(() => {
      if (this.message_queue.length > 0) {
        if (this.message_queue.length > 10) { this.message_queue = this.message_queue.splice(10); }
        if (this.socket != null) {
          if (this.socket.connected == true) {
            this.socket.emit('request', this.message_queue[0]);
            this.message_queue.splice(0, 1);
          }
        }
      }
    }, this.message_queue_speed);

  }





  isConnected() {
    if (this.socket != null) {
      if (this.socket.connected == true) { return true; }
    }
    return false;
  }




  returnHandshake() {

    let handshake 			= {};
        handshake.step			= 0;
        handshake.ts 			= new Date().getTime();
        handshake.attempts 		= 0;
        handshake.complete 		= 0;
        handshake.challenge_mine  	= Math.random();
        handshake.challenge_peer  	= "";
        handshake.challenge_proof  	= "";
        handshake.challenge_verified	= 0;

        handshake.peer			= {}; // my info
        handshake.peer.host		= "";
        handshake.peer.port		= "";
        handshake.peer.protocol   = "";
        handshake.peer.endpoint   = {};
        handshake.peer.publickey  = this.app.wallet.returnPublicKey();
        handshake.peer.publickey  	= this.app.wallet.returnPublicKey();
        handshake.peer.version   	= this.app.wallet.wallet.version;
        handshake.peer.synctype		= "full";

        handshake.peer.sendblks		= 1;
        handshake.peer.sendtxs		= 1;
        handshake.peer.sendgts		= 1;

        handshake.peer.receiveblks = 1;
        handshake.peer.receivetxs	 = 1;
        handshake.peer.receivegts	 = 1;

        handshake.modules 		     = this.app.modules.mods.map(mod => mod.name);

        // for (let i = 0; i < this.app.modules.mods.length; i++) {
        //   handshake.modules.push(this.app.modules.mods[i].name);
        // }

        handshake.peer.keylist		= [];

        handshake.blockchain		= {};
        handshake.blockchain.last_bid   = this.app.blockchain.last_bid;
        handshake.blockchain.last_ts    = this.app.blockchain.last_ts;
        handshake.blockchain.last_bsh   = this.app.blockchain.last_bsh;
        handshake.blockchain.last_bf    = this.app.blockchain.last_bf;
        handshake.blockchain.fork_id    = this.app.blockchain.fork_id;
        handshake.blockchain.genesis_bid= this.app.blockchain.genesis_bid;

        if (this.app.server) {
          handshake.peer.endpoint = this.app.server.server.endpoint;
        }

        handshake.peer.keylist = this.app.keys.returnWatchedPublicKeys();
        handshake.peer.keylist.push(this.app.wallet.returnPublicKey());

        if (this.app.BROWSER == 0) {
          let { name, host, port, protocol }  = this.app.options.server;
          handshake.peer.name     = name;
          handshake.peer.host 		= host;
          handshake.peer.port 		= port;
          handshake.peer.protocol = protocol;
        }

    return handshake;

  }



  returnPublicKey() {
    return this.peer.publickey;
  }




  connect(mode=0) {

    //
    // we are starting an outbound connection
    //
    if (mode == 0) {

      this.peer.initiator = 1;

      if (this.socket) {
        try {
          this.socket.destroy();
        } catch (err) {
          console.log(err);
        }
        delete this.socket;
        this.socket = null;
      }

      this.socket = io({
        reconnection: true,
        reconnectionDelay: 5000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 120,
        transports: ['websocket']
      });

console.log("CONNECTING TO: " + this.peer.protocol + " -- " + this.peer.host + " -- " + this.peer.port);
      this.socket = io.connect(`${this.peer.protocol}://${this.peer.host}:${this.peer.port}`);

      this.addSocketEvents();

    }


    //
    // we have received a connection message (handshake)
    //
    if (mode == 1) {
      this.addSocketEvents();
    }

  }


  sendRequest(message, data="") {

    //
    // respect prohibitions
    //
    if (this.peer.sendblks == 0 && message == "block") { return; }
    if (this.peer.sendblks == 0 && message == "blockchain") { return; }
    if (this.peer.sendtxs == 0 && message == "transaction") { return; }
    if (this.peer.sendgts == 0 && message == "golden ticket") { return; }


    // find out initial state of peer and blockchain
    var um = {};
        um.request = message;
        um.data = data;

    if (this.socket != null) {
      if (this.socket.connected == true) {
        this.socket.emit('request', JSON.stringify(um));
      } else {
        this.message_queue.push(JSON.stringify(um));
        return;
      }
    }
  }

  sendRequestWithCallback(message, data = "", mycallback) {
    //
    // respect prohibitions
    //
    if (this.peer.sendblks == 0 && message == "block") { return; }
    if (this.peer.sendblks == 0 && message == "blockchain") { return; }
    if (this.peer.sendtxs == 0 && message == "transaction") { return; }
    if (this.peer.sendgts == 0 && message == "golden ticket") { return; }

    // find out initial state of peer and blockchain
    var um = {};
        um.request = message;
        um.data = data;

    if (this.socket != null) {
      if (this.socket.connected == true) {
        this.socket.emit('request', JSON.stringify(um), function(res) {
	  mycallback(res);
        });
        return;
      } else {
        this.message_queue.push(JSON.stringify(um));
        tmperr = { err: "message queued for broadcast" };
        mycallback(JSON.stringify(tmperr));
        return;
      }
    }
  }





  addSocketEvents() {

    this.events_active = 1;

    try {

      //
      // connect
      //
      this.socket.on('connect', () => {

        //
        // initiate handshake
        //
	if (this.handshake.step < 1) { 
          this.handshake.step               = 1;
        }
        this.handshake.ts                 = new Date().getTime();
        this.handshake.attempts++;

        this.handshake.blockchain            = {};
        this.handshake.blockchain.last_bid   = this.app.blockchain.last_bid;
        this.handshake.blockchain.last_ts    = this.app.blockchain.last_ts;
        this.handshake.blockchain.last_bsh   = this.app.blockchain.last_bsh;
        this.handshake.blockchain.last_bf    = this.app.blockchain.last_bf;
        this.handshake.blockchain.fork_id    = this.app.blockchain.fork_id;
        this.handshake.blockchain.genesis_bid= this.app.blockchain.genesis_bid;

console.log("SENDING LAST BSH: " + this.handshake.blockchain.last_bsh);
console.log("send peershake: " + JSON.stringify(this.handshake));

        this.sendRequest("handshake", this.handshake);

        //if (this.app.BROWSER == 1) { salert('Socket Connect'); }

        //
        // inform event channel
        //
        this.app.connection.emit('connection_up', this);
        this.app.wallet.rebroadcastPendingTransactions();

      });




      //
      // disconnect
      //
      this.socket.on('disconnect', () => {
        this.app.connection.emit('connection_down', this);
        this.app.connection.emit('peer_disconnect', this);
      });

      this.socket.on('reconnect', () => {
        //
        // initiate handshake
        //
        this.handshake.step               = 1;
        this.handshake.ts                 = new Date().getTime();
        this.handshake.attempts++;

        this.handshake.blockchain            = {};
        this.handshake.blockchain.last_bid   = this.app.blockchain.last_bid;
        this.handshake.blockchain.last_ts    = this.app.blockchain.last_ts;
        this.handshake.blockchain.last_bsh   = this.app.blockchain.last_bsh;
        this.handshake.blockchain.last_bf    = this.app.blockchain.last_bf;
        this.handshake.blockchain.fork_id    = this.app.blockchain.fork_id;
        this.handshake.blockchain.genesis_bid= this.app.blockchain.genesis_bid;

        this.sendRequest("handshake", this.handshake);

        //
        // inform event channel
        //
        this.app.connection.emit('connection_up', this);
        this.app.wallet.rebroadcastPendingTransactions();
      });

      this.socket.on('reconnect', () => {

        this.app.connection.emit('connection_up', this);

	//
	//
	//

      });

      //
      // non-saito events
      //
      this.socket.on('event', () => { });


      //
      // saito events
      //
      this.socket.on('request', async (data, mycallback = null) => {

        if (data === undefined) { 
          console.log("ERROR 012482: received undefined data from peer.");
          return;
        }

        let message = JSON.parse(data.toString());

        switch(message.request) {
          case 'handshake':
            this.handleHandshakeRequest(message);
            break;
          case 'block':
            this.handleBlockRequest(message);
            break;
          case 'missing block':
            this.handleMissingBlockRequest(message, mycallback);
            break;
          case 'blockchain':
            this.handleBlockchainRequest(message);
            break;
          case 'transaction':
            this.handleTransactionRequest(message, mycallback);
            break;
          // case 'golden ticket':
          //   this.handleGoldenTicketRequest(message);
          //   break;
          case 'keylist':
            this.handleKeylistRequest(message);
            break;
          default:

            //
            // if the attached data is a transaction, ensure MSG field exists
            //
            // transaction.msg included for backwards compatibility
            //
            if (message.data) {
              if (message.data.transaction) {
                if (message.data.transaction.m) {
		  // backwards compatible - in case modules try the old fashioned way
                  message.data.transaction.msg = JSON.parse(this.app.crypto.base64ToString(message.data.transaction.m));
                  message.data.msg = message.data.transaction.msg;
		  // non-backwards compatible
                  //message.data.msg = JSON.parse(this.app.crypto.base64ToString(message.data.transaction.m));
                }
              }
            }


            this.app.modules.handlePeerRequest(message, this, mycallback);
            break;
/*
          case 'offchain':
            this.handleOffchainRequest();
            break;
          case 'connect-sig':
            this.handleConnectSigRequest(message);
            break;
          case 'connect-deny':
            this.socket = null;
            this.app.network.cleanupDisconnectedSocket(this);
            break;
          case 'slip check':
            this.handleSlipCheckRequest(message, mycallback);
            break;
          case 'slip check multiple':
            this.handleSlipCheckMultipleRequest(message, mycallback);
            break;
          case 'dns':
            this.handleDNSRequest(message, mycallback);
            break;
          case 'dns multiple':
            this.handleDNSMultipleRequest(message, mycallback);
            break;
*/
        }
      });

    } catch(err) {
      console.error("ERROR 581023: error handling peer request - " + err);
    }
  }



  handleKeylistRequest(message) {
    if (this.handshake_completed == 0) { return; }
    this.peer.keylist = message.data;
    console.log("UPDATED KEYLIST: " + JSON.stringify(this.peer.keylist));
  }


  handleHandshakeRequest(message) {

    let peershake = message.data;

    if (this.handshake.attempts > 10) {

      //
      // TODO - give up on pointlessly bad connection (!)
      //

    }

    if (this.peer.modules == undefined) { this.peer.modules = []; }
    for (let i = 0; i < peershake.modules.length; i++) {
      if (!this.peer.modules.includes(peershake.modules[i])) {
        this.peer.modules.push(peershake.modules[i]);
      }
    }

    //
    // basic peer data
    //
    this.peer.receiveblks = peershake.peer.sendblks;
    this.peer.receivetxs = peershake.peer.sendtxs;
    this.peer.receivegts = peershake.peer.sendgts;

    // this.peer.sendblks		= peershake.peer.receiveblks;
    this.peer.sendtxs = peershake.peer.receivetxs;
    this.peer.sendgts = peershake.peer.receivegts;

    if (this.peer.publickey == "") {
      this.peer.publickey = peershake.peer.publickey;
    }

    this.peer.host = peershake.peer.host;
    this.peer.port = peershake.peer.port;
    this.peer.protocol = peershake.peer.protocol;
    this.peer.synctype = peershake.peer.synctype
    this.peer.endpoint = peershake.peer.endpoint;
    this.peer.keylist = peershake.peer.keylist;
    this.peer.name = peershake.peer.name;

    //
    // browsers get lite-client
    //
    if (this.app.BROWSER == 1) { 
      this.peer.synctype = "lite";
      // refresh the browser if I am handshaking with a higher versioned peer.
      // right now we are assuming peers are truthful.
      // TODO - don't assume this
      if (this.app.wallet.wallet.version < peershake.peer.version) {
        window.location = window.location;
      }
    }
    //
    // verification sigs
    //
    if (this.handshake.challenge_proof == "" && peershake.challenge_mine != "") {
      this.handshake.challenge_peer = peershake.challenge_mine;
      this.handshake.challenge_proof = this.app.crypto.signMessage("_" + this.handshake.challenge_peer, this.app.wallet.returnPrivateKey());
    }

    if (this.handshake.challenge_mine != "" && peershake.challenge_proof != "" && this.handshake.challenge_verified == 0) {

      // 
      // TODO
      //
      // this accepts publickey at face value, what about endpoint or hostile peer swap?
      //
      if (this.app.crypto.verifyMessage("_" + this.handshake.challenge_mine, peershake.challenge_proof, peershake.peer.publickey) == 0) {

      } else {

        this.peer.publickey = peershake.peer.publickey;
        this.handshake.challenge_verified = 1;

      }

      // we have verified all necessary info, send event
      this.app.connection.emit("handshake_complete", this);
      this.handshake_completed = 1;

      // rebroadcast pending
      this.app.wallet.rebroadcastPendingTransactions(this);

    }


    //
    // check blockchain
    //
    let peer_last_bsh = peershake.blockchain.last_bsh;
    let peer_last_bid = peershake.blockchain.last_bid;
    let peer_forkid = peershake.blockchain.fork_id;
    let peer_genesis_bid = peershake.blockchain_genesis_bid;

    // 
    // if peer is ahead of me, let modules know latest block
    //
    let my_last_bid = this.app.blockchain.last_bid;

    //
    // TODO
    //
    // progress bar 
    //
    //if (peer_last_bid > my_last_bid) {
    //  this.app.options.blockchain.target_bid = peer_last_bid;
    //  this.app.modules.updateBlockchainSync(my_last_bid, peer_last_bid);
    //} else {
    ///  this.app.modules.updateBlockchainSync(my_last_bid, my_last_bid);
    //}

    //
    // figure out last common block
    //
console.log("PEERSHAKE: " + JSON.stringify(peershake));
console.log(peer_forkid + "/" + peer_last_bid + " <-----" + peer_last_bsh);

//PEERSHAKE: {"step":3,"ts":1590594915567,"attempts":1,"complete":0,"challenge_mine":0.8046976877193528,"challenge_peer":0.6741413954537729,"challenge_proof":"5d7Fkfijbcpx7xUCQTgSUdt5oZc7zogqjdCcJRD1iDir18mLAWG37UT8cc5vmz9pEBBNb1oP77mFLzQf3KiQ5DVA","challenge_verified":1,"peer":{"host":"","port":"","protocol":"","endpoint":{},"publickey":"21BsNUBKPifdMsQJjvREbMbatmX9SBhoY5sVYLofqyx1L","version":3.208,"synctype":"lite","sendblks":1,"sendtxs":1,"sendgts":1,"receiveblks":1,"receivetxs":0,"receivegts":0,"keylist":["21BsNUBKPifdMsQJjvREbMbatmX9SBhoY5sVYLofqyx1L","21BsNUBKPifdMsQJjvREbMbatmX9SBhoY5sVYLofqyx1L","21BsNUBKPifdMsQJjvREbMbatmX9SBhoY5sVYLofqyx1L"]},"modules":["Arcade","Archive","Balance","Chess","Chat","Debug","Email","Encrypt","Forum","MyQRCode","QRScanner","Pandemic","Poker","Profile","Relay","Registry","Scotland","Settings","Solitrio","Tutorial","Twilight","Wordblocks","Website"],"blockchain":{"last_bid":6,"last_ts":1590594912320,"last_bsh":"f1dccaf8afbe6d24420186ddbe907004c6e583bcdaa1aeea139307089ff9c43a","last_bf":10.99161169525393,"fork_id":"","genesis_bid":0}}


    let last_shared_bid = this.app.blockchain.returnLastSharedBlockId(peer_forkid, peer_last_bid);
    if (last_shared_bid === 0) {
console.log("calculating last_shared_bid from last_shared_bsh");
      last_shared_bid = this.app.blockchain.bsh_bid_hmap[peer_last_bsh];
      if (last_shared_bid > 0) {} else { last_shared_bid = 0; }
    }

console.log("LAST SHARED BID: " + last_shared_bid);

    if (my_last_bid > last_shared_bid) {

      if (peer_last_bid - my_last_bid > this.app.blockchain.genesis_period && peer_last_bid != 0 && this.peer.synctype == "full") {

        //
        // TODO - don't exit - fully off chain
        //
        console.log("ERROR 184023: peer reports us as fully off-chain with same gp");
        process.exit();

      } else {


       //
        // if our remote peer is behind us
        //
        if ((this.app.BROWSER == 0 && peer_last_bid < my_last_bid)) {

          //
          // lite-client -- even if last_shared_bid is 0 because the
          // fork_id situation is wrong, we will send them everything
          // from the latest block they request -- this avoids lite-clients
          // that pop onto the network but do not stick around long-enough
          // to generate a fork ID from being treated as new lite-clients
          // and only sent the last 10 blocks.
          //
console.log(last_shared_bid + " -- " + peer_last_bid + " --- " + my_last_bid);
          if (last_shared_bid == 0 && peer_last_bid > 0 && (peer_last_bid - last_shared_bid > 9)) {
            if (peer_last_bid - 10 < 0) { peer_last_bid = 0; } else { peer_last_bid = peer_last_bid - 10; }
	    //
 	    // added Friday, April 10
	    //
console.log("A: " + peershake.step);
	    if (peershake.step >= 3) {
              this.sendBlockchain(peer_last_bid, message.data.peer.synctype);
	    }
          } else {
	    //
 	    // added Friday, April 10
	    //
console.log("B: " + peershake.step);
	    if (peershake.step >= 3) {
              this.sendBlockchain(last_shared_bid, message.data.peer.synctype);
            }
          }

        } else {

          //
          // peer ahead of us
          //

        }
      }
    }

    //
    // increment a step and fire back our handshake if step <= 3
    //
    if (this.handshake.step >= peershake.step) {
      this.handshake.attempts++;
    }
    if (this.handshake.step <= 3) {
      this.handshake.step = peershake.step + 1;

      this.handshake.blockchain            = {};
      this.handshake.blockchain.last_bid   = this.app.blockchain.last_bid;
      this.handshake.blockchain.last_ts    = this.app.blockchain.last_ts;
      this.handshake.blockchain.last_bsh   = this.app.blockchain.last_bsh;
      this.handshake.blockchain.last_bf    = this.app.blockchain.last_bf;
      this.handshake.blockchain.fork_id    = this.app.blockchain.fork_id;
      this.handshake.blockchain.genesis_bid= this.app.blockchain.genesis_bid;

      this.sendRequest("handshake", this.handshake);
      this.app.wallet.rebroadcastPendingTransactions();

    }

  }


  handleBlockRequest(message) {
    if (message.data == null) { return; }
    if (message.data.bhash == null) { return; }
    console.log("\n________________________________");
    console.log("BLOCK AVAILABLE: " + message.data.bhash);
    console.log("________________________________\n");
    if (this.app.blockchain.isHashIndexed(message.data.bhash) != 1) {
      this.app.network.addBlockHashToQueue(this, message.data.bhash, message.data.bid);
console.log("Block added to download queue... fetching");
      this.app.network.fetchBlocks();
    } else {
console.log("Block is indexed already, ignoring.... ");
    }
    return;
  }

  handleMissingBlockRequest(message, callback) {
    let t = JSON.parse(message.data);
    let missing_hash = t.hash;
    let last_hash = t.last_hash;

    let missing_bid = this.app.blockchain.bsh_bid_hmap[missing_hash];
    let last_bid = this.app.blockchain.bsh_bid_hmap[last_hash];

    if (last_hash == "") {
      if (missing_bid > 0) {
        var missing_block_data = { bhash: missing_hash, bid: missing_bid };
        this.sendRequest("block", missing_block_data);
      }
    } else if (last_bid > 0) {
      // if we need to send more, send whole blockchain
      if (missing_bid > last_bid + 1) {
console.log("HANDLE MISSING BLOCK REQUEST");
        this.sendBlockchain(last_bid + 1);
      } else {
        var missing_block_data = { bhash: missing_hash, bid: missing_bid };
        this.sendRequest("block", missing_block_data);
      }

      if (callback != null) { callback(); }

    }
  }


  async handleBlockchainRequest(message) {

    if (this.handshake.challenge_verified == 0) { 
console.log("\n\n\nERROR 820342: handshake not verified when blockchain data sent.");
      return; 
    }

console.log("BLOCKCHAIN REQUEST: " + JSON.stringify(message));

    let blocks = message.data;
    let prevhash = blocks.start;

    for (let i = 0; i < blocks.prehash.length; i++) {

      let bid = blocks.bid[i];
      let hash = this.app.crypto.hash(blocks.prehash[i] + prevhash);
      let ts = blocks.ts[i];
      let txsno = blocks.txs[i];

      if (i == 0) {
        //
        // if we are a lite-client, set our slips as
        // off the longest-chain if we are receiving
        // any slips from later than this sync starts
        // as we won't know if the chain was reorged
        // or not.
        //
        // if (this.app.BROWSER == 1) {
        //   console.log("slip sanity check: resetting all slips as invalid >= "+bid);
        //   this.app.wallet.resetSlipsOffLongestChain(bid);
        // }
      }

console.log("bid: " + bid);
console.log("hash: " + hash);
      if (this.app.blockchain.isHashIndexed(hash) != 1) {
console.log("hash is not indexed!");
        if (txsno == 0 && this.app.BROWSER == 1) {
console.log("just adding the hash to the chain...");
           await this.app.blockchain.addHashToBlockchain(hash, ts, bid, prevhash);
        } else {
console.log("adding the full or lite block");
          this.app.network.addBlockHashToQueue(this, hash, bid, ts);
        }
      }
      prevhash = hash;
    }

    this.app.network.fetchBlocks();
    this.app.blockchain.saveBlockchain();
  }



  sendBlockchain(start_bid, synctype) {

    if (this.handshake.challenge_verified == 0) {
console.log("ERROR 018413: skipping send blockchain as opposite party not verified...");
      return;
    }

    if (start_bid == 0) {
      // TODO: return this to 10
      let block_gap = synctype == "full" ? this.app.blockchain.genesis_period : 10
      start_bid = this.app.blockchain.last_bid - block_gap;
      if (start_bid < 0) { start_bid = 0; }
    }

console.log("Sending the Blockchain from start_bid: " + start_bid);

    let message = {};
    message.request = "blockchain";
    message.data = {};
    message.data.start = null;
    message.data.prehash = [];
    message.data.bid = [];
    message.data.ts = [];
    message.data.txs = [];

    let start_idx = 0;

    // index is just block data now
    for (let i = this.app.blockchain.index.blocks.length - 1; i >= 0; i--) {
      if (this.app.blockchain.index.blocks[i].block.id < start_bid) {
        i = -1;
      } else {
        start_idx = i;
      }
    }

    for (let i = start_idx; i < this.app.blockchain.index.blocks.length; i++) {
      // TODO: Reimplement LC
      // if (this.app.blockchain.index.blocks[i].block.lc == 1) {

        let { block, prehash } = this.app.blockchain.index.blocks[i];
        if (message.data.start == null) {
          message.data.start = block.prevbsh;
        }

        message.data.prehash.push(prehash);
        message.data.bid.push(block.id);
        message.data.ts.push(block.ts);

        //
        // number of txs for me
        //
        if (this.app.blockchain.index.blocks[i].hasKeylistTransactions(this.peer.keylist)) {
           message.data.txs.push(1);
         } else {
           message.data.txs.push(0);
         }
    }

    this.socket.emit('request', JSON.stringify(message));
    return;

  }

  handleTransactionRequest(message, mycallback) {
console.log("RECEIVED: " + message.data);
    let tx = new saito.transaction(JSON.parse(message.data));
    if (tx == null) { console.log("NULL TX"); return; }
    if (!tx.is_valid) { console.log("NOT VALID TX"); return; }

    try {
      this.app.mempool.addTransaction(tx);
    } catch (err) {
      console.log(err);
    }

    if (mycallback != null) {
      mycallback();
    }

    return;
  }

  returnBlockURL(block_hash) {
    let {protocol, host, port} = this.peer.endpoint;
    let url_sync_address = "blocks";
    if (this.peer.synctype == "lite") { 
      return `${protocol}://${host}:${port}/lite-blocks`;
    } else {
      return `${protocol}://${host}:${port}/blocks`;
    }
  }


  returnURL() {
    let {protocol, host, port} = this.peer.endpoint;
    return `${protocol}://${host}:${port}`;
  }

  inTransactionPath(tx) {
    if (tx == null) { return 0; }
    if (tx.isFrom(this.peer.publickey)) { return 1; }
    for (let i = 0; i < tx.transaction.path.length; i++) {
      if (tx.transaction.path[i].from == this.peer.publickey) { return 1; }
    }
    return 0;
  }


  addPathToTransaction(tx) {

    var tmptx = new saito.transaction();
    tmptx.transaction = JSON.parse(JSON.stringify(tx.transaction));

    // add our path
    var tmppath = new saito.path();
    tmppath.from = this.app.wallet.returnPublicKey();
    tmppath.to = this.returnPublicKey();
    tmppath.sig = this.app.crypto.signMessage(tmppath.to, this.app.wallet.returnPrivateKey());

    tmptx.transaction.path.push(tmppath);
    return tmptx;
  }
}

module.exports = Peer;
