
var program = require('commander');
var pkg = require('../package');
var reversion = require('../lib/reversion');
var util = require('../lib/util');


program
  .version(pkg.version)
  .usage('files...')
  .option('-p, --parent', 'also update parent version (Maven only)')
  .parse(process.argv);

var files = program.args.length > 0 && program.args;

function workflowCallback(patchflag, version) {
  reversion(patchflag, version, files, program.parent, function(err) {
    if (err) {
      console.error(err.message);
      process.exit(1);
    } else {
      process.exit();
    }
  });
}

util.recognizeWorkflow(workflowCallback);


