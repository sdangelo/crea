#!/usr/bin/env node

var Crea = require("./crea.js");
Crea.init(__dirname);

Crea.createPhonyTask("t1", [],
		function () {
			console.log("Running t1");
		});

Crea.createPhonyTask("t2", ["t1"],
		function () {
			console.log("Running t2");
		});

Crea.createPhonyTask("t3", ["t1"],
		function () {
			console.log("Running t3");
		});

Crea.createPhonyTask("default", ["t2", "t3"],
		function () {
			console.log("Hello world!");
		});

Crea.run("default");
