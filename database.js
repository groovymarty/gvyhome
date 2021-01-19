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

// return day for specified timestamp, create if necessary
function findOrAddDay(tm) {
  if (!years[tm.year]) {
    years[tm.year] = {months: [], tm: Object.assign({}, tm)};
  }
  const year = years[tm.year];
  if (!year.months[tm.month]) {
    year.months[tm.month] = {days: [], tm: Object.assign({}, tm)};
  }
  const month = year.months[tm.month];
  if (!month.days[tm.day]) {
    // TODO: day should be a class with a constructor
    month.days[tm.day] = {
      recs: [], tm: Object.assign({}, tm),
      loaded: false, changed: false, version: 0, maInpStart: 0
    };
  }
  return month.days[tm.day];
}

// add record to database
function addRecord(rec) {
  const tm = thyme.parseTime(rec.t);
  if (tm) {
    const day = findOrAddDay(tm);
    // make sure we've loaded any records already saved to file for this day
    if (!day.loaded) {
        loadDay(day);
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
  return r1.tm.ms - r2.tm.ms;
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
          day.version += 1;
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
  return path.join(makeMonthPath(tm), (tm.day + 100).toString().substring(1)+".json");
}

// make directory recursive
// recursive option in fs.mkdirSync accomplishes same thing, but not supported
// in some older versions of node.js
function mkdirRecursive(dir) {
  if (dir !== "." && dir !== path.sep && !fs.existsSync(dir)) {
    mkdirRecursive(path.dirname(dir));
    fs.mkdirSync(dir);
  }
}

// write day records to file
function writeDayFile(day) {
  const monthPath = makeMonthPath(day.tm);
  mkdirRecursive(monthPath);
  const dayPath = makeDayPath(day.tm);
  const dayToFile = {
    recs: day.recs.map(cleanRecord),
    version: day.version,
    maInpStart: day.maInpStart
  };
  console.log("writing", dayPath);
  fs.writeFileSync(dayPath, JSON.stringify(dayToFile, null, 1));
}

// read day records from file, if file exists
function readDayFile(day) {
  let dayPath = makeDayPath(day.tm);
  // temp, above was const
  if (!fs.existsSync(dayPath)) {
    // if .json file doesn't exist try without extension
    dayPath = dayPath.substring(0, dayPath.length-5);
  }
  if (fs.existsSync(dayPath)) {
    try {
      console.log("reading", dayPath);
      const dayFromFile = JSON.parse(fs.readFileSync(dayPath));
      if (typeof dayFromFile === 'object') {
        if (Array.isArray(dayFromFile.recs)) {
          // note this will set changed flag for day unless record is already loaded
          dayFromFile.recs.forEach(rec => addRecord(rec));
        } else {
          console.log("no recs array in "+dayPath);
        }
        // if day file has these properties, set them in database
        if ('version' in dayFromFile) {
          day.version = dayFromFile.version;
        }
        if ('manInpStart' in dayFromFile) {
          day.manInpStart = dayFromFile.manInpStart;
        }
      } else {
        console.log("JSON is not an object in "+dayPath);
      }
    } catch (e) {
      console.log("JSON parse error in "+dayPath);
      console.log(e);
    }
  }
}

// load day file
function loadDay(day) {
  // must set loaded flag before calling readDayFile to avoid infinite recursion!
  day.loaded = true;
  readDayFile(day);
}

// load range of days into database
// return null if success, else return error message string
function loadDays(tStart, tEnd) {
  const tm = thyme.parseTime(tStart);
  if (!tm) {
    return "bad start time";
  }
  const tmEnd = thyme.parseTime(tEnd);
  if (!tmEnd) {
    return "bad end time";
  }
  while (tm.ms < tmEnd.ms) {
    loadDay(findOrAddDay(tm));
    thyme.setTime(tm, tm.ms + 24 * 60 * 60 * 1000);
  }
  return null;
}

module.exports = {
  validateRecord: validateRecord,
  cleanRecord: cleanRecord,
  addRecord: addRecord,
  writeAllChanges: writeAllChanges,
  loadDays: loadDays
};
