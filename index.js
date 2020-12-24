#!/usr/bin/env nodejs
var express = require('express');
var bodyParser = require('body-parser');
var journal = require("./datajournal.js");

var app = express();
app.use(bodyParser.json());
//app.use(express.static("."));

// Post data
app.post("/gvyhome/data", function(req, res) {
  console.log("req.body", req.body);
  journal.addRecord(req.body);
  res.set("Content-Type", "text/plain");
  res.status(200).end();
});

var port = 8082;
app.listen(port, function() {
  console.log("Server listening on port "+port);
});
