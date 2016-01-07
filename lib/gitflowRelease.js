var fs = require('fs');
var gitp = require('git-promise');
var semver = require('semver');
var util = require('./util');
var inquirer = require('inquirer');
var chalk = require('chalk');
var infoMsgs = [];
var warnMsgs = [];
var errMsgs = [];
var bb = new inquirer.ui.BottomBar();

function makeWarning(message) {
    warnMsgs.push( chalk.yellow(chalk.bold("Warning: ") + message) );
}

function makeError(message) {
    errMsgs.push( chalk.red(chalk.bold("Error: ") + message));
}

function makeInfo(message) {
    infoMsgs.push( chalk.bold("Info: ") + message);
}

function displayMsgs(){
    infoMsgs.map(function(item){
        bb.log.write(item);
    });
    warnMsgs.map(function(item){
        bb.log.write(item);
    });
    errMsgs.map(function(item){
        bb.log.write(item);
    });
}

function info(packager, distinctPatch, callback){
    makeInfo("Gitflow workflow release");
    makeInfo("Folder: " + process.cwd());

    if (!packager) {
        makeError('No packager found!');
    } else {
        var currentVersion = packager.version();
        if (distinctPatch && !semver.valid(currentVersion)) {
            makeWarning("Invalid current version: " + currentVersion);
        }
    }
    makeInfo('Using packager ' + packager.name);
    function checkDevelopBranch(){
        return gitp('show-ref --verify --quiet refs/heads/develop', function (stdout, code){
            if (code) {
                makeError("\'develop\' branch not found.")
            }
        });
    }

    function checkMasterBranch(){
        return gitp('show-ref --verify --quiet refs/heads/master', function (stdout, code){
            if (code) {
                makeError("\'master\' branch not found.")
            }
        });
    }

    function checkReleaseBranches(){
        return gitp('branch', function (stdout, code){
            if (!code) {
                if (/\srelease_/.test(stdout)) {
                    makeWarning("Warning: Release branch found.");
                }
            }
        });
    }

    function checkCredentialManager(){
        return gitp('config --list', function (stdout, code){
            if (!code) {
                if (!/\scredential\.helper(\s)*=(\s)*manager\s/.test(stdout)) {
                    makeError("credential.helper=manager not configured");
                }
            }
        });
    }

    gitp('status --porcelain', function(stdout, code){
        if (code) {
            console.log(stdout);
        } else if (stdout) {
            makeWarning("git status not clean.\n" + stdout.trim());
        }
        return true;
    }).then(checkReleaseBranches)
        .then(checkDevelopBranch)
        .then(checkMasterBranch)
        .then(checkCredentialManager)
        .then(function (){
            callback();
        });
}

// See http://nvie.com/posts/a-successful-git-branching-model/
// That release process is followed but adapted to apply to the develop branch files a version
// corresponding to the release version, but modified to have a 'special' patch number of 9000.
// The purpose of the special patch number is to simplify checks that release artifacts
// are produced from the master branch, not the develop branch.

function git(version, filenames, parent, distinctPatch, callback) {
    var tag = 'v' + version;
    var releaseBranch = 'release_' + version;
    var developVersion;

    if (distinctPatch) {
        developVersion = semver.major(version) + '.' +
            semver.minor(version) + '.' + distinctPatch;
    }

    function checkGitResult(stdout, code){
        if (code) {
            throw new Error("Error: " + stdout);
        }
        return true;
    }

    function createReleaseBranch() {
        return gitp('show-ref --verify --quiet refs/heads/' + releaseBranch, function (stdout, code){
            return code;
        }).then(function(code) {
            if (code) {
                return gitp('checkout -b ' + releaseBranch + ' develop', checkGitResult);
            } else {
                return gitp('checkout ' + releaseBranch, checkGitResult);
            }
        });
    }

    function reversionForMasterAndStageChanges(){
        util.bump(filenames, version, parent);
        return gitp('add ' + filenames.join(' '), checkGitResult);
    }

    function commitMasterVersionChanges(){
        return gitp('commit -m "Version ' + version + '"', checkGitResult);
    }

    function checkoutMasterBranch(){
        return gitp('checkout master', checkGitResult);
    }

    function pullMasterBranch(){
        gitp('pull', checkGitResult);
    }

    function mergeIntoReleaseBranch(){
        return gitp('merge -X theirs ' + releaseBranch, checkGitResult);
    }

    function pushMasterToOrigin(){
        return gitp('push', checkGitResult);
    }

    function switchToDevelop(){
        return gitp('checkout develop', checkGitResult);
    }

    function mergeIntoDevelop(){
        return gitp('merge ' + releaseBranch, checkGitResult);
    }

    function maybeApplyDistinctPatchVersion(results) {
        if (distinctPatch) {
            return reversionForDevelopAndStageChanges().then(commitDevelopVersionChanges);
        } else {
            return results;
        }
    }

    function reversionForDevelopAndStageChanges(){
        util.bump(filenames, developVersion, parent);
        return gitp('add ' + filenames.join(' '), checkGitResult);
    }

    function commitDevelopVersionChanges(){
        return gitp('commit -m "Version ' + developVersion + '"', checkGitResult);
    }

    function pushDevelopToOrigin(){
        return gitp('push', checkGitResult);
    }

    function deleteReleaseBranch(){
        return gitp('branch -d ' + releaseBranch, checkGitResult);
    }

    function createAnnotatedTag(){
        return gitp('tag -a ' + tag + ' -m "Tag ' + tag + '"', checkGitResult);
    }

    function pushTags(){
        return gitp('push --tags', checkGitResult);
    }

    console.log('Bump version to ' + version);
    util.hook('pre-release', version);
    gitp('checkout develop', checkGitResult).then(createReleaseBranch)
        .then(reversionForMasterAndStageChanges)
        .then(commitMasterVersionChanges)
        .then(checkoutMasterBranch)
        .then(pullMasterBranch)
        .then(mergeIntoReleaseBranch)
        .then(pushMasterToOrigin)
        .then(switchToDevelop)
        .then(mergeIntoDevelop)
        .then(maybeApplyDistinctPatchVersion)
        .then(pushDevelopToOrigin)
        .then(deleteReleaseBranch)
        .then(checkoutMasterBranch)
        .then(createAnnotatedTag)
        .then(pushTags)
        .then(function (){
            util.hook('post-release', version);
            callback();
        })
        .fail(function (err) {
            callback(err);
        });
}

function gitflowRelease(type, files, parent, distinctPatch, callback) {
    var obj = util.prepareChoices(type, files, distinctPatch);
    if (!obj.packager) {
        callback(new Error('No packager found !'));
        return;
    }

    info(obj.packager, distinctPatch, function() {
        displayMsgs();
        if (errMsgs.length > 0) {
            callback(new Error('Errors found'));
            return;
        }
        inquirer.prompt([{
            type: 'list',
            name: 'version',
            message: 'Which version do you want to release ?',
            choices: obj.gitflowChoices,
            default: obj.gitflowDefault
        }], function(answers) {
            var version = answers.version;
            if (version !== 'exit') {
                git(version, obj.filenames, parent, distinctPatch, callback);
            } else {
                callback();
            }
        });
    });
}

module.exports = gitflowRelease;
