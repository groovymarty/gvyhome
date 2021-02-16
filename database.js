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
// if purge is true, delete days from memory other than today
function writeAllChanges(options) {
  options = options || {};
  const force = options.force;
  const purge = options.purge;
  console.log("writeAllChanges", force?"force":"", purge?"purge":"");
  const today = thyme.makeTimeNow().setMidnight();
  const tomorrow = today.clone().addDays(1);
  years.forEach(year => {
    year.months.forEach(month => {
      month.days.forEach((day, iday) => {
        if (day.changed || force) {
          day.version += 1;
          writeDayFile(day);
          day.changed = false;
        }
        if (purge && (day.tm.ms < today.ms || day.tm.ms >= tomorrow.ms)) {
          delete month.days[iday];
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
    // migrations go here..
    /**
     * example migrations
     * 
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
    });
    */
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

// return result for latest query
function queryLatest() {
  return {
    latest: latestRecs
  };
}

// parse source filter
// source filter is comma-separated list of source names
// valid chars for source name are alphanumeric and dot
// source names can also have wildcard stars
// return filter function or error message string if invalid
function parseSrcFilter(str) {
  // verify only legal characters
  if (typeof str === 'string' && str.match(/^[A-Za-z0-9.*,]*$/)) {
    // split on commas, convert each name to a RegExp object
    const regExps = str.split(",").map(name => {
      // replace every star with character class star
      const pattern = "^" + name.replace(/\*/g, "[A-Za-z0-9.]*") + "$";
      return new RegExp(pattern);
    });
    // return function that returns true if any regex matches record source
    return rec => regExps.some(regExp => regExp.test(rec.src))
  } else {
    return "invalid character";
  }
}

// return result for days query
// params must include tmStart, tmEnd and optional srcFilter
function queryDays(params) {
  console.log("queryDays", params.tmStart.formatDate(), "to", params.tmEnd.formatDate());
  const tm = thyme.makeTime(params.tmStart.ms);
  const result = [];
  while (tm.ms <= params.tmEnd.ms) {
    const day = lazyLoadDay(findOrAddDay(tm));
    result.push(cleanDay(day, params.srcFilter));
    tm.addDays(1);
  }
  return {
    days: result
  }
}

// return true if argument is a power of 2
function isPowerOf2(x) {
  // if x is NZ and a power of 2, then x-1 flips all bits in the binary value of x
  // therefore x & (x-1) will be all zeros if all bits flip, assuming x is NZ
  return x && !(x & (x-1));
}

// calculate shift count for a mask
// shift count is number of right shifts to get lowest order 1 into bit position 0
// if mask is 0 return 0
function calcShiftCount(x) {
  x = x || 1;
  let n = 0;
  while (!(x & 1)) {
    x >>= 1;
    n += 1;
  }
  return n;
}

// channel, collects query result for a particular source name and property name
// use apply to pass values to the channel, and associated time in milliseconds
// mask, if specified in constructor, is applied to each value
// query result is parallel arrays of values and duration for each value
// for one bit mask, each array element represents an off, off-to-on, on, on-to-off cycle
// value is on time and duration is length of complete cycle
// if initial state is on, first cycle starts immediately with zero off time
function Channel(maskStr, initVal, startMs) {
  this.maskStr = maskStr;
  // remove initial ^ from mask string and convert to integer
  this.mask = parseInt(maskStr.substring(1)) || 0;
  this.shiftCount = calcShiftCount(this.mask);
  // one bit mask?
  this.isOneBit = isPowerOf2(this.mask);
  this.values = [];
  this.durations = [];
  this.initVal = this.prepValue(initVal);
  this.lastVal = this.initVal;
  this.lastMs = startMs;
  this.cycleStartMs = startMs;
  this.nOccur = 0;
}

// prepare value by anding with mask and right shifting
// if value is not number or no mask specified, return value unchanged
Channel.prototype.prepValue = function(val) {
  return (typeof val === 'number' && this.maskStr)
    ? (val & this.mask) >> this.shiftCount
    : val;
}

// apply next value to channel
// if value changed from last time, add to result
// also compute duration for each value
// pass null value to flush last record at end of data
Channel.prototype.apply = function(val, ms) {
  const maskedVal = this.prepValue(val);
  // detect change
  if (maskedVal !== this.lastVal) {
    this.nOccur += 1;
    if (this.isOneBit) {
      if (!this.lastVal) {
        // off-to-on transition, save cycle start time
        this.cycleStartMs = this.lastMs;
      } else {
        // on-to-off transition, value is on time
        this.values.push(ms - this.lastMs);
        // push cycle duration
        this.durations.push(ms - this.cycleStartMs);
      }
    } else {
      // push last value and duration
      this.values.push(this.lastVal);
      this.durations.push(ms - this.lastMs);
    }
    // set current value
    this.lastVal = maskedVal;
    this.lastMs = ms;
  }
}

// channel maker
// creates channels for sources that match reg ex
function ChanMaker(srcRegExp, propName, maskStr) {
  this.srcRegExp = srcRegExp;
  this.propName = propName;
  this.maskStr = maskStr;
  // key is source name, value is channel
  this.channels = {};
  // array of source names
  this.srcNames = [];
  this.initState = {};
  this.startMs = 0;
}

// set initial state and starting time
// must be called before applyng any records
ChanMaker.prototype.setInitState = function(initState, startMs) {
  this.initState = initState;
  this.startMs = startMs;
};

// apply record to all channels for this maker
ChanMaker.prototype.apply = function(rec, result) {
  // does source match my reg ex?
  if (this.srcRegExp.test(rec.src)) {
    // yes, does record have my property?
    if (!this.propName || this.propName in rec) {
      // create channel when source is first seen
      if (!this.channels[rec.src]) {
        // get initial value from initial state, default to 0
        const initRec = this.initState[rec.src] || {};
        const initVal = initRec[this.propName] || 0;
        this.channels[rec.src] = new Channel(this.maskStr, initVal, this.startMs);
        this.srcNames.push(rec.src);
      }
      const channel = this.channels[rec.src];
      // if propName is empty then use occurrence count
      // this lets you query records that don't have any properties, like boot records
      const val = this.propName ? rec[this.propName] : channel.nOccur+1;
      this.channels[rec.src].apply(val, rec.tm.ms);
    }
  }
}

// flush last record
ChanMaker.prototype.flush = function(tmEndpoint) {
  this.srcNames.forEach(src => this.channels[src].apply(null, tmEndpoint.ms));
};

// channel set
// basically just an array of channel makers
function ChanSet() {
  this.makers = [];
}

// add a maker
ChanSet.prototype.addMaker = function(maker) {
  this.makers.push(maker);
};

// set initial state and starting time
ChanSet.prototype.setInitState = function(initState, startMs) {
  this.makers.forEach(maker => maker.setInitState(initState, startMs));
};

// apply record to all channel makers
ChanSet.prototype.apply = function(rec) {
  this.makers.forEach(maker => maker.apply(rec));
};

// flush last record
ChanSet.prototype.flush = function(tmEndpoint) {
  this.makers.forEach(maker => maker.flush(tmEndpoint));
};

// get query result
ChanSet.prototype.getResult = function() {
  const result = [];
  this.makers.forEach(maker => {
    maker.srcNames.forEach(src => {
      const channel = maker.channels[src];
      const id = src + ")" + maker.propName + channel.maskStr;
      result.push({
        id: id,
        isOneBit: channel.isOneBit,
        initVal: channel.initVal,
        values: channel.values,
        durations: channel.durations
      });
    });
  });
  return result;
};

// parse channel set definition
// channel set is comma-separated list of channels
// channel format is source name ) property name ^ bits
// the last part, hat bits, is an optional bitmask given as a decimal integer
// valid chars for source name are alphanumeric and dot
// source names can also have wildcard stars
// valid chars for property name are alphanumeric and underscore
// multiple channels for same source can be specifed like this: ow1)temp)humid
// multiple bitmasks for same property can be specified like this: ma1)inp^1^2^4
// return channel set object or error message string if invalid
function parseChanSet(str) {
  const chanSet = new ChanSet();
  let errorMsg = "";
  // verify only legal characters
  if (typeof str === 'string' && str.match(/^[A-Za-z0-9.*,)_^]*$/)) {
    // split on commas
    str.split(",").forEach(ss => {
      // split on close paren, must be at least one
      const ssParts = ss.split(")");
      const srcName = ssParts.shift();
      if (ssParts.length) {
        // create RegExp for source name
        // replace every star with character class star
        const pattern = "^" + srcName.replace(/\*/g, "[A-Za-z0-9.]*") + "$";
        const srcRegExp = new RegExp(pattern);
        // process all channels for this source
        ssParts.forEach(chanStr => {
          // split on hat, optional
          const chanParts = chanStr.split("^");
          const propName = chanParts.shift();
          if (chanParts.length) {
            // add maker for each hat string
            chanParts.forEach(maskStr => {
              chanSet.addMaker(new ChanMaker(srcRegExp, propName, "^"+maskStr));
            });
          } else {
            // no hat string
            chanSet.addMaker(new ChanMaker(srcRegExp, propName, ""));
          }
        });
      } else {
        errorMsg = "close paren missing";
      }
    });
  } else {
    errorMsg = "invalid character";
  }
  return errorMsg || chanSet;
}

// return result for chans query
// params must include tmStart, tmEnd and chanSet
function queryChans(params) {
  console.log("queryChans", params.tmStart.formatDate(), "to", params.tmEnd.formatDate());
  const tm = thyme.makeTime(params.tmStart.ms);
  const chanSet = params.chanSet;
  let firstDay = null;
  let lastRec = null;
  while (tm.ms <= params.tmEnd.ms) {
    const day = lazyLoadDay(findOrAddDay(tm));
    // set initial state from first day
    if (!firstDay) {
      firstDay = day;
      chanSet.setInitState(day.initState, day.tm.ms);
    }
    // apply all records for this day
    day.recs.forEach(rec => chanSet.apply(rec));
    // keep track of last record applied
    if (day.recs.length) {
      lastRec = day.recs[day.recs.length-1];
    }
    // advance to next day
    tm.addDays(1);
  }
  // determine endpoint time for last record flush
  // this will affect duration of last record(s) reported
  // extend durations to end of day unless changed below
  const tmEndpoint = tm.clone();
  const lastDayInDb = findLastDay();
  // did we reach end of database?
  if (lastRec && lastDayInDb && lastRec.tm.ms >= lastDayInDb.ms) {
    // database has no future records
    // is actual future still unknown?
    const now = thyme.makeTimeNow();
    if (now.ms < tmEndpoint.ms) {
      if (now.ms >= lastRec.tm.ms) {
        // extend duration to actual time now
        tm.setTime(now.ms);
      } else {
        // actual time now is out of range so ignore it
        // do not extend any durations
        tm.setTime(lastRec.tm.ms);
      }
    }
  }
  // flush last record using endpoint time
  chanSet.flush(tmEndpoint);
  return {
    t: firstDay ? firstDay.t : params.tmStart.formatDateTime(),
    totalMs: tm.ms - params.tmStart.ms,
    chans: chanSet.getResult()
  };
}

// return database status
function getStatus() {
  const firstDay = findFirstDay();
  const lastDay = findLastDay();
  let nDays = 0;
  let nRecs = 0;
  years.forEach(year => {
    year.months.forEach(month => {
      month.days.forEach(day => {
        nDays += 1;
        nRecs += day.recs.length;
      });
    });
  });
  return {
    firstDay: firstDay ? firstDay.formatDateTime() : "",
    lastDay: lastDay ? lastDay.formatDateTime() : "",
    nDaysInMem: nDays,
    nRecsInMem: nRecs
  };
}

module.exports = {
  validateRecord: validateRecord,
  cleanRecord: cleanRecord,
  addRecord: addRecord,
  initLatest: initLatest,
  addLatest: addLatest,
  writeAllChanges: writeAllChanges,
  loadDays: loadDays,
  findFirstDay: findFirstDay,
  findLastDay: findLastDay,
  sweepDays: sweepDays,
  queryLatest: queryLatest,
  parseSrcFilter: parseSrcFilter,
  queryDays: queryDays,
  parseChanSet: parseChanSet,
  queryChans: queryChans,
  getStatus: getStatus
};
