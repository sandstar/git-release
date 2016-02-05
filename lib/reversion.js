var fs = require('fs');
var gitp = require('git-promise');
var semver = require('semver');
var util = require('./util');

function git(version, filenames, parent, callback) {

    function checkGitResult(stdout, code){
        if (code) {
            throw new Error("Error: " + stdout);
        }
        return true;
    }


    function reversionAndStageChanges(){
        util.bump(filenames, version, parent);
        return gitp('add ' + filenames.join(' '), checkGitResult);
    }

    function commitVersionChanges(){
        return gitp('commit -m "Version ' + version + '"', checkGitResult);
    }

    console.log('Bump version to ' + version);
    reversionAndStageChanges()
        .then(commitVersionChanges)
        .then(function (){
            callback();
        })
        .fail(function (err) {
            callback(err);
        });
}

function reversion(patchflag, intendedVersion, files, parent, callback) {
    var obj = util.packagerQuery(files);
    if (!obj.packager) {
        console.log("Error:  No packager found.");
        exit(1);
    }
    console.log('Using packager ' + obj.packager.name);
    if (!semver.valid(obj.currentVersion)) {
        console.log("Error:  Current version \'" + obj.currentVersion + "\' not a Semantic Versioning value.");
        exit(1);
    }
    if (intendedVersion) {
        // Update version to intended version, in release branch.
        if (!semver.gt(intendedVersion, obj.currentVersion)) {
            console.log("Error:  Intended version \'" + intendedVersion + "\' is not greater than the current \." + obj.currentVersion + "\'.");
            exit(1);
        }
        git(intendedVersion, obj.filenames, parent, callback);
    }
    else {
        // Update version so that its patch component is the flag 9000, in the develop branch.
        var target = semver.major(obj.currentVersion) + "." + semver.minor(obj.currentVersion) + ".9000"
        if (target === obj.currentVersion) {
            console.log("Error:  Current version already has patch flag 9000.");
            exit(1);
        }
        if (semver.patch(obj.currentVersion) !== "0") {
            console.log("Error:  Current patch version is not 0.");
            exit(1);
        }
        git(target, obj.filenames, parent, callback);
    }
}

module.exports = reversion;
