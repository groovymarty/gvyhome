// time module
// seems like we should not have to write yet another time module...
// time is measured in milliseconds since January 1, 2000
// always Eastern Standard Time, ignore daylight savings time to make math easier

// time pattern is compatible with ISO 8601
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

// parse time string
// return time structure or null if invalid
function parseTime(t) {
  const mr = typeof t === 'string' && t.match(timePat);
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
    const days = y*365 + Math.floor(ym1 / 4) + myMonthSum[tm.month - 1] + tm.day - 1;
    const secs = ((days*24 + tm.hour)*60 + tm.min)*60 + tm.sec;
    // time in milliseconds since January 1, 2000 EST
    tm.ms = secs*1000 + tm.msec;
    return tm;
  }
  // time is invalid
  return null;
}

// set time structure to specified time in milliseconds
// return time structure
function setTime(tm, ms) {
  tm.ms = ms;
  tm.msec = ms % 1000;
  const s = Math.floor(ms / 1000);
  tm.sec = s % 60;
  const m = Math.floor(s / 60);
  tm.min = m % 60;
  const h = Math.floor(m / 60);
  tm.hour = h % 24;
  let d = Math.floor(h / 24);
  let y = 0;
  if (d >= 365) {
    d -= 365; //subtract year 2000
    const nly = Math.floor(d / 1461); //number of complete leap year cycles
    d -= nly * 1461;
    y = d < 1095 ? Math.floor(d / 365) : 3; //year in current leap year cycle, 0-3
    d -= y * 365;
    y += (nly * 4) + 1;
  }
  tm.year = y + 2000;
  const myMonthSum = (!y || y % 4) ? monthSum : monthSumLy; //2000 wasn't a leap year
  const i = myMonthSum.findIndex(sum => d < sum);
  tm.month = i < 0 ? 12 : i;
  tm.day = d - myMonthSum[tm.month-1] + 1;
  return tm;
}

// make time structure from specified time in milliseconds
function makeTime(ms) {
  return setTime({}, ms);
}

// return date string in YYYY-MM-DD format
function formatDate(tm) {
  return tm.year +
    (tm.month < 10 ? "-0" : "-") + tm.month +
    (tm.day < 10 ? "-0" : "-") + tm.day;
}

// return time string in HH:MM:SS.FFF format
// time is Eastern Standard Time, without DST adjustment
function formatTime(tm) {
  return (tm.hour < 10 ? "0" : "") + tm.hour +
    (tm.min < 10 ? ":0" : ":") + tm.min +
    (tm.sec < 10 ? ":0" : ":") + tm.sec + "." +
    (tm.msec + 1000).toString().substring(1);
}

// return date and time string
function formatDateTime(tm) {
  return formatDate(tm) + " " + formatTime(tm);
}

module.exports = {
  parseTime: parseTime,
  setTime: setTime,
  makeTime: makeTime,
  formatTime: formatTime,
  formatDate: formatDate,
  formatDateTime: formatDateTime
};
