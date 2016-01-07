'use strict';
var shell = require('shelljs');
var inquirer = require('inquirer');
require('array.prototype.find');
var util = require('./util');

function git(version, tag, filenames) {
  util.hook('pre-release', version);
  shell.exec('git add ' + filenames.join(' '));
  run('git commit -m "Version ' + version + '"', filenames.join(' ') + ' committed');
  run('git tag -a ' + tag + ' -m "Tag ' + tag + '"', 'Tag ' + tag + ' created');
  run('git push', 'Pushed to remote');
  run('git push --tags', 'Pushed new tag ' + tag + ' to remote');
  util.hook('post-release', version);
}

function run(cmd, msg) {
  shell.exec(cmd, {silent: true});
  console.log(msg);
}

function release(type, files, parent, unused, callback) {
  var obj = util.prepareChoices(type, files);

  if (!obj.packager) {
    callback(new Error('No packager found !'));
  } else {
    console.log('Using packager', obj.packager.name);

    inquirer.prompt([{
      type: 'list',
      name: 'version',
      message: 'Which version do you want to release ?',
      choices: obj.choices,
      default: obj.newVersion
    }], function (answers) {
      var version = answers.version;
      if (version !== 'exit') {
        var tag = 'v' + version;
        util.bump(obj.filenames, version, parent);
        console.log('Version bumped to ' + version);
        git(version, tag, obj.filenames);
        callback();
      } else {
        callback();
      }
    });
  }
}

module.exports = release;
