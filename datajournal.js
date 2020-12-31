const fs = require('fs');
const readline = require('readline');
const db = require('./database.js');

const journalFileName = "datajournal";
let ws = null;
let journalTimer = null;

// add record or array of records to journal
// return null if success, else return error message string
function addRecords(recs) {
  if (!Array.isArray(recs)) {
    recs = [recs];
  }
  stopJournalTimer();
  startWriteJournal();
  let firstErrMsg = null;
  recs.forEach(rec => {
    const errMsg = db.validateRecord(rec);
    if (errMsg) {
      console.log("bad record received, "+errMsg);
      if (!firstErrMsg) {
        firstErrMsg = errMsg;
      }
    } else {
      // must write to journal first because db adds extra fields like tm
      writeJournal(rec);
      db.addRecord(rec);
    }
  });
  flushJournal();
  startJournalTimer();
  return firstErrMsg;
}

// open journal file if not already open and start buffering
function startWriteJournal() {
  if (!ws) {
    ws = fs.createWriteStream(journalFileName, {flags:'a'});
    ws.on('error', err => {
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
  journalTimer = setTimeout(() => {
    journalTimer = null;
    if (ws) {
      ws.end();
      ws = null;
    }
  }, 60000);
}
 
// read journal and apply all changes to cache
function readJournal() {
  if (fs.existsSync(journalFileName)) {
    let lineNum = 0;
    const rl = readline.createInterface({
      input: fs.createReadStream(journalFileName),
      crlfDelay: Infinity
    });  
    rl.on('error', err => {
      console.log(journalFileName+" read failed with "+err.code);
    });
    rl.on('line', line => {
      lineNum += 1;
      try {
        const rec = JSON.parse(line);
        const errMsg = db.validateRecord(rec);
        if (errMsg) {
          console.log(journalFileName+" bad record on line "+lineNum+": "+errMsg);
        } else {
          db.addRecord(rec);
        }
      } catch (e) {
        console.log(journalFileName+" JSON parse error on line "+lineNum);
        console.log(e);
      }
    });
    rl.on('close', () => {
      console.log(journalFileName+ " read finished, "+lineNum+" lines");
    });
  } else {
    console.log(journalFileName+" not found, skipping");
  }
}

module.exports = {
  addRecords: addRecords,
  readJournal: readJournal
};
