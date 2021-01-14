#!/usr/bin/env nodejs
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const journal = require("./datajournal.js");
const db = require("./database.js");
const weather = require("./weather.js");

// read data journal
// data journal holds recently posted records
// at end of day we write the records to day file and clear the journal
// if unexpected restart occurs, we can read journal and recover the unsaved data
journal.readJournal();

var app = express();
app.use(bodyParser.json());

// post data
app.post("/gvyhome/data", function(req, res) {
  const errMsg = journal.addRecords(req.body);
  res.set("Content-Type", "text/plain");
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).end();
  }
});

// operations
app.get("/gvyhome/op/loaddays", function(req, res) {
  const tStart = (req.query.start || "") + " 00:00:00.000";
  const tEnd = (req.query.end || "") + " 00:00:00.000";
  console.log("loadDays: tStart", tStart, "tEnd", tEnd);
  const errMsg = db.loadDays(tStart, tEnd);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).end();
  }
});

app.get("/gvyhome/op/writeallchanges", function(req, res) {
  db.writeAllChanges();
  res.status(200).end();
});

var port = 8082;
app.listen(port, function() {
  console.log("Server listening on port "+port);
});

// once a minute service
let prevEstHour = 999;
setInterval(() => {
  const date = new Date();
  const utcHour = date.getUTCHours();
  const estHour = (utcHour + 24 - 5) % 24;
  if (estHour != prevEstHour) {
    prevEstHour = estHour;
    // get weather once an hour
    weather.getWeather();
    if (estHour == 1) {
      // it is 1:00 AM in Connecticut!
      db.writeAllChanges();
      journal.requestRotate();
    }
  }
}, 60000);

// catch interrupt signal, write database to files before exiting
process.on('SIGINT', function() {
  journal.stopJournalTimer();
  journal.closeJournal();
  db.writeAllChanges();
  process.exit();
});
