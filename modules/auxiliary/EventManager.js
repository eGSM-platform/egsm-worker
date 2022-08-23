// generic event handling module

// dependencies
var events = require('events');
var LogManager = require('./LogManager');

// initialize event handler instance
var eventEmitter = new events.EventEmitter();
// array of registered events
var events = [];

// exposed functions
module.exports = {
  // event handler instance
  emitter: eventEmitter,
  //handle event emission (with custom logging)
  emit: function(event, arg1, arg2){
    LogManager.logEvent('EMIT event emitted - ' + event + ' - ' + arg1 + ' - ' + arg2);
    eventEmitter.emit(event, arg1, arg2);
  },
  //handle listener registration (with custom logging)
  on: function(source,eventName, listener)
  {
    LogManager.logEvent('ON listener registered - ' + source + ' - ' + eventName);
    eventEmitter.on(eventName, listener);
    events.push(eventName)
  },
  //reset registered events
  reset: function ()
  {
    for(var key in events){
      //remove all listeners
      eventEmitter.removeAllListeners(events[key]);
      LogManager.logEvent('REMOVE listener removed - ' + events[key]);
    }
  }
}
