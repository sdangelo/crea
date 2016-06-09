/*
 * Copyright (C) 2016 Stefano D'Angelo <zanga.mail@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

var Crea = {
	fs:		require("fs-extra"),
	path:		require("path"),

	topDirectory:	null,
	tasks:		null,
	fileData:	null,

	init: function (topDirectory) {
		this.topDirectory = this.path.relative("", topDirectory);
		this.tasks = [];
		this.fileData = {};
	},

	createTask: function (proto, targets, prereqs) {
		if (typeof prereqs == "string")
			prereqs = [ prereqs ];
		if (typeof targets == "string")
			targets = [ targets ];

		var t = Object.create(proto);
		t.init.apply(t, Array.prototype.slice.call(arguments, 1));
		this.tasks.push(t);

		return t;
	},

	createPhonyTask: function (targets, prereqs, run) {
		return this.createTask(this.phonyTask, targets, prereqs, run);
	},

	createFileTask: function (targets, prereqs, run) {
		return this.createTask(this.fileTask, targets, prereqs, run);
	},

	findTask: function (target) {
		for (var i = 0; i < this.tasks.length; i++)
			if (this.tasks[i].targets.indexOf(target) != -1)
				return this.tasks[i];
		return null;
	},

	findTasks: function (targets) {
		var ret = [];
		for (var i = 0; i < targets.length; i++) {
			var t = this.findTask(targets[i]);
			if (t && ret.indexOf(t) == -1)
				ret.push(t);
		}
		return ret;
	},

	run: function (t) {
		if (typeof t == "string")
			t = this.findTask(t);

		var s = [];
		t.getRunSchedule(Crea, s, null);
		for (var i = 0; i < s.length; i++)
			if (s[i].toRun && s[i].task.run) {
				s[i].task.run();
				var t = s[i].task.getTargetFiles();
				if (t)
					this.updateFileData(t);
			}
	},

	targetsAreOutdated: function (targets, sources) {
		try {
			this.updateFileData(targets);
		} catch (e) {
			return true;
		}

		this.updateFileData(sources);
		for (var i = 0; i < targets.length; i++) {
			var t = this.fileData[targets[i]].getTime();
			for (var j = 0; j < sources.length; j++) {
				var s = this.fileData[sources[j]].getTime();
				if (s > t)
					return true;
			}
		}

		return false;
	},

	updateFileData: function (files) {
		for (var i = 0; i < files.length; i++) {
			var f = files[i];
			this.fileData[f] = this.fs.statSync(f).mtime;
		}
	}
};

Crea.task = {
	targets:		null,
	prereqs:		null,
	run:			null,
	fromTaskPropagate:	true,

	init: function (targets, prereqs, run) {
		this.targets = targets;
		this.prereqs = prereqs;
		this.run = run;
	},

	getTargetFiles: function () {
		return null;
	},

	findInSchedule: function (schedule) {
		for (var i = 0; i < schedule.length; i++)
			if (schedule[i].task == this)
				return schedule[i];
	},

	decideToRun: function (Crea, schedule, fromTask, prereqs, prereqTasks) {
		if (this.fromTaskPropagate && !fromTask)
			return true;

		for (var i = 0; i < prereqTasks.length; i++)
			if (prereqTasks[i].findInSchedule(schedule).toRun)
				return true;

		var sources = [];
		for (var i = 0; i < prereqs.length; i++) {
			var s = prereqs[i];
			var t = Crea.findTask(s);
			if (!t) {
				if (sources.indexOf(s) == -1)
					sources.push(Crea.path.join(
						Crea.topDirectory, s));
				continue;
			}

			t = t.getTargetFiles();
			if (!t)
				continue;
			for (var j = 0; j < t.length; j++) {
				if (sources.indexOf(t[j]) == -1)
					sources.push(t[j]);
			}
		}

		if (this.fromTaskPropagate)
			return Crea.targetsAreOutdated(
				fromTask.getTargetFiles(), sources)
				? true : null;
		else
			return Crea.targetsAreOutdated(
				this.getTargetFiles(), sources);
	},

	propagateToRun: function (Crea, schedule, prereqTasks) {
		var s = this.findInSchedule(schedule);
		if (s && s.toRun)
			return;

		if (!prereqTasks)
			prereqTasks = Crea.findTasks(this.prereqs);
		for (var i = 0; i < prereqTasks.length; i++)
			prereqTasks[i].propagateToRun(Crea, schedule, null);

		s.toRun = true;
	},

	evalRunSchedule: function (Crea, schedule, fromTask) {
		var prereqTasks = Crea.findTasks(this.prereqs);
		for (var i = 0; i < prereqTasks.length; i++)
			prereqTasks[i].getRunSchedule(Crea, schedule,
				this.fromTaskPropagate ? fromTask : this);

		var toRun = this.decideToRun(Crea, schedule, fromTask,
					     this.prereqs, prereqTasks);
		if (toRun)
			for (var i = 0; i < prereqTasks.length; i++)
				prereqTasks[i].propagateToRun(Crea, schedule,
							      prereqTasks);
		return toRun;
	},

	getRunSchedule: function (Crea, schedule, fromTask) {
		var s = this.findInSchedule(schedule);
		if (s && typeof s.toRun == "boolean")
			return;

		var toRun = this.evalRunSchedule(Crea, schedule, fromTask);
		schedule.push({ task: this, toRun: toRun });
	}
};

Crea.phonyTask = Object.create(Crea.task);

Crea.fileTask = Object.create(Crea.task);
Crea.fileTask.fromTaskPropagate = false;
Crea.fileTask.getTargetFiles = function () {
	return this.targets;
};
Crea.fileTask.propagateToRun = function () {};

module.exports = Crea;
