const fs = require('fs');
const path = require('path');
const thyme = require("./thyme");

// here is the database in memory
const years = [];

// latest record received for each source
const latestRecs = {};

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
  } else if (/^ma\d+$/.test(rec.src)) {
    // Mary Anne
    if (typeof rec.inp !== 'number') {
      return "no input value in ma record";
    }
  }
  // record is valid
  return null;
}

// return day for specified timestamp, create if necessary
// if new day created, use specified initial state or empty state if none specified
function findOrAddDay(tm, initState) {
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
      recs: [],
      tm: Object.assign({}, tm),
      loaded: false,
      changed: false,
      version: 0,
      initState: initState || {}
    };
  }
  return month.days[tm.day];
}

// add record to database
// live flag determines initial state if new day is created
// if live is true, initial state is latest records received
// otherwise initial state is empty
// return true if new record was added, false if record is a duplicate
function addRecord(rec, live) {
  const tm = thyme.parseTime(rec.t);
  if (tm) {
    const day = findOrAddDay(tm, live ? latestRecs : {});
    // make sure we've loaded any records already saved to file for this day
    if (!day.loaded) {
      loadDay(day);
    }
    // ignore duplicates (only looks at source and time)
    if (!findRecord(day.recs, tm, rec.src)) {
      // add parsed time to record, but please remove before saving to file
      rec.tm = tm;
      day.recs.push(rec);
      // normally records are added in chronological order
      // if new record is out of sequence, resort the array
      if (day.recs.length > 1) {
        const oldLastRec = day.recs[day.recs.length - 2];
        if (tm.ms < oldLastRec.tm.ms) {
          console.log("resorting array for "+tm.formatDate());
          day.recs.sort(compareRecords);
        }
      }
      day.changed = true;
      return true;
    }
  }
  return false;
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

// shallow equality test for records
// return true if records have same properties with equal values
// works best with clean records (tm fields will make records unequal)
function recsAreEqual(r1, r2) {
  if (typeof r1 === 'object' && typeof r2 === 'object') {
    const keys1 = Object.keys(r1);
    const keys2 = Object.keys(r2);
    return keys1.count === keys2.count &&
      keys1.every(key => r1[key] === r2[key]);
  } else {
    return false;
  }
}

// add record to latest
// use this mainly for incoming live records
function addLatest(rec) {
  latestRecs[rec.src] = cleanRecord(rec);
}

// write all changed records to files
function writeAllChanges() {
  console.log("writeAllChanges");
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
    initState: day.initState
  };
  console.log("writing", dayPath);
  fs.writeFileSync(dayPath, JSON.stringify(dayToFile, null, 1));
}

// read day records from file, if file exists
function readDayFile(day) {
  const dayPath = makeDayPath(day.tm);
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
        if ('initState' in dayFromFile) {
          day.initState = dayFromFile.initState;
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
// loading day file does not set the changed flag
function loadDay(day) {
  // must set loaded flag before calling readDayFile to avoid infinite recursion!
  day.loaded = true;
  // save changed flag and restore after reading day file
  const saveChanged = day.changed;
  readDayFile(day);
  day.changed = saveChanged;
}

// load range of days into database
function loadDays(tmStart, tmEnd) {
  console.log("loadDays", tmStart.formatDate(), "to", tmEnd.formatDate());
  const tm = thyme.makeTime(tmStart.ms);
  while (tm.ms <= tmEnd.ms) {
    loadDay(findOrAddDay(tm));
    tm.setTime(tm.ms + 24 * 60 * 60 * 1000);
  }
  return null;
}

// given initial state, apply all records in day and return final state
// returns new state object
function reduceDay(day, initState) {
  return day.recs.reduce((state, rec) => {
    state[rec.src] = rec;
    return state;
  }, Object.assign({}, initState));
}

// return copy of state with clean records
function cleanState(state) {
  const newState = {};
  Object.keys(state).forEach(key => {
    newState[key] = cleanRecord(state[key]);
  });
  return newState;
}

// equality test for states
// return true if states have same sources with records that pass equality test
function statesAreEqual(s1, s2) {
  if (typeof s1 === 'object' && typeof s2 === 'object') {
    const keys1 = Object.keys(s1);
    const keys2 = Object.keys(s2);
    return keys1.count === keys2.count &&
      keys1.every(key => recsAreEqual(s1[key], s2[key]));
  } else {
    return false;
  }
}

// sweep database and update/fix things:
// - recomputes initial state for each day
function sweepDays(tmStart, tmEnd) {
  console.log("sweepDays", tmStart.formatDate(), "to", tmEnd.formatDate());
  const tm = thyme.makeTime(tmStart.ms);
  let state = {};
  while (tm.ms <= tmEnd.ms) {
    const day = findOrAddDay(tm);
    loadDay(day);
    if (!statesAreEqual(state, day.initState)) {
      day.initState = state;
      day.changed = true;
    }
    state = cleanState(reduceDay(day, state));
    tm.setTime(tm.ms + 24 * 60 * 60 * 1000);
  }
  return null;
}

// parse channel filter
// return filter object or null if invalid
function parseChanFilter(str) {
  return null;
}

// channel query
function queryChans(tmStart, nDays, chanFilt) {
  return {};
}

module.exports = {
  validateRecord: validateRecord,
  cleanRecord: cleanRecord,
  addRecord: addRecord,
  addLatest: addLatest,
  latestRecs: latestRecs,
  writeAllChanges: writeAllChanges,
  loadDays: loadDays,
  sweepDays: sweepDays,
  parseChanFilter: parseChanFilter,
  queryChans: queryChans
};
