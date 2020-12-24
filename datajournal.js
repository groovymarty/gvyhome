var fs = require('fs');
var readline = require('readline');

var journalFileName = "datajournal";
var ws = null;
var journalTimer = null;

// add record to journal
function addRecord(rec) {
  stopJournalTimer();
  startWriteJournal();
  writeJournal(rec);
  flushJournal();
  startJournalTimer();
}

// open journal file if not already open and start buffering
function startWriteJournal() {
  if (!ws) {
    ws = fs.createWriteStream(journalFileName, {flags:'a'});
    ws.on('error', function(err) {
      console.log(journalFileName+" write failed with "+err.code);
      stopJournalTimer();
      ws.end();
      ws = null;
    });
  }
  ws.cork();
}

// write a record to journal
function writeJournal(rec) {
  if (ws) {
    ws.write(JSON.stringify(rec) + "\n");
  }
}

// flush buffer to journal file
function flushJournal() {
  if (ws) {
    ws.uncork();
  }
}

// stop journal timer if it is running
function stopJournalTimer() {
  if (journalTimer) {
    clearTimeout(journalTimer);
    journalTimer = null;
  }
}

// start journal timer, close journal file after 60 seconds of inactivity
function startJournalTimer() {
  stopJournalTimer();
  journalTimer = setTimeout(function() {
    journalTimer = null;
    if (ws) {
      console.log("closing journal");
      ws.end();
      ws = null;
    }
  }, 60000);
}
 
// read journal and apply all changes to cache
function readJournal() {
  if (fs.existsSync(journalFileName)) {
    var lineNum = 1;
    var rl = readline.createInterface({
      input: fs.createReadStream(journalFileName),
      crlfDelay: Infinity
    });  
    rl.on('error', function(err) {
      console.log(journalFileName+" read failed with "+err.code);
    });
    rl.on('line', function(line) {
      try {
        var chg = JSON.parse(line);
        if (typeof chg === "object" && chg.id) {
          var id = chg.id;
          delete chg.id;
          delete chg.userId;
          delete chg.ts;
          applyToCache(id, chg);
        } else {
          console.log("Meta chg ignored, not an object or lacks id, line "+lineNum);
        }
      } catch (e) {
        console.log(journalFileName+" JSON parse error on line "+lineNum);
      }
      lineNum += 1;
    });
    rl.on('close', function() {
      console.log(journalFileName+ " read finished");
      console.log("meta change cache: "+(Object.keys(cache).length)+" entries");
    });
  } else {
    console.log(journalFileName+" not found, skipping");
  }
}

module.exports = {
  addRecord: addRecord,
  readJournal: readJournal
};
