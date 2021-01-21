const fs = require('fs');
const readline = require('readline');
const db = require('./database.js');

const journalFileName = "datajournal";
let ws = null;
let journalTimer = null;
let rotateRequested = false;

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
      db.addRecord(rec, true);
      db.addLatest(rec);
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

// close journal file and rotate files if requested
function closeJournal() {
  if (ws) {
    ws.end();
    ws = null;
  }
  if (rotateRequested) {
    rotateRequested = false;
    rotateJournal();
  }
}

// stop journal timer if it is running
function stopJournalTimer() {
  if (journalTimer) {
    clearTimeout(journalTimer);
    journalTimer = null;
  }
}

// start journal timer, close journal file after 10 seconds of inactivity
// rotate journal after closing, if requested
function startJournalTimer() {
  stopJournalTimer();
  journalTimer = setTimeout(closeJournal, 10000);
}
 
// read journal and populate database
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
          db.addRecord(rec, true);
          db.addLatest(rec);
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

// request rotate
function requestRotate() {
  rotateRequested = true;
  startJournalTimer();
}

// rotate journal
// rename current journal file to .1, current .1 file to .2, and so on up to .9
// create empty journal file for new records going forward
// what's the point of all this?  i'm reluctant to delete data!
// so keep journal files around for awhile, even after the records are incorporated into the database
// just in case..
function rotateJournal() {
  // delete file .9, if it exists
  fs.rmSync(journalFileName+".9", {force: true});
  // rename .8 to .9, .7 to .8, and so through .1 to .2
  for (let fileNum=8; fileNum >= 1; fileNum--) {
    if (fs.existsSync(journalFileName+"."+fileNum)) {
      fs.renameSync(journalFileName+"."+fileNum, journalFileName+"."+(fileNum+1));
    }
  }
  // rename current journal to .1
  if (fs.existsSync(journalFileName)) {
    fs.renameSync(journalFileName, journalFileName+".1");
  }
  // create empty journal file
  fs.closeSync(fs.openSync(journalFileName, 'w'));
  console.log("journal rotated");
}

module.exports = {
  addRecords: addRecords,
  readJournal: readJournal,
  stopJournalTimer: stopJournalTimer,
  closeJournal: closeJournal,
  requestRotate: requestRotate
};
