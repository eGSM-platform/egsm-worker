var aux = require("../modules/egsm-common/auxiliary/auxiliary");
var PRIM = require('../modules/egsm-common/auxiliary/primitives')
var event_router = require('../modules/eventrouter/eventrouter')
var mqtt = require('../modules/egsm-common/communication/mqttconnector')
var LOG = require('../modules/egsm-common/auxiliary/logManager');
var MQTTCOMM = require('../modules/communication/mqttcommunication')
var egsmengine = require('../modules/egsmengine/egsmengine');
var ROUTES = require('../modules/communication/routes')

module.id = "MAIN"

LOG.logWorker('DEBUG', 'Worker started', module.id)

var WORKER_ID = 'worker'
var LOCAL_HTTP_PORT = 8086

var SUPERVISOR_CONNECTION = false

var broker = new PRIM.Broker('localhost', 1883, '', '')

LOG.logWorker('DEBUG', 'Finding a unique ID by active cooperation with peers', module.id)
WORKER_ID = MQTTCOMM.initPrimaryBrokerConnection(broker).then((result) => {
    SUPERVISOR_CONNECTION = true
    WORKER_ID = result
    LOG.logWorker('DEBUG', `Unique ID found: [${WORKER_ID}]`, module.id)
})

egsmengine.setEventRouter(event_router.processPublish)



