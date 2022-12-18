var PRIM = require('./modules/egsm-common/auxiliary/primitives')
var event_router = require('./modules/eventrouter/eventrouter')
var LOG = require('./modules/egsm-common/auxiliary/logManager');
var MQTTCOMM = require('./modules/communication/mqttcommunication')
var egsmengine = require('./modules/egsmengine/egsmengine');

module.id = "MAIN"

LOG.logWorker('DEBUG', 'Worker started', module.id)

var WORKER_ID = ''

var broker = new PRIM.Broker('localhost', 1883, '', '')

LOG.logWorker('DEBUG', 'Finding a unique ID by active cooperation with peers...', module.id)
MQTTCOMM.initPrimaryBrokerConnection(broker).then((result) => {
    WORKER_ID = result
    LOG.logWorker('DEBUG', `Unique ID found: [${WORKER_ID}]`, module.id)
})

egsmengine.setEventRouter(event_router.processPublish)

