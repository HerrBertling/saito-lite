const ModTemplate = require('../../lib/templates/modtemplate');

class ExplorerCore extends ModTemplate {
  constructor(app) {
    super(app);
    this.app = app;
    this.name = "Explorer";
    this.description = "Block explorer for the Saito blockchain. Not suitable for lite-clients";
    this.categories = "Utilities Dev";
  }

  onConfirmation(blk, tx, conf, app) {
    if (conf == 0) {
      // removed addTransactionsToDatabase from here
    }
  }

  onNewBlock(blk, lc) {
    // console.log('explorer - on new block');
    this.addTransactionsToDatabase(blk);
  }

  async addTransactionsToDatabase(blk) {
    try {
      for (let i = 0; i < blk.transactions.length; i++) {
        if (blk.transactions[i].transaction.type >= -999) {
          for (let ii = 0; ii < blk.transactions[i].transaction.to.length; ii++) {
            if (blk.transactions[i].transaction.to[ii].type >= -999) {
              let sql = `INSERT OR IGNORE INTO transactions (
                                address, 
                                amt, 
                                bid, 
                                tid, 
                                sid, 
                                bhash, 
                                lc, 
                                rebroadcast,
                                sig,
                                ts,
                                block_ts,
                                type,
                                tx_from,
                                tx_to,
                                name,
                                module
                                )
                             VALUES (
                                $address, 
                                $amt, 
                                $bid, 
                                $tid, 
                                $sid, 
                                $bhash, 
                                $lc, 
                                $rebroadcast,
                                $sig,
                                $ts,
                                $block_ts,
                                $type,
                                $tx_from,
                                $tx_to,
                                $name,
                                $module
                                )`;
              let ttype = 0;
              let tname = "";
              let tmodule = "";
              if (blk.transactions[i].msg.type) {
                ttype = blk.transactions[i].msg.type;
              }
              if (blk.transactions[i].msg.name) {
                tname = blk.transactions[i].msg.name;
              }
              if (blk.transactions[i].msg.module) {
                tmodule = blk.transactions[i].msg.module;
              }
              let params = {
                $address: blk.transactions[i].transaction.to[ii].add,
                $amt: blk.transactions[i].transaction.to[ii].amt,
                $bid: blk.block.id,
                $tid: blk.transactions[i].transaction.id,
                $sid: ii,
                $bhash: blk.returnHash(),
                $lc: 1,
                $rebroadcast: 0,
                $sig: blk.transactions[i].transaction.sig,
                $ts: blk.transactions[i].transaction.ts,
                $block_ts: blk.block.ts,
                $type: ttype,
                $tx_from: blk.transactions[i].transaction.from[0].add,
                $tx_to: blk.transactions[i].transaction.to[ii].add,
                $name: tname,
                $module: tmodule
              }
              await this.app.storage.executeDatabase(sql, params, "explorer");
            }
          }
        }
      }
      return;
    } catch (err) {
      console.error(err);
    }

  }


  webServer(app, expressapp) {

    var explorer_self = app.modules.returnModule("Explorer");

    ///////////////////
    // web resources //
    ///////////////////
    expressapp.get('/explorer/', function (req, res) {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.write(explorer_self.returnIndexHTML(app));
      res.end();
      return;
    });
    expressapp.get('/explorer/style.css', function (req, res) {
      res.sendFile(__dirname + '/web/style.css');
      return;
    });
    expressapp.get('/explorer/utils.js', function (req, res) {
      res.sendFile(__dirname + '/web/utils.js');
      return;
    });
    expressapp.get('/explorer/vip', function (req, res) {
      explorer_self.printVIP(res);
    });
    expressapp.get('/explorer/block', function (req, res) {

      var hash = req.query.hash;

      if (hash == null) {

        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        res.write("NO BLOCK FOUND1: ");
        res.end();
        return;

      } else {

        if (hash != null) {

          let blk = explorer_self.app.storage.loadBlockByHash(hash);

          console.log("BLOCK: " + JSON.stringify(blk.block));

          if (blk == null) {
            res.setHeader('Content-type', 'text/html');
            res.charset = 'UTF-8';
            res.write("NO BLOCK FOUND: ");
            res.end();
            return;
          } else {
            res.setHeader('Content-type', 'text/html');
            res.charset = 'UTF-8';
            res.write(explorer_self.returnBlockHTML(app, hash));
            res.end();
            return;
          }

        }
      }
    });
    expressapp.get('/explorer/mempool', function (req, res) {

      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.write(explorer_self.returnMempoolHTML());
      res.end();
      return;

    });
    expressapp.get('/explorer/blocksource', function (req, res) {

      var hash = req.query.hash;

      if (hash == null) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        res.write("NO BLOCK FOUND 1: ");
        res.end();
        return;

      } else {

        if (hash != null) {

          let blk = explorer_self.app.storage.loadBlockByHash(hash);
          if (blk == null) {
            res.setHeader('Content-type', 'text/html');
            res.charset = 'UTF-8';
            res.write("NO BLOCK FOUND 2: ");
            res.end();
            return;
          } else {
            res.setHeader('Content-type', 'text/html');
            res.charset = 'UTF-8';
            res.write(explorer_self.returnBlockSourceHTML(app, hash));
            res.end();
            return;
          }
        }
      }
    });

    expressapp.get('/explorer/transaction', async function (req, res) {

      var tid = req.query.tid;
      if (tid == null) {

        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        res.write("NO TRANSACTION FOUND: ");
        res.end();
        return;

      } else {

        let sql = "SELECT bhash FROM transactions WHERE tid = $tid AND lc = 1";
        let params = { $tid: tid };

        //app.storage.queryDatabase(sql, params, function (err, row) {
        //let row = await explorer_self.db.get(sql, params);
        let row = await explorer_self.app.storage.queryDatabase(sql, params, "explorer");

        if (row == null || row.length == 0) {

          res.setHeader('Content-type', 'text/html');
          res.charset = 'UTF-8';
          res.write("NO TRANSACTION FOUND: ");
          res.end();
          return;

        } else {

          var bhash = row[0].bhash;

          let blk = explorer_self.app.storage.loadBlockByHash(bhash);
          if (blk == null) {
            res.setHeader('Content-type', 'text/html');
            res.charset = 'UTF-8';
            res.write("NO BLOCK FOUND1: ");
            res.end();
            return;
          } else {
            res.setHeader('Content-type', 'text/html');
            res.charset = 'UTF-8';
            res.write(explorer_self.returnTransactionHTML(blk, tid));
            res.end();
            return;
          }
        }
      }
    });

  }

  returnHead() {
    return '<html> \
  <head> \
    <meta charset="utf-8"> \
    <meta http-equiv="X-UA-Compatible" content="IE=edge"> \
    <meta name="viewport" content="width=device-width, initial-scale=1"> \
    <meta name="description" content=""> \
    <meta name="author" content=""> \
    <title>Saito Network: Blockchain Explorer</title> \
    <link rel="stylesheet" type="text/css" href="/saito/style.css" /> \
    <link rel="stylesheet" type="text/css" href="/explorer/style.css" /> \
    <link rel="stylesheet" type="text/css" href="/saito/lib/jsonTree/jsonTree.css" /> \
    <link rel="stylesheet" href="/saito/lib/font-awesome-5/css/all.css" type="text/css" media="screen"> \
    <script src="/explorer/utils.js"></script> \
    <script src="/saito/lib/jsonTree/jsonTree.js"></script> \
    <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png"> \
    <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png"> \
    <link rel="icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png"> \
    <link rel="apple-touch-icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png"></link> \
  </head> ';
  }

  returnHeader() {
    return '<body> \
        \
        <div class="header header-home"> \
        <img class="logo" src="/logo.svg"> \
    </div>';
  }

  returnIndexMain() {
    return '<div class="explorer-main"> \
        <div class="block-table"> \
          <div class="explorer-data"><h4>Server Address:</h4></div> <div class="address">'+ this.app.wallet.returnPublicKey() + '</div> \
          <div class="explorer-data"><h4>Balance:</h4> </div><div>'+ this.app.wallet.returnBalance().toString().split(".")[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + this.app.wallet.returnBalance().toString().split(".")[1] + '</div> \
          <div class="explorer-data"><h4>Mempool:</h4></div> <div><a href="/explorer/mempool">'+ this.app.mempool.transactions.length + ' txs</a></div> \
        </div>' + '\
        <div class="explorer-data"><h4>Search for Block (by hash):</h4> \
        <form method="get" action="/explorer/block"><div class="one-line-form"><input type="text" name="hash" class="hash-search-input" /> \
        <input type="submit" id="explorer-button" class="button" value="search" /></div></form> </div> \
        <div class="explorer-data"><h3>Recent Blocks:</h3></div> \
        <div id="block-list">'+ this.listBlocks() + '</div> \
      </div> ';
  }

  returnPageClose() {
    return '</body> \
        </html>';
  }

  /////////////////////
  // Main Index Page //
  /////////////////////
  returnIndexHTML(app) {
    var html = this.returnHead() + this.returnHeader() + this.returnIndexMain() + this.returnPageClose();
    return html;
  }

  returnMempoolHTML() {
    var html = this.returnHead()
    html += this.returnHeader()
    html += '<div class="explorer-main">'
    html += '<a class="button" href="/explorer/"><i class="fas fa-cubes"></i> back to blocks</a>'
    html += '<h3>Mempool Transactions:</h3><div data-json="' + encodeURI(JSON.stringify(this.app.mempool.transactions, null, 4)) + '" class="json">' + JSON.stringify(this.app.mempool.transactions) + '</div></div>'
    html += this.returnInvokeJSONTree();
    html += this.returnPageClose();
    return html;
  }

  returnBlockSourceHTML(app, hash) {
    var html = this.returnHead()
    html += this.returnHeader()
    html += '<div class="explorer-main">'
    html += '<a class="button" href="/explorer/block?hash=' + hash + '"><i class="fas fa-cubes"></i> back to block</a>'
    html += '<h3>Block Source (' + hash + '):</h3><div class="blockJson"><div class="loader"></div></div>';
    html += '<script> \
        fetchRawBlock("' + hash + '"); \
      </script>';
    //html += this.returnInvokeJSONTree();
    html += this.returnPageClose();
    return html;
  }

  returnInvokeJSONTree() {
    var jstxt = '\n <script> \n \
    var jsonObj = document.querySelector(".json"); \n \
    var jsonTxt = decodeURI(jsonObj.dataset.json); \n \
    jsonObj.innerHTML = ""; \n \
    var tree = jsonTree.create(JSON.parse(jsonTxt), jsonObj); \n \
    </script> \n'
    return jstxt;
  }

  listBlocks() {

    var explorer_self = this;

    var html = '<div class="blockchain-table">';
    html += '<div class="table-header"></div><div class="table-header">id</div><div class="table-header">block hash</div><div class="table-header">tx</div><div class="table-header">previous block</div>';
    for (var mb = explorer_self.app.blockchain.index.blocks.length - 1; mb >= 0 && mb > explorer_self.app.blockchain.index.blocks.length - 200; mb--) {
      if (explorer_self.app.blockchain.lc_pos == mb) {
        html += '<div>*</div>';
      } else {
        html += '<div></div>';
      }
      html += '<div><a href="/explorer/block?hash=' + explorer_self.app.blockchain.index.blocks[mb].returnHash('hex') + '">' + explorer_self.app.blockchain.index.blocks[mb].block.id + '</a></div>';
      html += '<div><a href="/explorer/block?hash=' + explorer_self.app.blockchain.index.blocks[mb].returnHash('hex') + '">' + explorer_self.app.blockchain.index.blocks[mb].returnHash() + '</a></div>';
      html += '<div>' + explorer_self.app.blockchain.index.blocks[mb].transactions.length + '</div>';
      html += '<div class="elipsis">' + explorer_self.app.blockchain.index.blocks[mb].block.prevbsh + '</div>';
      //html += '</tr>';
    }
    html += '</div>';
    return html;
  }

  ////////////////////////
  // Single Block Page  //
  ////////////////////////
  returnBlockHTML(app, hash) {
    var html = this.returnHead() + this.returnHeader();
    /*html += '<div class="explorer-main"> \
      <a href="/explorer"> \
          <button class="explorer-nav"><i class="fas fa-cubes"></i> back to blocks</button> \
        </a> \
      <h3>Block Explorer:</h3> \
        '+ this.listTransactions(blk) + ' \
      </div> ';
      */
      html += '<div class="explorer-main"> \
      <a href="/explorer"> \
          <button class="explorer-nav"><i class="fas fa-cubes"></i> back to blocks</button> \
        </a> \
      <h3>Block Explorer:</h3> \
      <div class="txlist"><div class="loader"></div></div> \
      </div> \
      <script> \
        fetchBlock("' + hash + '"); \
      </script> \
      ';

    html += this.returnPageClose();
    return html;

  }

  /* deprecated
  listTransactions(blk) {

    var explorer_self = this;

    var html = '<div class="block-table">';
    html += '<div><h4>id</h4></div><div>' + blk.block.id + '</div>';
    html += '<div><h4>hash</h4></div><div>' + blk.returnHash('hex') + '</div>';
    html += '<div><h4>source</h4></div><div><a href="/explorer/blocksource?hash=' + blk.returnHash('hex') + '">click to view source</a></div>';
    html += '</div>';

    if (blk.transactions.length > 0) {

      html += '<h3>Bundled Transactions:</h3>';

      html += '<div class="block-transactions-table">';
      html += '<div class="table-header">id</div>';
      html += '<div class="table-header">sender</div>';
      html += '<div class="table-header">fee</div>';
      html += '<div class="table-header">type</div>';
      html += '<div class="table-header">module</div>';

      for (var mt = 0; mt < blk.transactions.length; mt++) {
        var tmptx = blk.transactions[mt];

        html += '<div><a href="/explorer/transaction?bhash=' + blk.returnHash() + '&tid=' + tmptx.transaction.id + '">' + tmptx.transaction.id + '</a></div>';
        html += '<div><a href="/explorer/transaction?bhash=' + blk.returnHash() + '&tid=' + tmptx.transaction.id + '">' + tmptx.transaction.from[0].add + '</a></div>';
        html += '<div>' + tmptx.returnFees() + '</div>';
        html += '<div>' + tmptx.transaction.type + '</div>';
        if (tmptx.transaction.type == 0) {
          html += '<div>' + tmptx.msg.module + '</div>';
        }
        if (tmptx.transaction.type == 1) {
          html += '<div>' + tmptx.msg.name + '</div>';
        }
        if (tmptx.transaction.type > 1) {
          html += '<div> </div>';
        }

      }
      html += '</div>';
    }
    return html;
  }
  */




  //////////////////////////////
  // Single Transaction Page  //
  //////////////////////////////
  returnTransactionHTML(blk, txid) {

    var tmptx;

    for (var x = 0; x < blk.transactions.length; x++) {
      if (blk.transactions[x].transaction.id == txid) {
        tmptx = blk.transactions[x];
      }
    }
    var html = this.returnHead() + this.returnHeader();
    html += '<div class="explorer-main"> \
        <div class="explorer-nav-buttons"> \
      <a class="button" href="/explorer"><i class="fas fa-cubes"></i> back to blocks</a>  \
      <a class="button" href="/explorer/block?hash=' + blk.returnHash() + '"><i class="fas fa-list"></i> back to transactions</a> \
      </div> \
      <h3>Transaction Explorer:</h3> \
      <div data-json="' + encodeURI(JSON.stringify(tmptx, null, 4)) + '" class="json"> \
        '+ JSON.stringify(tmptx, null, 4) + ' \
      </div></div> '
    html += this.returnInvokeJSONTree();
    html += this.returnPageClose();

    return html;
  }

  shouldAffixCallbackToModule() { return 1; }

}

module.exports = ExplorerCore;
