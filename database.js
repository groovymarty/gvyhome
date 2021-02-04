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
// if new day created, use copy of specified initial state
function findOrAddDay(tm, initState) {
  if (!years[tm.year]) {
    years[tm.year] = {months: [], tm: tm.clone().setMidnight()};
  }
  const year = years[tm.year];
  if (!year.months[tm.month]) {
    year.months[tm.month] = {days: [], tm: tm.clone().setMidnight()};
  }
  const month = year.months[tm.month];
  if (!month.days[tm.day]) {
    // TODO: day should be a class with a constructor
    const dayTm = tm.clone().setMidnight();
    month.days[tm.day] = {
      recs: [],
      t: dayTm.formatDateTime(),
      tm: dayTm,
      loaded: false,
      changed: false,
      version: 0,
      initState: Object.assign({}, initState)
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

// return cleaned up copy of day object
// apply optional filter to record array
function cleanDay(day, recFilter) {
  let recs = day.recs;
  if (recFilter) {
    recs = recs.filter(recFilter);
  }
  return {
    t: day.t,
    recs: recs.map(cleanRecord),
    initState: day.initState
  }
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

// initialize latest with last known initial state
// do this at startup before reading data journal
function initLatest() {
  // what day to load?  assume today
  let tm = thyme.makeTimeNow();
  // if database ends before today, use last day in database
  const tmLastDay = findLastDay();
  if (tmLastDay && tmLastDay.ms < tm.ms) {
    tm = tmLastDay;
  }
  // copy that day's initial state to latest
  const day = lazyLoadDay(findOrAddDay(tm));
  Object.assign(latestRecs, day.initState);
}

// add record to latest
// use this mainly for incoming live records
function addLatest(rec) {
  latestRecs[rec.src] = cleanRecord(rec);
}

// write all changed records to files
// if force is true, write day file even if unchanged
// if purge is true, delete days from memory prior to today
function writeAllChanges(options) {
  options = options || {};
  const force = options.force;
  const purge = options.purge;
  console.log("writeAllChanges", force?"force":"", purge?"purge":"");
  const today = thyme.makeTimeNow().setMidnight();
  years.forEach(year => {
    year.months.forEach(month => {
      month.days.forEach((day, iday) => {
        if (day.changed || force) {
          day.version += 1;
          writeDayFile(day);
          day.changed = false;
          if (purge && day.tm.ms < today.ms) {
            delete month.days[iday];
          }
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
    t: day.t,
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
  return day;
}

// load day if not already loaded
function lazyLoadDay(day) {
  if (!day.loaded) {
    loadDay(day);
  }
  return day;
}

// load range of days into database
function loadDays(tmStart, tmEnd) {
  console.log("loadDays", tmStart.formatDate(), "to", tmEnd.formatDate());
  const tm = thyme.makeTime(tmStart.ms);
  while (tm.ms <= tmEnd.ms) {
    loadDay(findOrAddDay(tm));
    tm.addDays(1);
  }
  return null;
}

// return sorted array of names in directory
function readDir(dirPath) {
  const names = [];
  try {
    const dir = fs.opendirSync(dirPath);
    while (true) {
      const dirent = dir.readSync();
      if (!dirent) {
        break;
      }
      names.push(dirent.name);
    }
    dir.closeSync();
  } catch {}
  names.sort();
  return names;
}

// return first or last defined element of array
// return undefined if array is empty or all elements undefined
function firstOrLast(arr, wantFirst) {
  if (wantFirst) {
    return arr.reduce((accum, elem) => typeof accum === 'undefined' ? elem : accum, undefined);
  } else {
    return arr.reduceRight((accum, elem) => typeof accum === 'undefined' ? elem : accum, undefined);
  }
}

// find first or last day in database
// return time object with that date
// return null if database is empty
function findFirstOrLastDay(wantFirst) {
  let tm = null;
  // first look at database files
  let dirPath = "years";
  const yearDir = firstOrLast(readDir(dirPath), wantFirst);
  if (yearDir) {
    dirPath = path.join(dirPath, yearDir);
    const monthDir = firstOrLast(readDir(dirPath), wantFirst);
    if (monthDir) {
      dirPath = path.join(dirPath, monthDir);
      const dayFile = firstOrLast(readDir(dirPath), wantFirst);
      if (dayFile) {
        const dayBase = path.basename(dayFile, ".json");
        tm = thyme.parseTimeRelaxed(yearDir+"-"+monthDir+"-"+dayBase);
      }
    }
  }
  // then look at database in memory
  const year = firstOrLast(years, wantFirst);
  if (year) {
    const month = firstOrLast(year.months, wantFirst);
    if (month) {
      const day = firstOrLast(month.days, wantFirst);
      if (day) {
        if (!tm || (wantFirst ? day.tm.ms < tm.ms : day.tm.ms > tm.ms)) {
          tm = day.tm;
        }
      }
    }
  }
  return tm;
}

function findFirstDay() {
  return findFirstOrLastDay(true);
}

function findLastDay() {
  return findFirstOrLastDay(false);
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
// - applies migrations
function sweepDays(tmStart, tmEnd) {
  console.log("sweepDays", tmStart.formatDate(), "to", tmEnd.formatDate());
  const tm = thyme.makeTime(tmStart.ms);
  let state = {};
  while (tm.ms <= tmEnd.ms) {
    const day = lazyLoadDay(findOrAddDay(tm));
    // migrations
    day.recs.forEach(rec => {
      // change plain boot to boot.who
      if (rec.src === "boot" && rec.who) {
        rec.src = rec.who+".boot";
        delete rec.who;
        day.changed = true;
        console.log("fixed boot record", rec);
      }
      // change tst.foot to tst.foo
      if (rec.src === "tst" && 'foot' in rec) {
        rec.foo = rec.foot;
        delete rec.foot;
        day.changed = true;
        console.log("fixed test record", rec);
      }
    })
    // correct initial state if necessary
    if (!statesAreEqual(state, day.initState)) {
      day.initState = state;
      day.changed = true;
    }
    state = cleanState(reduceDay(day, state));
    tm.addDays(1);
  }
  return null;
}

// parse source filter
// return filter function or null if invalid
function parseSrcFilter(str) {
  // verify only legal characters
  // source names can have alphanumerics and dots
  // commas and stars are also valid at this point
  if (str.match(/^[a-zA-Z0-9.,*]*$/)) {
    // split on commas, convert each name to a RegExp object
    const regExps = str.split(",").map(name => {
      // replace every star with character class star
      const pattern = "^" + name.replace(/\*/g, "[a-zA-Z0-9.]*") + "$";
      //console.log("src filter pattern is", pattern);
      return new RegExp(pattern);
    });
    // return function that returns true if any regex matches record source
    return rec => regExps.some(regExp => regExp.test(rec.src))
  }
  return null;
}

// return result for days query
// params must include tmStart, tmEnd and optional chanFilter
function queryDays(params) {
  console.log("queryDays", params.tmStart.formatDate(), "to", params.tmEnd.formatDate());
  const tm = thyme.makeTime(params.tmStart.ms);
  let result = [];
  while (tm.ms <= params.tmEnd.ms) {
    const day = lazyLoadDay(findOrAddDay(tm));
    result.push(cleanDay(day, params.srcFilter));
    tm.addDays(1);
  }
  return result;
}

module.exports = {
  validateRecord: validateRecord,
  cleanRecord: cleanRecord,
  addRecord: addRecord,
  initLatest: initLatest,
  addLatest: addLatest,
  latestRecs: latestRecs,
  writeAllChanges: writeAllChanges,
  loadDays: loadDays,
  findFirstDay: findFirstDay,
  findLastDay: findLastDay,
  sweepDays: sweepDays,
  parseSrcFilter: parseSrcFilter,
  queryDays: queryDays
};
