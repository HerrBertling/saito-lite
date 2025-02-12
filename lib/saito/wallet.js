'use strict';

const saito = require('./saito');
const Big      = require('big.js');
const AbstractCryptoModule = require('../templates/abstractcryptomodule')
const ModalSelectCrypto = require('./ui/modal-select-crypto/modal-select-crypto');



/**
 * A Saito-lite wallet.
 * @param {*} app
 */
class Wallet {

  constructor(app) {
    if (!(this instanceof Wallet)) {
      return new Wallet(app);
    }

    this.app                             = app || {};

    this.wallet                          = {};
    this.wallet.balance                  = "0";
    this.wallet.publickey                = "";
    this.wallet.privatekey               = "";

    this.wallet.inputs                   = [];
    this.wallet.outputs                  = [];
    this.wallet.spends                   = [];        // spent but still around
    this.wallet.default_fee              = 2;
    this.wallet.version                  = 3.459;

    this.wallet.preferred_crypto	 = "SAITO";
    this.wallet.preferred_txs		 = [];

    this.inputs_hmap                     = [];
    this.inputs_hmap_counter             = 0;
    this.inputs_hmap_counter_limit       = 10000;
    this.outputs_hmap                    = [];
    this.outputs_hmap_counter            = 0;
    this.outputs_hmap_counter_limit      = 10000;
    this.outputs_prune_limit             = 100;

    this.recreate_pending_transactions   = 0;

    // SaitoCrypto is an AbstractCryptoModule just like the others so we
    // don't have to treat Saito as a special case.
    class SaitoCrypto extends AbstractCryptoModule {
      constructor(app) {
        super(app, "SAITO");
        this.name = "Saito";
        this.description = "Saito";
      }
      async returnBalance() {
        return parseFloat(this.app.wallet.returnBalance());
      }
      returnAddress() {
        return this.app.wallet.returnPublicKey();
      }
      returnPrivateKey() {
        return this.app.wallet.returnPrivateKey();
      }
      async transfer(howMuch, to) {
        this.app.wallet.transferTo(howMuch, to);
      }
      async hasPayment(howMuch, from, to, timestamp) {
        // This doens't account for the from field in case when the user is "to"
        // and doesn't account for "to" field when the user is "from".
        let from_from = 0;
        let to_to = 0;
        if (to == this.app.wallet.returnPublicKey()) {
          for (let i = 0; i < this.app.wallet.wallet.inputs.length; i++) {
            if (this.app.wallet.wallet.inputs[i].amt === howMuch) {
              if (parseInt(this.app.wallet.wallet.inputs[i].ts) >= parseInt(timestamp)) {
                if (this.app.wallet.wallet.inputs[i].add == to) {
                  return true;
                }
              }
            }
          }
          for (let i = 0; i < this.app.wallet.wallet.outputs.length; i++) {
            if (this.app.wallet.wallet.outputs[i].amt === howMuch) {
              if (parseInt(this.app.wallet.wallet.outputs[i].ts) >= parseInt(timestamp)) {
                if (this.app.wallet.wallet.outputs[i].add == to) {
                  return true;
                }
              }
            }
          }
          return false;
        } else {
          if (from == this.app.wallet.returnPublicKey()) {
            for (let i = 0; i < this.app.wallet.wallet.outputs.length; i++) {
              //console.log("OUTPUT");
              //console.log(this.app.wallet.wallet.outputs[i]);
              if (this.app.wallet.wallet.outputs[i].amt === howMuch) {
                if (parseInt(this.app.wallet.wallet.outputs[i].ts) >= parseInt(timestamp)) {
                  if (this.app.wallet.wallet.outputs[i].add == to) {
                    return true;
                  }
                }
              }
            }
          }
          return false;
        }
      }

      returnIsActivated() {
        return true;
      }
      onIsActivated() {
        return new Promise((resolve, reject) => {
          resolve();
        }); 
      }
    }
    this.saitoCrypo = new SaitoCrypto(app);
  }


  addInput(x) {

    //////////////
    // add slip //
    //////////////
    //
    // we keep our slip array sorted according to block_id
    // so that we can (1) spend the earliest slips first,
    // and (2) simplify deleting expired slips
    //
    let pos = this.wallet.inputs.length;
    while (pos > 0 && this.wallet.inputs[pos-1].bid > x.bid) { pos--; }
    if (pos == -1) { pos = 0; }

    this.wallet.inputs.splice(pos, 0, x);
    this.wallet.spends.splice(pos, 0, 0);

    let hmi = x.returnSignatureSource(x);
    this.inputs_hmap[hmi] = 1;
    this.inputs_hmap_counter++;


    ////////////////////////
    // regenerate hashmap //
    ////////////////////////
    //
    // we want to periodically re-generate our hashmaps
    // that help us check if inputs and outputs are already
    // in our wallet for memory-management reasons and
    // to maintain reasonable accuracy.
    //
    if (this.inputs_hmap_counter > this.inputs_hmap_counter_limit) {

      this.inputs_hmap = [];
      this.outputs_hmap = [];
      this.inputs_hmap_counter = 0;
      this.outputs_hmap_counter = 0;

      for (let i = 0; i < this.wallet.inputs.length; i++) {
        let hmi = this.wallet.inputs[i].returnSignatureSource();
        this.inputs_hmap[hmi] = 1;
      }

      for (let i = 0; i < this.wallet.outputs.length; i++) {
        let hmi = this.wallet.outputs[i].returnSignatureSource();
        this.outputs_hmap[hmi] = 1;
      }
    }
    return;
  }



  addOutput(x) {

    //////////////
    // add slip //
    //////////////
    this.wallet.outputs.push(x);
    let hmi = x.returnSignatureSource();
    this.outputs_hmap[hmi] = 1;
    this.outputs_hmap_counter++;

    ///////////////////////
    // purge old outputs //
    ///////////////////////
    if (this.wallet.outputs.length > this.outputs_prune_limit) {
      console.log("Deleting Excessive outputs from heavy-spend wallet...");
      let outputs_excess_amount = this.wallet.outputs.length - this.outputs_prune_limit;
      outputs_excess_amount += 10;
      this.wallet.outputs.splice(0, outputs_excess_amount);
      this.outputs_hmap_counter = 0;
    }
    return;

  }


  containsInput(s) {
    let hmi = s.returnSignatureSource();
    if (this.inputs_hmap[hmi] == 1) { return true; }
    return false;
  }


  containsOutput(s) {
    let hmi = s.returnSignatureSource();
    if (this.outputs_hmap[hmi] == 1) { return true; }
    return false;
  }

  transferTo(amount, toAddress) {
    let newtx = this.app.wallet.returnBalance() > 0 ?
        this.app.wallet.createUnsignedTransactionWithDefaultFee(toAddress, amount) :
        this.app.wallet.createUnsignedTransaction(toAddress, amount, 0.0);
    newtx = this.app.wallet.signAndEncryptTransaction(newtx);
    this.app.network.propagateTransaction(newtx);  
    console.log("wallet transfer to");
    console.log(newtx);
    //return newtx;
  }
  
  
  
  
  addTransactionToPending(tx) {
    let txjson = JSON.stringify(tx.transaction);

    // do not put large TXS in pending - 100 kb
    if (txjson.length > 100000) { return; }

    if (! this.wallet.pending.includes(txjson)) {
      this.wallet.pending.push(txjson);
      this.saveWallet();
    } else {
      //alert("DOUBLEADD to PENDING: " + JSON.stringify(tx.msg));
    }
  }


  doesSlipInPendingTransactionsSpendBlockHash(bsh="") {
    for (let i = 0; i < this.wallet.pending.length; i++) {
      let ptx = new saito.transaction(JSON.parse(this.wallet.pending[i]));
      for (let k = 0; k < ptx.transaction.from.length; k++) {
        if (ptx.transaction.from[k].bsh == bsh) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Initialize the Saito-Lite wallet
   * @param {Object} app - Saito-Lite Application Context
   */
  initialize(app) {
    if (this.wallet.privatekey == "") {
      if (this.app.options.wallet != null) {

        /////////////
        // upgrade //
        /////////////
        if (this.app.options.wallet.version < this.wallet.version) {


          if (this.app.BROWSER == 1) {

            let tmpprivkey = this.app.options.wallet.privatekey;
            let tmppubkey = this.app.options.wallet.publickey;

            // specify before reset to avoid archives reset problem
            this.wallet.publickey = tmppubkey;
            this.wallet.privatekey = tmpprivkey;

            // let modules purge stuff
            this.app.modules.onWalletReset();

            // reset and save
            this.app.storage.resetOptions();
            this.app.storage.saveOptions();

            // re-specify after reset
            this.wallet.publickey = tmppubkey;
            this.wallet.privatekey = tmpprivkey;

            this.app.options.wallet = this.wallet;

            // reset blockchain
            this.app.options.blockchain.last_bid = "";
            this.app.options.blockchain.last_hash = "";
            this.app.options.blockchain.last_ts = "";

            // delete inputs and outputs
            this.app.options.wallet.inputs   = [];
            this.app.options.wallet.outputs  = [];
            this.app.options.wallet.pending  = [];
            this.app.options.wallet.spends   = [];
            this.app.options.wallet.balance  = "0.0";
            this.app.options.wallet.version  = this.wallet.version;

            this.saveWallet();

            salert("Saito Upgrade: Wallet Reset");

          } else {

            //
            // purge old slips
            //
            this.app.options.wallet.version = this.wallet.version;

            this.app.options.wallet.inputs   = [];
            this.app.options.wallet.outputs  = [];
            this.app.options.wallet.spends   = [];
            this.app.options.wallet.pending  = [];
            this.app.options.wallet.balance  = "0.0";

            this.app.storage.saveOptions();

          }
        }

        this.wallet = Object.assign(this.wallet, this.app.options.wallet);
      }

      ////////////////
      // new wallet //
      ////////////////
      if (this.wallet.privatekey == "") {
        this.resetWallet();
      }
    }



    //////////////////
    // import slips //
    //////////////////
    this.wallet.spends = []
    if (this.app.options.wallet != null) {

      if (this.app.options.wallet.inputs != null) {
        for (let i = 0; i < this.app.options.wallet.inputs.length; i++) {
          let {add,amt,type,bid,tid,sid,bsh,lc,rn} = this.app.options.wallet.inputs[i];
          this.wallet.inputs[i] = new saito.slip(add,amt,type,bid,tid,sid,bsh,lc,rn);
          if (this.app.options.wallet.inputs[i].ts) { this.wallet.inputs[i].ts = this.app.options.wallet.inputs[i].ts; }
          this.wallet.spends.push(0);

          ////////////////////
          // update hashmap //
          ////////////////////
          let hmi = this.wallet.inputs[i].returnSignatureSource();
          this.inputs_hmap[hmi] = 1;
          this.inputs_hmap_counter++;

        }
      }
      if (this.app.options.wallet.outputs != null) {
        for (let i = 0; i < this.app.options.wallet.outputs.length; i++) {
          let {add,amt,type,bid,tid,sid,bsh,lc,rn} = this.app.options.wallet.outputs[i];
          this.wallet.outputs[i] = new saito.slip(add,amt,type,bid,tid,sid,bsh,lc,rn);

          ////////////////////
          // update hashmap //
          ////////////////////
          let hmi = this.wallet.outputs[i].returnSignatureSource();
          this.outputs_hmap[hmi] = 1;
          this.outputs_hmap_counter++;

        }
      }
    }


    //
    // check pending transactions and update spent slips
    //
    for (let z = 0; z < this.wallet.pending.length; z++) {
      let ptx = new saito.transaction(JSON.parse(this.wallet.pending[z]));

      for (let y = 0; y < ptx.transaction.from.length; y++) {

        let spent_slip = ptx.transaction.from[y];

        let ptx_bsh = spent_slip.bsh;
        let ptx_bid = spent_slip.bid;
        let ptx_tid = spent_slip.tid;
        let ptx_sid = spent_slip.sid;

        for (let x = 0; x < this.wallet.inputs.length; x++) {
          if (this.wallet.inputs[x].bid == ptx_bid) {
            if (this.wallet.inputs[x].tid == ptx_tid) {
              if (this.wallet.inputs[x].sid == ptx_sid) {
                if (this.wallet.inputs[x].bsh == ptx_bsh) {
                  this.wallet.spends[x] = 1;
                  x = this.wallet.inputs.length;
                }
              }
            }
          }
        }
      }
    }

    //
    // listen to network conditions
    //
    this.app.connection.on('connection_up', (peer) => {
      this.rebroadcastPendingTransactions(peer);
    });


    this.purgeExpiredSlips();
    this.updateBalance();
    this.saveWallet();

  }




  isSlipInPendingTransactions(slip=null) {

    if (slip == null) { return false; }

    let slipidx = slip.returnSignatureSource();

    for (let i = 0; i < this.wallet.pending.length; i++) {
      let ptx = new saito.transaction(JSON.parse(this.wallet.pending[i]));
      for (let k = 0; k < ptx.transaction.from.length; k++) {
        let fslip = ptx.transaction.from[k];
        if (fslip.returnSignatureSource() === slipidx) {
          return true;
        }
      }
    }

    return false;

  }




  //
  // if peer is not null, rebroadcast to that peer, else everyone
  //
  rebroadcastPendingTransactions(peer=null) {

    let loop_length = this.wallet.pending.length;

    for (let i = 0; i < loop_length; i++) {
      let tx = new saito.transaction(JSON.parse(this.wallet.pending[i]));
      if (!tx.isFrom(this.returnPublicKey())) {
        this.wallet.pending.splice(i, 1);
        i--; loop_length--;
      } else {

        if (tx.transaction.type == 0) {
          if (peer == null) {
            this.app.network.propagateTransaction(tx);
          } else {
            this.app.network.propagateTransaction(tx);
          }
        } else {
          //
          // remove golden tickets and other unnecessary slips from pending
          //
          this.app.wallet.wallet.pending.splice(i, 1);
          this.app.wallet.unspendInputSlips(tx);
          this.app.wallet.saveWallet();
          i--; loop_length--;
        }
      }
    }
  }



  unspendInputSlips(tmptx=null) {

    if (tmptx == null) { return; }

    for (let i = 0; i < tmptx.transaction.from.length; i++) {

      let fsidx = tmptx.transaction.from[i].returnSignatureSource();

      for (let z = 0; z < this.wallet.inputs.length; z++) {
        if (fsidx == this.wallet.inputs[z].returnSignatureSource()) {
          this.wallet.spends[z] = 0;
        }
      }
    }
  }








  onChainReorganization(bid, bsh, lc, pos) {

    if (lc == 1) {

      this.purgeExpiredSlips();
      this.resetSpentInputs();

      //
      // recreate pending slips
      //
      let bad_pending_tx_indexes = [];
      if (this.recreate_pending_transactions == 1) {
        for (let i = 0; i < this.wallet.pending.length; i++) {
          let ptx = new saito.transaction(JSON.parse(this.wallet.pending[i]));
          let newtx = this.createReplacementTransaction(ptx);
          if (newtx != null) {
            newtx = this.signTransaction(newtx);
            if (newtx != null) {
              this.wallet.pending[i] = JSON.stringify(newtx);
            }
          } else {
            bad_pending_tx_indexes.push(i);
            console.log("pending transaction could not be recreated, purging");
          }
        }
        for(let i = 0; i < bad_pending_tx_indexes.length; i++) {
          this.wallet.pending.splice(i, 1);
        }
        this.recreate_pending_transactions = 0;
      }

    } else {
      if (this.doesSlipInPendingTransactionsSpendBlockHash(bsh)) {
        console.log("doesSlipInPendingTransactionsSpendBlockHash true, recreate_pending_transactions");
        this.recreate_pending_transactions = 1;
      } else {
        console.log("doesn't doesSlipInPendingTransactionsSpendBlockHash, recreate_pending_transactions not set");
      }
    }
    this.resetExistingSlips(bid, bsh, lc);
  }




  processPayments(blk, lc=0) {

    for (let i = 0; i < blk.transactions.length; i++) {

      let tx              = blk.transactions[i];
      let slips           = tx.returnSlipsToAndFrom(this.returnPublicKey());
      let to_slips        = [];
      let from_slips      = [];
      for (let m = 0; m < slips.to.length; m++) { to_slips.push(slips.to[m].cloneSlip()); }
      for (let m = 0; m < slips.from.length; m++) { from_slips.push(slips.from[m].cloneSlip()); }

      //
      // update slips prior to insert
      //
      for (let ii = 0; ii < to_slips.length; ii++) {
        to_slips[ii].bid = blk.block.id;
        to_slips[ii].bsh = blk.returnHash();
        to_slips[ii].tid = tx.transaction.id;
        to_slips[ii].lc  = lc;
        to_slips[ii].ts  = blk.block.ts; // set ts according to block
        to_slips[ii].from = tx.transaction.from; // set from slips
      }

      for (let ii = 0; ii < from_slips.length; ii++) {
        from_slips[ii].ts  = blk.block.ts; // set ts according to block
      }

      //
      // any txs in pending should be checked to see if
      // we can remove them now that we have received
      // a transaction that might be it....
      //
      let removed_pending_slips = 0;
      if (this.wallet.pending.length > 0) {

        for (let i = 0; i < this.wallet.pending.length; i++) {

          let ptx = new saito.transaction(JSON.parse(this.wallet.pending[i]));

          if (this.wallet.pending[i].indexOf(tx.transaction.sig) > 0) {
            this.wallet.pending.splice(i, 1);
            i--;
            removed_pending_slips = 1;
          } else {

            if (ptx.transaction.type == 1) {

              this.wallet.pending.splice(i, 1);
              this.unspendInputSlips(ptx);
              i--;
              removed_pending_slips = 1;

            } else {

              //
              // 10% chance of deletion
              //
              if (Math.random() <= 0.1) {

                let ptx_ts = ptx.transaction.ts;
                let blk_ts = blk.block.ts;

                if ((ptx_ts + 12000000) < blk_ts) {
                  this.wallet.pending.splice(i, 1);
                  this.unspendInputSlips(ptx);
                  removed_pending_slips = 1;
                  i--;
                }
              }
            }
          }
        }
      }
      if (removed_pending_slips == 1) {
        this.saveWallet();
      }


      //
      // inbound payments
      //
      if (to_slips.length > 0) {
        for (let m = 0; m < to_slips.length; m++) {
          if (to_slips[m].amt > 0) {
            if (this.containsInput(to_slips[m]) == 0) {
              if (this.containsOutput(to_slips[m]) == 0) {
                if (to_slips[m].type != 4) {
                  this.addInput(to_slips[m]);
		}
              }
            } else {
              if (lc == 1) {
                let our_index = to_slips[m].returnSignatureSource();
                for (let n = this.wallet.inputs.length-1; n >= 0; n--) {
                  if (this.wallet.inputs[n].returnSignatureSource() === our_index) {
                    this.wallet.inputs[n].lc = lc;
                  }
                }
              }
            }
          }
        }
      }

      //
      // outbound payments
      //
      if (from_slips.length > 0) {
        for (var m = 0; m < from_slips.length; m++) {
          var s = from_slips[m];

          for (var c = 0; c < this.wallet.inputs.length; c++) {
            var qs = this.wallet.inputs[c];
            if (
              s.bid   == qs.bid &&
              s.tid   == qs.tid &&
              s.sid   == qs.sid &&
              s.bsh   == qs.bsh &&
              s.amt   == qs.amt &&
              s.add   == qs.add
            ) {
              if (this.containsOutput(s) == 0) {
                this.addOutput(s);
                //this.addOutput(this.wallet.inputs[c]);
              }
              this.wallet.inputs.splice(c, 1);
              this.wallet.spends.splice(c, 1);
              c = this.wallet.inputs.length+2;
            }
          }
        }
      }
    }

/***** MARCH 11
    //
    // if we have way too many slips, merge some
    //
    if (this.wallet.inputs.length > 20) {

console.log("---------------------------------------");
console.log("Merging Wallet Slips on Proess Payment!");
console.log("---------------------------------------");
      let mtx = this.createUnsignedTransaction(this.returnPublicKey(), 0.0, 0.0, 8); 
      mtx = this.signTransaction(mtx);
      this.app.network.propagateTransaction(mtx);

    }
******/


    //
    // save wallet
    //
    this.updateBalance();
    this.app.options.wallet = this.wallet;
    this.app.storage.saveOptions();

  }



  purgeExpiredSlips() {

    let gid = this.app.blockchain.genesis_bid;
    for (let m = this.wallet.inputs.length-1; m >= 0; m--) {
      if (this.wallet.inputs[m].bid < gid) {
        this.wallet.inputs.splice(m, 1);
        this.wallet.spends.splice(m, 1);
      }
    }
    for (let m = this.wallet.outputs.length-1; m >= 0; m--) {
      if (this.wallet.outputs[m].bid < gid) {
        this.wallet.outputs.splice(m, 1);
      }
    }
  }





  resetExistingSlips(bid, bsh, lc) {
    for (let m = this.wallet.inputs.length-1; m >= 0; m--) {
      if (this.wallet.inputs[m].bid == bid && this.wallet.inputs[m].bsh === bsh) {
        this.wallet.inputs[m].lc = lc;
      } else {
        if (this.wallet.inputs[m].bid < bid) {
          return;
        }
      }
    }
  }

  resetSpentInputs(bid=0) {
    if (bid == 0) {
      for (let i = 0; i < this.wallet.inputs.length; i++) {
        if (this.isSlipInPendingTransactions(this.wallet.inputs[i]) == false) {
          this.wallet.spends[i] = 0;
        }
      }
    } else {
      let target_bid = this.app.blockchain.returnLatestBlockId() - bid;
      for (let i = 0; i < this.wallet.inputs.length; i++) {
        if (this.wallet.inputs[i].bid <= target_bid) {
          if (this.isSlipInPendingTransactions(this.wallet.inputs[i]) == false) {
            this.wallet.spends[i] = 0;
          }
        }
      }
    }
  }



  returnAdequateInputs(amt) {

    var utxiset = [];
    var value   = Big(0.0);
    var bigamt  = Big(amt);

    this.purgeExpiredSlips();

    //
    // this adds a 1 block buffer so that inputs are valid in the future block included
    //
    var lowest_block = this.app.blockchain.last_bid - this.app.blockchain.genesis_period + 2;

    //
    // check pending txs to avoid slip reuse if necessary
    //
    if (this.wallet.pending.length > 0) {
      for (let i = 0; i < this.wallet.pending.length; i++) {
        let pendingtx = new saito.transaction(JSON.parse(this.wallet.pending[i]));
        for (let k = 0; k < pendingtx.transaction.from.length; k++) {
          let slipIndex = pendingtx.transaction.from[k].returnSignatureSource();
          for (let m = 0; m < this.wallet.inputs; m++) {
            let thisSlipIndex = this.wallet.inputs[m].returnSignatureSource();
            // if the input in the wallet is already in a pending tx...
            // then set spends[m] to 1
            if (thisSlipIndex === slipIndex) {
              while (this.wallet.spends.length < m) {
                this.wallet.spends.push(0);
              }
              this.wallet.spends[m] = 1;
            }
          }
        }
      }
    }
    let hasAdequateInputs = false;
    let slipIndexes = [];
    for (let i = 0; i < this.wallet.inputs.length; i++) {
      if (this.wallet.spends[i] == 0 || i >= this.wallet.spends.length) {
        var slip = this.wallet.inputs[i];
        if (slip.lc == 1 && slip.bid >= lowest_block) {
          if (this.app.mempool.transactions_inputs_hmap[slip.returnSignatureSource()] != 1) {
            slipIndexes.push(i);
            utxiset.push(slip);
            value = value.plus(Big(slip.amt));
            if (value.gt(bigamt) || value.eq(bigamt)) {
              hasAdequateInputs = true;
              break
            }
          }
        }
      }
    }
    if(hasAdequateInputs) {
      for(let i = 0; i < slipIndexes.length; i++) {
        this.wallet.spends[slipIndexes[i]] = 1;
      }
      return utxiset;
    } else {
      return null;
    }
  }
  /**
   * Calculates balance from slips in the local storage wallet
   * @return {Big}
   */
  calculateBalance() {
    let bal = Big(0);
     this.wallet.inputs.forEach((input, index )=> {
       if (this.isSlipValid(input, index)) {
         bal = bal.plus(input.amt);
       }
     });
     return bal;
  }

  calculateDisplayBalance() {
    var s = this.calculateBalance();
    this.wallet.pending.forEach(tx => {
      tx.to.forEach(slip => {
        Big(s).plus(Big(slip.amt));
      });
    });
  }

  isSlipValid(slip, index) {
    let isSlipSpent = this.wallet.spends[index];
    let isSlipLC = slip.lc == 1;
    let isSlipGtLVB = slip.bid >= this.app.blockchain.returnLowestValidBlock();
    let isSlipinTX = this.app.mempool.transactions_inputs_hmap[slip.returnSignatureSource()] != 1;
    let valid = !isSlipSpent && isSlipLC && isSlipGtLVB && isSlipinTX;
    return valid;
  }

  returnBalance() {
    return this.wallet.balance.replace(/0+$/,'').replace(/\.$/,'\.0');
  }
  /**
   * Returns Private key
   * @return {String}
   */
  returnPrivateKey() {
    return this.wallet.privatekey;
  }
  /**
   * Returns Public key
   * @return {String}
   */
  returnPublicKey() {
    return this.wallet.publickey;
  }

  /**
   * Serialized the user's wallet to JSON and downloads it to their local machine
   */
  async backupWallet() {
    try {
      if (this.app.BROWSER == 1) {
        let content = JSON.stringify(this.app.options);
        var pom = document.createElement('a');
        pom.setAttribute('type', "hidden");
        pom.setAttribute('href', 'data:application/json;utf-8,' + encodeURIComponent(content));
        pom.setAttribute('download', "saito.wallet.json");
        document.body.appendChild(pom);
        pom.click();
        pom.remove();
      }
    } catch (err) {
      console.log("Error backing-up wallet: " + err);
    }
  }
  
  /**
   * Restores the user's wallet from uploaded JSON
   */
  async restoreWallet(file) {
    
    // let password_prompt = "";
    // let confirm_password = await sconfirm("Did you encrypt this backup with a password. Click cancel if not:");
    // if (confirm_password) {
    // 
    //   password_prompt = await sprompt("Please provide the password you used to encrypt this backup:");
    //   if (!password_prompt) {
    //     salert("Wallet Restore Cancelled");
    //     return;
    //   }
    // } else {
    //   password_prompt = "";
    // }
    // 
    // password_prompt = await sprompt("Enter encryption password (blank for no password):");
    // 
    // let groo = password_prompt;
    // 
    // if (password_prompt === false) {
    //   salert("Wallet Restore Cancelled");
    //   return;
    // }
    
    
    var wallet_reader = new FileReader();
    wallet_reader.readAsBinaryString(file);  
    wallet_reader.onloadend = () => {
      
      let decryption_secret = "";
      let decrypted_wallet = "";

      // if (password_prompt != "") {
      //   decryption_secret = app.crypto.hash(password_prompt + "SAITO-PASSWORD-HASHING-SALT");
      //   try {
      //     decrypted_wallet = app.crypto.aesDecrypt(wallet_reader.result, decryption_secret);
      //   } catch (err) {
      //     salert(err);
      //   }
      // } else {
        decrypted_wallet = wallet_reader.result;
      //}
      try {
        let wobj = JSON.parse(decrypted_wallet);
        wobj.wallet.version = this.wallet.version;
        wobj.wallet.inputs = [];
        wobj.wallet.outputs = [];
        wobj.wallet.spends = [];
        wobj.games = [];
        wobj.gameprefs = {};
        this.app.options = wobj;

        this.app.blockchain.resetBlockchain();

        this.app.modules.returnModule('Arcade').onResetWallet();
        this.app.storage.saveOptions();

        salert("Restoration Complete ... click to reload Saito");
        window.location.reload();
      } catch (err) {
        if(err.name == "SyntaxError") {
          salert("Error reading wallet file. Did you upload the correct file?");
        } else if(false) {// put this back when we support encrypting wallet backups again...
          salert("Error decrypting wallet file. Password incorrect");
        } else {
          salert("Unknown error<br/>" + err);  
        }
      }
    };

  }
  


  /**
   * Generates a new keypair for the user, resets all stored wallet info, and saves
   * the new wallet to local storage.
   */
  async resetWallet() {

    //
    // we do not do this because of referrals and bundles stored in options file
    // reset and save
    //await this.app.storage.resetOptions();
    //this.app.storage.saveOptions();

    this.wallet.privatekey            = this.app.crypto.generateKeys();
    this.wallet.publickey             = this.app.crypto.returnPublicKey(this.wallet.privatekey);

    // blockchain
    if (this.app.options.blockchain != undefined) {
      this.app.blockchain.resetBlockchainOptions();
    }

    // keychain
    if (this.app.options.keys != undefined) {
      this.app.options.keys = [];
    }

    this.wallet.inputs                = [];
    this.wallet.outputs               = [];
    this.wallet.spends                = [];
    this.wallet.pending               = [];

    this.saveWallet();

    if (this.app.browser.browser_active == 1) {
      window.location.reload();
    }

  }

  /**
   * Saves the current wallet state to local storage.
   */
  saveWallet() {
    this.app.options.wallet = this.wallet;
    this.app.storage.saveOptions();
  }
  
  /**
   * Sign an arbitrary message with wallet keypair
   */
  signMessage(msg) {
    return this.app.crypto.signMessage(msg, this.returnPrivateKey());
  }
  
  /**
   * If the to field of the transaction contains a pubkey which has previously negotiated a diffie-hellman
   * key exchange, encrypt the message part of message, attach it to the transaction, and resign the transaction
   * @param {Transaction}
   * @return {Transaction}
   */
  signAndEncryptTransaction(tx) {

    if (tx == null) { return null; }
    for (var i = 0; i < tx.transaction.to.length; i++) { tx.transaction.to[i].sid = i; }

    //
    // convert tx.msg to base64 tx.transaction.ms
    //
    // if the transaction is of excessive length, we cut the message and
    // continue blank. so be careful kids as there are some hardcoded
    // limits in NodeJS!
    //
    try {
      if (this.app.keys.hasSharedSecret(tx.transaction.to[0].add)) {
        tx.msg = this.app.keys.encryptMessage(tx.transaction.to[0].add, tx.msg);
      }
      tx.transaction.m = this.app.crypto.stringToBase64(JSON.stringify(tx.msg));
      tx.transaction.sig = tx.returnSignature(this.app, 1); // force clean sig as encrypted

   } catch (err) {
console.log("####################");
console.log("### OVERSIZED TX ###");
console.log("###   -revert-   ###");
console.log("####################");
console.log(err);
      tx.msg = {};
      return tx;
    }

    return tx;

  }
  
  /**
   * Sign a transactions and attach the sig to the transation
   * @param {Transaction}
   * @return {Transaction}
   */
  signTransaction(tx) {

    if (tx == null) { return null; }
    for (let i = 0; i < tx.transaction.to.length; i++) { tx.transaction.to[i].sid = i; }
    // this causes issues with transactions not validating, but eliminates recursive
    //for (let i = 0; i < tx.transaction.to.length; i++) { try { delete tx.transaction.to[i].from; } catch (err) {} }
    //for (let i = 0; i < tx.transaction.from.length; i++) { try { delete tx.transaction.from[i].from; } catch (err) {} };

    //
    // convert tx.msg to base64 tx.transaction.ms
    //
    // if the transaction is of excessive length, we cut the message and
    // continue blank. so be careful kids as there are some hardcoded
    // limits in NodeJS!
    //
    try {
      tx.transaction.m = this.app.crypto.stringToBase64(JSON.stringify(tx.msg));
      tx.transaction.sig = tx.returnSignature(this.app); // 1 not second arg = no force refresh
    } catch (err) {
      console.error("####################");
      console.error("### OVERSIZED TX ###");
      console.error("###   -revert-   ###");
      console.error("####################");
      console.error(err);
      tx.msg = {};
      return tx;
    }

    return tx;
  }


  updateBalance() {
    let existing_balance = this.wallet.balance;
    this.wallet.balance = this.calculateBalance().toFixed(8);
    if (this.wallet.balance != existing_balance) {
      this.app.connection.emit("update_balance", this);
    }
  }

  returnDisplayBalance() {
    return this.calculateDisplayBalance();
  }

  createSlip(addr) {
    return new saito.slip(addr);
  }

  createRawTransaction(txobj) {
    return new saito.transaction(txobj);
  }

  createUnsignedTransactionWithDefaultFee(publickey="", amt=0.0, force_merge=0) {
    if (publickey === "") { publickey = this.app.wallet.returnPublicKey(); }
    return this.createUnsignedTransaction(publickey, amt, this.wallet.default_fee);
  }

  createUnsignedTransaction(publickey="", amt=0.0, fee=0.0, force_merge=0) {

    if (publickey == "") { publickey = this.returnPublicKey(); }

    var wallet_avail = this.calculateBalance();
    if (Big(fee).gt(wallet_avail)) {
      //console.log("Inadequate funds in wallet for fee, creating with 0.0 fee instead.");
      fee = 0.0;
    }
    var tx           = new saito.transaction();
    var total_fees   = Big(amt).plus(Big(fee));
    var wallet_avail = this.calculateBalance();

    //
    // check to-address is ok -- this just keeps a server
    // that receives an invalid address from forking off
    // the main chain because it creates its own invalid
    // transaction.
    //
    // this is not strictly necessary, but useful for the demo
    // server during the early stages, which produces a majority of
    // blocks.
    //
    if (!this.app.crypto.isPublicKey(publickey)) {
      throw "Invalid address " + publickey;
      console.log("trying to send message to invalid address");
      return null;
    }


    if (total_fees.gt(wallet_avail)) {
      amt = 0.0;
      fee = 0.0;
      //console.log("Inadequate funds in wallet to create transaction. total: " + total_fees);
      return null;
    }


    //
    // zero-fee transactions have fake inputs
    //
    if (total_fees.eq(0.0)) {
      tx.transaction.from = [];
      tx.transaction.from.push(new saito.slip(this.returnPublicKey()));
    } else {
      tx.transaction.from = this.returnAdequateInputs(total_fees);
    }
    tx.transaction.ts   = new Date().getTime();
    tx.transaction.to.push(new saito.slip(publickey, amt));

    // specify that this is a normal transaction
    tx.transaction.to[tx.transaction.to.length-1].type = 0;
    if (tx.transaction.from == null) {

      //
      // take a hail-mary pass and try to send this as a free transaction
      //
      tx.transaction.from = [];
      tx.transaction.from.push(new saito.slip(this.returnPublicKey(), 0.0));
      //return null;

    }
    if (tx.transaction.to == null) {

      //
      // take a hail-mary pass and try to send this as a free transaction
      //
      tx.transaction.to = [];
      tx.transaction.to.push(new saito.slip(publickey, 0.0));
      //return null;

    }

    // add change input
    var total_inputs = Big(0.0);
    for (let ii = 0; ii < tx.transaction.from.length; ii++) {
      total_inputs = total_inputs.plus(Big(tx.transaction.from[ii].amt));
    }

    //
    // generate change address(es)
    //
    var change_amount = total_inputs.minus(total_fees);

    if (Big(change_amount).gt(0)) {

      //
      // if we do not have many slips left, generate a few extra inputs
      //
      if (this.wallet.inputs.length < 8) {

        let change1 = change_amount.div(2).toFixed(8);
        let change2 = change_amount.minus(Big(change1)).toFixed(8);

        //
        // split change address
        //
        // this prevents some usability issues with APPS
        // by making sure there are usually at least 3
        // utxo available for spending.
        //
        tx.transaction.to.push(new saito.slip(this.returnPublicKey(), change1));
        tx.transaction.to[tx.transaction.to.length-1].type = 0;
        tx.transaction.to.push(new saito.slip(this.returnPublicKey(), change2));
        tx.transaction.to[tx.transaction.to.length-1].type = 0;

      } else {

        //
        // single change address
        //
        tx.transaction.to.push(new saito.slip(this.returnPublicKey(), change_amount.toFixed(8)));
        tx.transaction.to[tx.transaction.to.length-1].type = 0;
      }
    }


    //
    // if our wallet is filling up with slips, merge a few
    //
    //if (this.wallet.inputs.length > 200 || force_merge > 0) {
    if (this.wallet.inputs.length > 30 || force_merge > 0) {

console.log("---------------------");
console.log("Merging Wallet Slips!");
console.log("---------------------");

      let slips_to_merge = 7;
      if (force_merge > 7) { slips_to_merge = force_merge; } 
      let slips_merged = 0;
      let output_amount = Big(0);
      let lowest_block = this.app.blockchain.last_bid - this.app.blockchain.genesis_period + 2;

      //
      // check pending txs to avoid slip reuse
      //
      if (this.wallet.pending.length > 0) {
        for (let i = 0; i < this.wallet.pending.length; i++) {
          let ptx = new saito.transaction(JSON.parse(this.wallet.pending[i]));
          for (let k = 0; k < ptx.transaction.from.length; k++) {
            let slipIndex = ptx.transaction.from[k].returnSignatureSource();
            for (let m = 0; m < this.wallet.inputs; m++) {
              let thisSlipIndex = this.wallet.inputs[m].returnSignatureSource();
              if (thisSlipIndex === slipIndex) {
                while (this.wallet.spends.length < m) {
                  this.wallet.spends.push(0);
                }
                this.wallet.spends[m] = 1;
              }
            }
          }
        }
      }


      for (let i = 0; slips_merged < slips_to_merge && i < this.wallet.inputs.length; i++) {
        if (this.wallet.spends[i] == 0 || i >= this.wallet.spends.length) {
          var slip = this.wallet.inputs[i];
          if (slip.lc == 1 && slip.bid >= lowest_block) {
            if (this.app.mempool.transactions_inputs_hmap[slip.returnSignatureSource()] != 1) {
              this.wallet.spends[i] = 1;

   	      slips_merged++;
	      output_amount = output_amount.plus(Big(slip.amt));

              tx.transaction.from.push(slip);

            }
          }
        }
      }

      // add new output
      tx.transaction.to.push(new saito.slip(this.returnPublicKey(), output_amount.toFixed(8)));
      tx.transaction.to[tx.transaction.to.length-1].type = 0;

    }

    //
    // we save here so that we don't create another transaction
    // with the same inputs after broadcasting on reload
    //
    this.saveWallet();

    return tx;

  }

  createToSlips(num, address, amount, change_amount) {
    var amt_per_slip = 1;
    if(num > amount) {
      amt_per_slip = 1;
      num = Math.floor(amount);
    } else {
      amt_per_slip = Math.floor(amount / num);
    }
    var remainder = amount % amt_per_slip;

    var to_slips = [];

    for (let i = 0; i < num; i++) {
        to_slips.push(new saito.slip(address, Big(amt_per_slip)));
        to_slips[to_slips.length - 1].type = 0;
    }

    if (Big(remainder).gt(0)) {
        to_slips.push(new saito.slip(address, Big(remainder)));
        to_slips[to_slips.length - 1].type = 0;
    }

    if (Big(change_amount).gt(0)) {
        to_slips.push(new saito.slip(this.app.wallet.returnPublicKey(), change_amount.toFixed(8)));
        to_slips[to_slips.length - 1].type = 0;
    }

    return to_slips;
  }



  createReplacementTransaction(oldtx) {
    let inputs_amt = Big(0.0);
    for (let z = 0; z < oldtx.transaction.from.length; z++) {
      inputs_amt = inputs_amt.plus(Big(oldtx.transaction.from[z].amt));
    }
    let newtx = new saito.transaction(oldtx.transaction);
    let inputs = this.returnAdequateInputs(inputs_amt);
    if(inputs) {
      newtx.transaction.from = this.returnAdequateInputs(inputs_amt);
      this.saveWallet();
      return newtx;  
    } else {
      return null;
    }
    
  }

  ///////////////////////
  // PREFERRED CRYPTOS //
  ///////////////////////

  /**
   * Returns a list of any modules installed in this Saito-Lite node which extend AbstractCryptoModule.
   * AbstractCryptoModules represent various cryptocurrencies like DOT, Kusama, ETH, etc.
   * @return {Array} Array of modules
   */
  returnInstalledCryptos() {
    let cryptoModules = this.app.modules.returnModulesBySubType(AbstractCryptoModule);
    cryptoModules.push(this.saitoCrypo);
    return cryptoModules;
  }

  /**
   * Returns a list of any modules installed in this Saito-Lite node which extend AbstractCryptoModule.
   * AbstractCryptoModules represent various cryptocurrencies like DOT, Kusama, ETH, etc.
   * @return {Array} Array of modules
   */
   returnActivatedCryptos() {
    let allMods = this.returnInstalledCryptos();
    let activeMods = [];
    for (let i = 0; i < allMods.length; i++) {
      if (allMods[i].returnIsActivated()) {
        activeMods.push(allMods[i]);
      }
    }
    return activeMods;
  }
  
  /**
   * Gets an installed AbstractCryptoModule by ticker
   * @param {String} ticker - Ticker of install crypto module
   * @return {Module}
   */
  returnCryptoModuleByTicker(ticker) {
    let mods = this.returnInstalledCryptos();
    for (let i = 0; i < mods.length; i++) {
      if (mods[i].ticker === ticker) { return mods[i]; }
    }
    throw "Module Not Found: " + ticker;
  }
  /**
   * Set user's preferred crypto module by ticker
   * @param {String} ticker - Ticker of install crypto module
   */
  setPreferredCrypto(ticker, show_overlay=0) {
    let can_we_do_this = 0;
    let mods = this.returnInstalledCryptos();
    let cryptomod = null;
    for (let i = 0; i < mods.length; i++) {
      if (mods[i].ticker === ticker) { cryptomod = mods[i]; can_we_do_this = 1; }
    }
    if (ticker == "SAITO") { can_we_do_this = 1; }

    if (can_we_do_this == 1) {
      this.wallet.preferred_crypto = ticker;
      this.saveWallet();
      this.app.connection.emit("set_preferred_crypto", ticker);
    }

    if (cryptomod != null && show_overlay == 1) {
      if (cryptomod.renderModalSelectCrypto() != null) {
        let modal_select_crypto = new ModalSelectCrypto(this.app, cryptomod);
        modal_select_crypto.render(this.app, cryptomod);
        modal_select_crypto.attachEvents(this.app, cryptomod);
      }
    }

    return;
  }
  /**
   * A user can set their preferred crypto within the Saito Lite environment. This will be stored
   * in their local storage and can be retrieved by other modules here for any purpose.
   * @return {Module}
   */
  returnPreferredCrypto() {
    try {
      return this.returnCryptoModuleByTicker(this.wallet.preferred_crypto);
    } catch(err) {
      if (err.startsWith("Module Not Found:")) {
        this.setPreferredCrypto("SAITO");
        return this.returnCryptoModuleByTicker(this.wallet.preferred_crypto);
      } else {
        throw err;
      }
    }   
  }
  returnPreferredCryptoTicker() {
    try {
      let pc = this.returnPreferredCrypto();
      if (pc != null && pc != undefined) {
        return pc.ticker;
      }
    } catch (err) {
      return "";
    }
  }
  returnCryptoAddressByTicker(ticker="SAITO") {
    try {
      if (ticker === "SAITO") {
	      return this.returnPublicKey();
      } else {
        let cmod = this.returnCryptoModuleByTicker(ticker);
        return cmod.returnAddress();
      }
    } catch (err) {
    }
    return "";
  }
  /**
   * A user can set their preferred crypto within the Saito Lite environment. This will be stored
   * in their local storage and can be retrieved by other modules here for any purpose.
   * @param {String} address - How much of the token to transfer
   * @param {String} to - Pubkey/address to send to
   * @abstract
   * @return {Int} Bool as int
   */
  isOurPreferredCryptoAddress(address, ticker) {
    if (address == this.returnPublicKey()) { return 1; }
    return 0;
  }
  /**
   * Get's balance from user's preferred crypto module.
   * @param {Array} addresses - Array of addresses
   * @param {Function} mycallback - (Array of {address: {String}, balance: {Int}}) -> {...}
   * @param {String} ticker - Ticker of install crypto module
   * @return {Array} Array of {address: {String}, balance: {Int}}
   */
  async returnPreferredCryptoBalances(addresses=[], mycallback=null, ticker="") {
    if (ticker == "") { ticker = this.wallet.preferred_crypto; }
    let cryptomod = this.returnCryptoModuleByTicker(ticker);
    let returnObj = [];
    let balancePromises = [];
    for (let i = 0; i < addresses.length; i++) {
      balancePromises.push(cryptomod.returnBalance(addresses[i]));
    }
    let balances = await Promise.all(balancePromises);
    for (let i = 0; i < addresses.length; i++) {
      returnObj.push({address: addresses[i], balance: balances[i]});
    }
    if (mycallback != null) { mycallback(returnObj); }
    return returnObj;
  }
  /*** courtesy function to simplify balance checks for a single address w/ ticker ***/
  async checkBalance(address, ticker) {
    let robj = await this.returnPreferredCryptoBalances([address], null, ticker);
    if (robj.length < 1) { return 0; }
    if (robj[0].balance) { return robj[0].balance; }
    return 0;
  }
  async returnPreferredCryptoBalance() {
    let cryptomod = this.returnPreferredCrypto();
    return await this.checkBalance(cryptomod.returnAddress(), cryptomod.ticker);
  }
  /**
  * Sends payments to the addresses provided if this user is the corresponding 
  * sender. Will not send if similar payment was found after the given timestamp.
  * @param {Array} senders - Array of addresses
  * @param {Array} receivers - Array of addresses
  * @param {Array} amounts - Array of amounts to send
  * @param {Int} timestamp - Timestamp of time after which payment should be made
  * @param {Function} mycallback - ({hash: {String}}) -> {...}
  * @param {String} ticker - Ticker of install crypto module
  */
  async sendPayment(senders=[], receivers=[], amounts=[], timestamp, mycallback, ticker) {
    // validate inputs
    if (senders.length != receivers.length || senders.length != amounts.length) {
      console.log("Lengths of senders, receivers, and amounts must be the same")
      //mycallback({err: "Lengths of senders, receivers, and amounts must be the same"});
    }
    if (senders.length !== 1) {
      // We have no code which exercises multiple senders/receivers so can't implement it yet.
      console.log('sendPayment ERROR: Only supports one transaction')
      //mycallback({err: "Only supports one transaction"});
    }
    // only send if hasn't been sent before
    if (!this.doesPreferredCryptoTransactionExist(senders, receivers, amounts, timestamp, ticker)) {
      let cryptomod = this.returnCryptoModuleByTicker(ticker);
      for (let i = 0; i < senders.length; i++) {
        if (senders[i] === cryptomod.returnAddress()) {
          // Need to save before we await, otherwise there is a race condition
          this.savePreferredCryptoTransaction(senders, receivers, amounts, timestamp, ticker);
          try {
            let hash = await cryptomod.transfer(amounts[i], receivers[i]);
            // execute callback if exists
            mycallback({hash: hash});
            break;
          } catch(err) {
            // it failed, delete the transaction
            console.log("sendPayment ERROR: payment failed....\n" + err);
            this.deletePreferredCryptoTransaction(senders, receivers, amounts, timestamp, ticker);
            //mycallback({err: err});
            break;
          }
        }
      }
    } else {
      console.log("sendPayment ERROR: already sent");
      //mycallback({err: "already sent"});
    }
  };
  /**
   * Checks that a payment has been received if the current user is the receiver.
   * @param {Array} senders - Array of addresses
   * @param {Array} receivers - Array of addresses
   * @param {Array} amounts - Array of amounts to send
   * @param {Int} timestamp - Timestamp of time after which payment should be made
   * @param {Function} mycallback - (Array of {address: {String}, balance: {Int}}) -> {...}
   * @param {String} ticker - Ticker of install crypto module
   * @param {Int} tries - (default: 36) Number of tries to query the underlying crypto API before giving up. Sending -1 will cause infinite retries.
   * @param {Int} pollWaitTime - (default: 5000) Amount of time to wait between tries
   * @return {Array} Array of {address: {String}, balance: {Int}}
   */
  async receivePayment(senders=[], receivers=[], amounts=[], timestamp, mycallback, ticker, tries = 36, pollWaitTime = 5000) {
    // original design of this interface was to use async/await by returning a promise.
    // Instead there was an insistence on using mycallback. The consumer of this interface does not use
    // async/await or .then(...) so this is being abandoned(i.e. i'm removing the promise) but leaving it
    // here in case someone wants to refactor this or wonders why this interface is this way.
    //return new Promise(async(resolve, reject) => {  

      if (senders.length != receivers.length || senders.length != amounts.length) {
        // There is no way to handle errors with the interface of receivePayment as it's been designed.
        // We will swallow this error and log it to the console and return.
        // Do not delete this console.log, at least maybe the engineer who is maintaining this needs 
        // some hope of figuring out why the game isn't progressing.
        console.log("receivePayment ERROR. Lengths of senders, receivers, and amounts must be the same");
        return;
        // mycallback({err: "Lengths of senders, receivers, and amounts must be the same"});
      }
      if (senders.length !== 1) {
        // There is no way to handle errors with the interface of receivePayment as it's been designed.
        // We will swallow this error and log it to the console and return.
        // Do not delete this console.log, at least maybe the engineer who is maintaining this needs 
        // some hope of figuring out why the game isn't progressing.
        console.log("receivePayment ERROR. Only supports one transaction");
        return;
        //mycallback({err: "Only supports one transaction"});
      }

      //
      // if payment already received, return
      //
      if (this.doesPreferredCryptoTransactionExist(senders, receivers, amounts, timestamp, ticker)) {
        mycallback();
        return;
      }

      let cryptomod = this.returnCryptoModuleByTicker(ticker);
      await cryptomod.onIsActivated();

      //
      // create a function we can loop through to check if the payment has come in....
      //
      let check_payment_function = async() => {
        return await cryptomod.hasPayment(amounts[0], senders[0], receivers[0], timestamp - 3); // subtract 3 seconds in case system time is slightly off
      }

      let poll_check_payment_function = async() => {
        console.log("poll_check_payment_function remaining tries: " + tries);
        let result = null;
        try {
          result = await check_payment_function();
        } catch(err) {
          // if check_payment_function throws an error, we want to bail out,
          // there's no point trying another 100 times.
          // There is no way to handle errors with the interface of receivePayment as it's been designed.
          // We will swallow this error and log it to the console and return.
          // Do not delete this console.log, at least maybe the engineer who is maintaining this needs 
          // some hope of figuring out why the game isn't progressing.
          console.log("receivePayment ERROR." + err);
          return;
          //mycallback({err: err});
        }
        did_complete_payment(result);
      };

      let did_complete_payment = (result) => {
        if (result) {
          // The transaction was found, we're done.
          console.log("TRANSACTION FOUND");
          this.savePreferredCryptoTransaction(senders, receivers, amounts, timestamp, ticker);
          mycallback(result);
        } else {
          // The transaction was not found.
          tries--;
          // This is === rather than < because sending -1 is a way to do infinite polling
          if(tries != 0) {
            setTimeout(() => {
              poll_check_payment_function();
            }, pollWaitTime);
          } else {
            // There is no way to handle errors with the interface of receivePayment as it's been designed.
            // We will swallow this error and log it to the console and return.
            // Do not delete this console.log, at least maybe the engineer who is maintaining this needs 
            // some hope of figuring out why the game isn't progressing.
            console.log("Did not receive payment after " + ((pollWaitTime * tries)/1000) + " seconds");
            return;
            // mycallback({err: "Did not receive payment after " + ((pollWaitTime * tries)/1000) + " seconds"});
          }
        }
      }
      poll_check_payment_function();
    //});
  }

  savePreferredCryptoTransaction(senders=[], receivers=[], amounts, timestamp, ticker) {

    let sig = this.app.crypto.hash(JSON.stringify(senders) + JSON.stringify(receivers) + JSON.stringify(amounts) + timestamp + ticker);    
    this.wallet.preferred_txs.push({
      sig : sig,
      ts  : (new Date().getTime())
    })

    for (let i = this.wallet.preferred_txs.length-1; i >= 0; i--) {
      // delete references after ~30 hours
      if (this.wallet.ts < ((new Date().getTime()) - 100000000)) {
        this.wallet.preferred_txs.splice(i, 1);
      }
    }

    this.saveWallet();

    return 1;
  }

  doesPreferredCryptoTransactionExist(senders=[], receivers=[], amounts, timestamp, ticker) {
    let sig = this.app.crypto.hash(JSON.stringify(senders) + JSON.stringify(receivers) + JSON.stringify(amounts) + timestamp + ticker);
    for (let i = 0; i < this.wallet.preferred_txs.length; i++) {
      if (this.wallet.preferred_txs[i].sig === sig) {
        return 1;
      }
    }
    return 0;
  }

  deletePreferredCryptoTransaction(senders=[], receivers=[], amounts, timestamp, ticker) {
    let sig = this.app.crypto.hash(JSON.stringify(senders) + JSON.stringify(receivers) + JSON.stringify(amounts) + timestamp + ticker);    
    for (let i = 0; i < this.wallet.preferred_txs.length; i++) {
      if (this.wallet.preferred_txs[i].sig === sig) {
        this.wallet.preferred_txs.splice(i, 1);
      }
    }
  }
  ///////////////////////////
  // END PREFERRED CRYPTOS //
  ///////////////////////////

}
module.exports = Wallet;

