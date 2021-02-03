// time module
// seems like we should not have to write yet another time module...
// time is measured in milliseconds since January 1, 2000
// always Eastern Standard Time, ignore daylight savings time to make math easier

// time pattern is compatible with ISO 8601
// at least 3 digits of fraction required (milliseconds)
// any timezone extension is ignored (for example -05:00)
const timePat = /^20(\d{2})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})\.(\d{3}).*/;
const monthSum = [];
const monthSumLy = [];
const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let sum = 0;
daysInMonth.forEach((n, i) => {
  monthSum.push(sum);
  monthSumLy.push(sum + ((i >= 2) ? 1 : 0));
  sum += n;
});

// constructor for time object
// args array corresponds to time pattern above
function Thyme(args) {
  if (args) {
    this.year = parseInt(args[1]);   //year >= 2000
    this.month = parseInt(args[2]);  //month 1-12
    this.day = parseInt(args[3]);    //day 1-31
    this.hour = parseInt(args[4]);   //hour 0-23
    this.min = parseInt(args[5]);    //minute 0-59
    this.sec = parseInt(args[6]);    //second 0-50
    this.msec = parseInt(args[7]);   //millisecond 0-999
  }
  this.ms = 0;  //milliseconds since January 1, 2000 EST
}

// parse full time string (including date) with strict rules
// return time object or null if invalid
function parseTime(t) {
  const mr = typeof t === 'string' && t.match(timePat);
  if (mr) {
    const tm = new Thyme(mr);
    const y = tm.year;
    tm.year += 2000;
    const nly = Math.floor((y + 3) / 4);
    const myMonthSum = (y % 4) ? monthSum : monthSumLy;
    const days = y*365 + nly + myMonthSum[tm.month - 1] + tm.day - 1;
    const secs = ((days*24 + tm.hour)*60 + tm.min)*60 + tm.sec;
    tm.ms = secs*1000 + tm.msec;
    return tm;
  }
  // time is invalid
  return null;
}

// parse time string with lenient rules
// date required but time may be omitted
function parseTimeRelaxed(t) {
  return parseTime(t + " 00:00:00.000");  //note this depends on .* at end of timePat
}

// return a copy of an existing time object
Thyme.prototype.clone = function() {
  return Object.assign(Object.create(Thyme.prototype), this);
}

// set time structure to specified time in milliseconds
Thyme.prototype.setTime = function(ms) {
  this.ms = ms;
  this.msec = ms % 1000;
  const s = Math.floor(ms / 1000);
  this.sec = s % 60;
  const m = Math.floor(s / 60);
  this.min = m % 60;
  const h = Math.floor(m / 60);
  this.hour = h % 24;
  let d = Math.floor(h / 24);
  const nly = Math.floor(d / 1461); //number of complete leap year cycles
  let y = nly * 4;
  d -= nly * 1461;
  if (d >= 366) {
    d -= 366; //first year of ly cycle has 366 days
    const n = Math.floor(d / 365); //how many additional 365 day years?
    d -= n * 365;
    y += n + 1;
  }
  this.year = y + 2000;
  const myMonthSum = (y % 4) ? monthSum : monthSumLy;
  const i = myMonthSum.findIndex(sum => d < sum);
  this.month = i < 0 ? 12 : i;
  this.day = d - myMonthSum[this.month-1] + 1;
  return this;
};

// make time object from specified time in milliseconds
function makeTime(ms) {
  // make time object with undefined properties
  const tm = new Thyme();
  // this function sets all time properties
  tm.setTime(ms);
  return tm;
}

const days1970to2000 = 365*30 + 7;
const epochOffsetMs = days1970to2000 * 24 * 60 * 60 * 1000;
const estOffsetMs = 5 * 60 * 60 * 1000;

// make time object for current time
function makeTimeNow() {
  return makeTime(Date.now() - epochOffsetMs - estOffsetMs);
}

// set time to 00:00:000 on same date
Thyme.prototype.setMidnight = function() {
  this.ms -= ((this.hour*60 + this.min)*60 + this.sec)*1000 + this.msec;
  this.hour = 0;
  this.min = 0;
  this.sec = 0;
  this.msec = 0;
  return this;
};

// add specified number of days to time
Thyme.prototype.addDays = function(n) {
  this.setTime(this.ms + n * 24 * 60 * 60 * 1000);
  return this;
};

// return date string in YYYY-MM-DD format
Thyme.prototype.formatDate = function() {
  return this.year +
    (this.month < 10 ? "-0" : "-") + this.month +
    (this.day < 10 ? "-0" : "-") + this.day;
};

// return time string in HH:MM:SS.FFF format
// time is Eastern Standard Time, without DST adjustment
Thyme.prototype.formatTime = function() {
  return (this.hour < 10 ? "0" : "") + this.hour +
    (this.min < 10 ? ":0" : ":") + this.min +
    (this.sec < 10 ? ":0" : ":") + this.sec + "." +
    (this.msec + 1000).toString().substring(1);
}

// return date and time string
Thyme.prototype.formatDateTime = function() {
  return this.formatDate() + " " + this.formatTime();
}

module.exports = {
  parseTime: parseTime,
  parseTimeRelaxed: parseTimeRelaxed,
  makeTime: makeTime,
  makeTimeNow: makeTimeNow
};
