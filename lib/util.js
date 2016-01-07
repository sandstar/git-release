var fs = require('fs');
var inquirer = require('inquirer');
var path = require('path');
var packagers = require('./packagers');
var semver = require('semver');
var gitp = require('git-promise');

exports.bump = function bump(filenames, version, parent) {
    filenames.forEach(function(filename) {
        var packager = packagers.all.find(function (pack) { return pack.file == path.basename(filename); });
        if (packager) {
            packager.bump(version, filename, parent);
        }
    });
};

exports.hook = function hook(name, version) {
    var hook = path.join('.git', 'hooks', name);
    if (fs.existsSync(hook)) {
        shell.exec(hook + ' ' + version);
    }
};

exports.prepareChoices = function prepareChoices(type, files, distinctPatch) {
    var ret = {};
    packagers.all.forEach(function (pack) {
        if (!ret.packager && fs.existsSync(pack.file)) {
            ret.packager = pack;
        }
    });
    if (ret.packager) {
        ret.identifier = type  || 'patch';
        if (distinctPatch) {
            ret.gitflowIdentifier = type || 'minor';
        } else {
            ret.gitflowIdentifier = ret.identifier;
        }
        ret.currentVersion = ret.packager.version();
        ret.newVersion = semver.inc(ret.currentVersion, ret.identifier) || ret.identifier;
        ret.newGitflowVersion = semver.inc(ret.currentVersion, ret.gitflowIdentifier) || ret.gitflowIdentifier;

        ret.types = ['major', 'minor', 'patch'];
        if (distinctPatch) {
            ret.gitflowTypes = ['major', 'minor'];
        } else {
            ret.gitflowTypes = ret.types;
        }

        function mapChoice(type) {
            var version = semver.inc(ret.currentVersion, type);
            if (type === 'minor') {
                ret.gitflowDefault = version;
            }
            return {name: version + ' (Increment ' + type + ' version)', value: version};
        }
        ret.choices = ret.types.map(mapChoice);
        ret.gitflowChoices = ret.gitflowTypes.map(mapChoice);
        var exitChoice = { name: 'Exit (Don\'t release a new version)', value: 'exit' };

        if (ret.types.indexOf(ret.identifier) < 0) {
            ret.choices.push({name: ret.newVersion + ' (Custom version)', value: ret.newVersion});
        }
        if (ret.gitflowTypes.indexOf(ret.gitflowIdentifier) < 0 &&
            (!distinctPatch || semver.valid(ret.newGitflowVersion))) {
            ret.gitflowChoices.push({name: ret.newGitflowVersion + ' (Custom version)', value: ret.newGitflowVersion});
            ret.gitflowDefault = ret.newGitflowVersion;
        }
        ret.choices = ret.choices.concat([ new inquirer.Separator(), exitChoice]);
        ret.gitflowChoices = ret.gitflowChoices.concat([ new inquirer.Separator(), exitChoice]);
        ret.filenames = files || packagers.all.filter(function (pack) {
                return fs.existsSync(pack.file);
            }).map(function (pack) {
                return pack.file;
            });
    }
    return ret;
}

exports.recognizeWorkflow = function recognizeWorkflow(callback) {
    var developBranchExists = false;
    var masterBranchExists = false;
    return gitp('show-ref --verify --quiet refs/heads/develop', function (stdout, code){
        developBranchExists = code ? false : true;
    }).then(function () {
        return gitp('show-ref --verify --quiet refs/heads/master', function (stdout, code){
            masterBranchExists = code ? false : true;
        }).then(function () {
            if (developBranchExists && masterBranchExists) {
                callback('gitflow');
            } else {
                callback('simple');
            }
        });
    });
}