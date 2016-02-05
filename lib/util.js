var fs = require('fs');
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

exports.packagerQuery = function packagerQuery(files) {
    var ret = {};
    packagers.all.forEach(function (pack) {
        if (!ret.packager && fs.existsSync(pack.file)) {
            ret.packager = pack;
        }
    });
    if (ret.packager) {
        ret.currentVersion = ret.packager.version();
        ret.filenames = files || packagers.all.filter(function (pack) {
                return fs.existsSync(pack.file);
            }).map(function (pack) {
                return pack.file;
            });
    }
    return ret;
}

exports.recognizeWorkflow = function recognizeWorkflow(callback) {
    var masterName, developName, currentBranch, releasePrefix, intendedVersion, patchflag;

    return gitp('config --get gitflow.branch.master', function (stdout, code) {
        if (code === 0) {
            masterName = stdout.trim();
        }
        else {
            console.log("Error: Git flow not initialized.");
            exit(1);
        }
    }).then(function() {
        return gitp('config --get gitflow.branch.develop', function (stdout, code) {
            if (code === 0) {
                developName = stdout.trim();
            }
            else {
                console.log("Error: Git flow not initialized.");
                exit(1);
            }
        }).then(function() {

            return gitp('show-ref --verify --quiet refs/heads/' + developName, function (stdout, code){
                if (code !== 0) {
                    console.log("Error: The gitflow develop branch \'" + developName + "\' does not exist.");
                    exit(1);
                }
            }).then(function () {
                return gitp('show-ref --verify --quiet refs/heads/' + masterName, function (stdout, code){
                    if (code !== 0) {
                        console.log("Error: The gitflow master branch \'" + masterName + "\' does not exist.");
                        exit(1);
                    }
                });
            }).then(function () {
                return gitp('git rev-parse --abbrev-ref HEAD', function (stdout, code) {
                    if (code !== 0) {
                        console.log("Error: could not find current branch.");
                        exit(1);
                    }
                    currentBranch = stdout.trim();
                }). then(function () {
                    return gitp('config --get gitflow.prefix.release', function (stdout, code) {
                        if (code === 0) {
                            releasePrefix = stdout.trim();
                        }
                        else {
                            console.log("Error: Git flow not initialized.");
                            exit(1);
                        }
                        if (currentBranch === developName) {
                            patchflag = true;
                        } else if (currentBranch.indexOf(releasePrefix) === 0) {
                            intendedVersion = currentBranch.substring(releasePrefix.length, currentBranch.length);
                            if (!semver.valid(intendedVersion)) {
                                console.log("Error: Intended version " + intendendVersion + "is not a valid Semantic Versioning value.");
                                exit(1);
                            }
                        } else
                        {
                            console.log("Error: Current branch is not a develop or release branch.");
                            exit(1);
                        }
                        callback(patchflag, intendedVersion);
                    })
                });

            });
        });
    });
};