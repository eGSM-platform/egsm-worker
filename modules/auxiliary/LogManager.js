// log handling module

// dependencies
var fs = require('fs');
var util = require('util');

const LOG_LEVELS = {'DEBUG': 1, 'WARNING': 2, 'ERORR': 3};
var CONSOLE_LOG_LEVEL = LOG_LEVELS.DEBUG; //Console log from a defined level above

// define output for log files
// TODO: delete 'w' flags to prevent overwriting log files
var prefisso = (new Date().toISOString().replace(/:/g,'')).replace(/\./g,'');
fs.mkdirSync('log/'+ prefisso);
var debug_log = fs.createWriteStream('log/'+ prefisso +'/debug.log', {flags : 'w'});
var model_log = fs.createWriteStream('log/'+ prefisso +'/model.log', {flags : 'w'});
var snapshot_log = fs.createWriteStream('log/'+ prefisso +'/snapshot.log', {flags : 'w'});
var event_log = fs.createWriteStream('log/'+ prefisso +'/event.log', {flags : 'w'});
var message_log = fs.createWriteStream('log/'+ prefisso +'/message.log', {flags : 'w'});
var parser_log = fs.createWriteStream('log/'+ prefisso +'/parser.log', {flags : 'w'});
var trace_log = fs.createWriteStream('log/'+ prefisso +'/trace.log', {flags : 'w'});
var test_log = fs.createWriteStream('log/'+ prefisso +'/test.log', {flags : 'w'});

var worker_log = fs.createWriteStream('log/'+ prefisso +'/worker.log', {flags : 'w'});

var debugLog = [];


//define logging method (file format)
var log = function(type, id, message)
{
  var timestamp = new Date();
  var strLog = type + ';' + util.format(id + ' - ' + message) + '\n';
  var l = {};
  l.timestamp = timestamp.toISOString()
  l.message = strLog
  debugLog.push(l);
  debug_log.write(timestamp.toISOString() + ';' + strLog);
}

var logModel = function(message)
{
  model_log.write(new Date().toISOString() + ';' + 'GENERIC' + ';' + util.format(message) + '\n');
}

var logModelExpression = function(expression)
{
  model_log.write(new Date().toISOString() + ';' + 'EXPRESSION' + ';' + util.format(expression) + '\n');
}

var logModelPAC1 = function(type, id, value)
{
  model_log.write(new Date().toISOString() + ';' + 'PAC' + ';' + util.format(type + ' - ' + id + ' - ' + value) + '\n');
}

var logModelPAC2 = function(type, id,  attribute, value, checkValue)
{
  model_log.write(new Date().toISOString() + ';' + 'PAC' + ';' + util.format(type + ' - ' + id + ' - ' + attribute + ' - ' + value + ' - ' + checkValue) + '\n');
}

var logModelAttribute = function(id, parent, value, newValue)
{
  model_log.write(new Date().toISOString() + ';' + 'ATTRIBUTE' + ';' + util.format(id + ' - ' + parent + ' - ' + value + ' -> ' + newValue) + '\n');
}

var logModelInfo = function(id)
{
  model_log.write(new Date().toISOString() + ';' + 'INFORMATION' + ';' + util.format(id) + '\n');
}

var logModelEvent = function(id, value)
{
  model_log.write(new Date().toISOString() + ';' + 'EVENT' + ';' + util.format(id + ' - ' + value) + '\n');
}

var logModelData = function(id, type, stage, reason, value, sentry)
{
  model_log.write(new Date().toISOString() + ';' + 'DATA' + ';' + util.format(id + ' - ' + type + ' - ' + stage + ' - ' + reason + ' - ' + value + ' - ' + sentry) + '\n');
}

var logModelStage = function(type, id, reason, guard, value)
{
  model_log.write(new Date().toISOString() + ';' + 'STAGE' + ';' + util.format(type + ' - ' + id + ' - ' + reason + ' - ' + guard + ' - ' + value) + '\n');
}

logSnapshot = function(message)
{
  snapshot_log.write(new Date().toISOString() + '\n\n' + util.format(message) + '\n\n');
}

logEvent = function(message)
{
  event_log.write(new Date().toISOString() + ';' + util.format(message) + '\n');
}

logMessage = function(message)
{
  message_log.write(new Date().toISOString() + ';' + util.format(message) + '\n');
}

logParser = function(id, operation, variable, expression)
{
  parser_log.write(new Date().toISOString() + ';' + 'PARSER' + ';' + util.format(id + ' - ' + operation + ' - ' + variable + ' - ' + expression) + '\n');
}

var logTrace = function(type, id, context, reason, guard, value)
{
  trace_log.write(new Date().toISOString() + ';' + context + ';' + util.format(type + ' - ' + id + ' - ' + reason + ' - ' + guard + ' - ' + value) + '\n');
}

var logTest = function(message)
{
  test_log.write(new Date().toISOString() + ';' + message + '\n');
}

var logWorker = function(type, value, location)
{
  location = location || ''
  worker_log.write(new Date().toISOString() + '; ' + util.format('[' + location + '] ' + type + ' - ' + value) + '\n');
  if(LOG_LEVELS[type] >= CONSOLE_LOG_LEVEL){
    console.log(util.format('[' + location + '] ' + type + ' - ' + value))
  }
}

// exposed functions
module.exports = {
  //logging methods
  log: log,
  logModel: logModel,
  logModelExpression: logModelExpression,
  logModelPAC1: logModelPAC1,
  logModelPAC2: logModelPAC2,
  logModelAttribute: logModelAttribute,
  logModelInfo: logModelInfo,
  logModelEvent: logModelEvent,
  logModelData: logModelData,
  logModelStage: logModelStage,
  logSnapshot: logSnapshot,
  logEvent: logEvent,
  logMessage: logMessage,
  logParser: logParser,
  logTrace: logTrace,
  logTest: logTest,
  logWorker: logWorker,
  //array for UI visualization
  debugLog: debugLog
}
