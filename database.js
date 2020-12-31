const fs = require('fs');
const path = require('path');

const years = [];
const timePat = /^20(\d{2})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})\.(\d{3})\d*/;
const monthSum = [];
const monthSumLy = [];
const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let sum = 0;
daysInMonth.forEach((n, i) => {
  monthSum.push(sum);
  monthSumLy.push(sum + ((i >= 2) ? 1 : 0));
  sum += n;
});

// validate record
// check fields for known souces, but allow unrecognized sources
// return null if valid, else return error message string
function validateRecord(rec) {
  if (typeof rec !== 'object') {
    return "not an object";
  } else if (typeof rec.t !== 'string') {
    return "no time";
  } else if (!parseTime(rec.t)) {
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

// parse time string
// return time structure or null if invalid
// all times are in Eastern Standard Time, ignore daylight savings time to make math easier
function parseTime(t) {
  const mr = t.match(timePat);
  if (mr) {
    const y = parseInt(mr[1]);
    const tm = {
      year: y + 2000,
      month: parseInt(mr[2]),
      day: parseInt(mr[3]),
      hour: parseInt(mr[4]),
      min: parseInt(mr[5]),
      sec: parseInt(mr[6]),
      msec: parseInt(mr[7])
    };
    const ym1 = y ? y-1 : 0;
    const myMonthSum = (!y || y % 4) ? monthSum : monthSumLy; //2000 wasn't a leap year
    const days = ym1*365 + Math.floor(ym1 / 4) + myMonthSum[tm.month - 1] + tm.day - 1;
    const secs = ((days*24 + tm.hour)*60 + tm.min)*60 + tm.sec;
    // time in milliseconds since January 1, 2000 EST
    tm.ms = secs*1000 + tm.msec;
    return tm;
  }
  // time is invalid
  return null;
}

// return date string in YYYY/MM/DD format
function formatDate(tm) {
  return tm.year +
    (tm.month < 10 ? "/0" : "/") + tm.month +
    (tm.day < 10 ? "/0" : "/") + tm.day;
}

// return time string in HH:MM:SS.FFF format
// time is Eastern Standard Time, without DST adjustment
function formatTime(tm) {
  return (tm.hour < 10 ? "0" : "") + tm.hour +
    (tm.min < 10 ? ":0" : ":") + tm.min +
    (tm.sec < 10 ? ":0" : ":") + tm.sec + "." +
    (tm.msec + 1000).toString().substring(1);
}

// add record to database
function addRecord(rec) {
  const tm = parseTime(rec.t);
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
    // duplicates are common because raspberry posts buffer of recent data along with new record
    if (!findRecord(day.recs, tm, rec.src)) {
      // add parsed time to record, but please remove before saving to file
      rec.tm = tm;
      day.recs.push(rec);
      // normally records are added in chronological order
      // if new record is out of sequence, resort the array
      if (day.recs.length > 1) {
        const oldLastRec = day.recs[day.recs.length - 2];
        if (tm.ms < oldLastRec.tm.ms) {
          console.log("resorting array for "+formatDate(tm));
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
