const fs = require('fs');
const path = require('path');
const thyme = require("./thyme");

const years = [];

// validate record
// check fields for known souces, but allow unrecognized sources
// return null if valid, else return error message string
function validateRecord(rec) {
  if (typeof rec !== 'object') {
    return "not an object";
  } else if (typeof rec.t !== 'string') {
    return "no time";
  } else if (!thyme.parseTime(rec.t)) {
    return "bad time format";
  } else if (typeof rec.src !== 'string') {
    return "no source";
  } else if (rec.src.startsWith("ma")) {
    // Mary Anne
    if (typeof rec.inp !== 'number') {
      return "no input value in ma record";
    }
  }
  // record is valid
  return null;
}

// add record to database
function addRecord(rec) {
  const tm = thyme.parseTime(rec.t);
  if (tm) {
    if (!years[tm.year]) {
      years[tm.year] = {months: [], tm: tm};
    }
    const year = years[tm.year];
    if (!year.months[tm.month]) {
      year.months[tm.month] = {days: [], tm: tm};
    }
    const month = year.months[tm.month];
    if (!month.days[tm.day]) {
      month.days[tm.day] = {recs: [], tm: tm, loaded: false, changed: false};
    }
    const day = month.days[tm.day];
    // make sure we've loaded any records already saved to file for this day
    if (!day.loaded) {
      // note readDayFile calls addRecord.. must set loaded first to avoid infinite recursion!
      day.loaded = true;
      readDayFile(day);
    }
    // ignore duplicates
    if (!findRecord(day.recs, tm, rec.src)) {
      // add parsed time to record, but please remove before saving to file
      rec.tm = tm;
      day.recs.push(rec);
      // normally records are added in chronological order
      // if new record is out of sequence, resort the array
      if (day.recs.length > 1) {
        const oldLastRec = day.recs[day.recs.length - 2];
        if (tm.ms < oldLastRec.tm.ms) {
          console.log("resorting array for "+thyme.formatDate(tm));
          day.recs.sort(compareRecords);
        }
      }
      day.changed = true;
    }
  }
}

// search array of records for specified time and source
// return record if found, else return null
function findRecord(recs, tm, src) {
  // TODO: improvement, use binary search!
  return recs.find(rec => rec.tm.ms === tm.ms && rec.src === src);
}

// compare records for sorting
function compareRecords(r1, r2) {
  return r2.tm.ms - r1.tm.ms;
}

// return copy of record with fields removed that should not be saved to file
function cleanRecord(rec) {
  const copyOfRec = Object.assign({}, rec);
  delete copyOfRec.tm;
  return copyOfRec;
}

// write all changed records to files
function writeAllChanges() {
  console.log("writeAllChanges");//mhs temp
  years.forEach(year => {
    year.months.forEach(month => {
      month.days.forEach(day => {
        if (day.changed) {
          writeDayFile(day);
          day.changed = false;
        }
      });
    });
  });
}

// return month directory path for specified time
function makeMonthPath(tm) {
  return path.join("years", tm.year.toString(), (tm.month + 100).toString().substring(1));
}

// return day file path for specified time
function makeDayPath(tm) {
  return path.join(makeMonthPath(tm), (tm.day + 100).toString().substring(1));
}

// write day records to file
function writeDayFile(day) {
  const monthPath = makeMonthPath(day.tm);
  fs.mkdirSync(monthPath, {recursive: true});
  const dayPath = makeDayPath(day.tm);
  const cleanRecs = day.recs.map(cleanRecord);
  console.log("writing", dayPath);
  fs.writeFileSync(dayPath, JSON.stringify(cleanRecs, null, 1));
}

// read day records from file, if file exists
function readDayFile(day) {
  const dayPath = makeDayPath(day.tm);
  if (fs.existsSync(dayPath)) {
    try {
      console.log("reading", dayPath);
      const recs = JSON.parse(fs.readFileSync(dayPath));
      if (Array.isArray(recs)) {
        recs.forEach(rec => addRecord(rec));
      } else {
        console.log("JSON is not an array in "+dayPath);
      }
    } catch (e) {
      console.log("JSON parse error in "+dayPath);
      //console.log(e);
    }
  }
}

module.exports = {
  validateRecord: validateRecord,
  addRecord: addRecord,
  writeAllChanges: writeAllChanges
};
