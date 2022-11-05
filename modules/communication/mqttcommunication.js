var UUID = require("uuid");

var MQTT = require("../egsm-common/communication/mqttconnector")
var LOG = require('../egsm-common/auxiliary/logManager')
var PRIM = require('../egsm-common/auxiliary/primitives')
var AUX = require('../egsm-common/auxiliary/auxiliary')
var ROUTES = require('../communication/routes')

var egsmengine = require('../egsmengine/egsmengine');
var event_router = require('../eventrouter/eventrouter')

module.id = "MQTTCOMM"

const ID_VERIFICATION_PERIOD = 2500
//Topic definitions
const SUPERVISOR_TOPIC_IN = 'supervisor_woker_in'
const SUPERVISOR_TOPIC_OUT = 'supervisor_worker_out'
var TOPIC_SELF = ''

var MQTT_HOST = undefined
var MQTT_PORT = undefined;
var MQTT_USER = undefined;
var MQTT_USER_PW = undefined

var REQUEST_PROMISES = new Map()

/*Message body contains:
-sender_type: WORKER/AGGREGATOR
-sender_id: <string>
-message_type: PONG/PING/NEW_WORKER/NEW_ENGINE_SLOT/NEW_ENGINE_SLOT_RESP/NEW_ENGINE/SEARCH
-request_id: <string> (optional if no response expected)
-payload: <string>
*/
function onMessageReceived(hostname, port, topic, message) {
    console.log('new message')
    if ((hostname != MQTT_HOST || port != MQTT_PORT) || (topic != SUPERVISOR_TOPIC_OUT && topic != TOPIC_SELF)) {
        return
    }
    console.log('new message1')
    var msgJson = JSON.parse(message.toString())
    if (topic == SUPERVISOR_TOPIC_OUT) {
        switch (msgJson['message_type']) {
            case 'NEW_ENGINE_SLOT':
                if (egsmengine.hasFreeSlot()) {
                    var response = {
                        request_id: msgJson['request_id'],
                        message_type: 'NEW_ENGINE_SLOT_RESP',
                        sender_id: TOPIC_SELF
                    }
                    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_IN, JSON.stringify(response))
                }
                break;
            case 'PING':
                var response = {
                    request_id: msgJson['request_id'],
                    message_type: 'PONG',
                    sender_id: TOPIC_SELF,
                    payload: {
                        hostname: ROUTES.getRESTCredentials()['hostname'],
                        port: ROUTES.getRESTCredentials()['port'],
                        uptime: process.uptime(),
                        capacity: egsmengine.getCapacity(),
                        engine_mumber: egsmengine.getEngineNumber()
                    }
                }
                MQTT.publishTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_IN, JSON.stringify(response))
                break;
            case 'SEARCH':
                if (egsmengine.exists(msgJson['payload']['engine_id'])) {
                    var response = {
                        request_id: msgJson['request_id'],
                        message_type: 'SEARCH',
                        sender_id: TOPIC_SELF,
                        payload: { rest_api: ROUTES.getRESTCredentials() }
                    }
                    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_IN, JSON.stringify(response))
                }
                break;
            case 'GET_COMPLETE_DIAGRAM':
                if (egsmengine.exists(msgJson['payload']['engine_id'])) {
                    var response = {
                        request_id: msgJson['request_id'],
                        message_type: 'GET_COMPLETE_DIAGRAM_RESP',
                        sender_id: TOPIC_SELF,
                        payload: { result: egsmengine.getCompleteDiagram(msgJson['payload']['engine_id']) }
                    }
                    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_IN, JSON.stringify(response))
                }
                break;
            case 'GET_COMPLETE_NODE_DIAGARM':
                if (egsmengine.exists(msgJson['payload']['engine_id'])) {
                    var response = {
                        request_id: msgJson['request_id'],
                        message_type: 'GET_COMPLETE_NODE_DIAGARM_RESP',
                        sender_id: TOPIC_SELF,
                        payload: { result: egsmengine.getCompleteNodeDiagram(msgJson['payload']['engine_id']) }
                    }
                    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_IN, JSON.stringify(response))
                }
                break;
            case 'PROCESS_SEARCH':
                var engines = egsmengine.getEnginesOfProcess(msgJson['payload']['process_id'])
                var api = ROUTES.getRESTCredentials()
                engines.forEach(element => {
                    element['worker_host'] = api.hostname
                    element['worker_api_port'] = api.port
                });
                var response = {
                    request_id: msgJson['request_id'],
                    message_type: 'PROCESS_SEARCH_RESP',
                    sender_id: TOPIC_SELF,
                    payload: { engines: engines }
                }
                MQTT.publishTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_IN, JSON.stringify(response))
                break;
        }
    }
    else if (topic == TOPIC_SELF) {
        console.log('self')
        if (msgJson['message_type'] == 'PONG') {
            if (REQUEST_PROMISES.has(msgJson['request_id'])) {
                REQUEST_PROMISES.get(msgJson['request_id'])('not_ok')
                REQUEST_PROMISES.delete(msgJson['request_id'])
            }
        }
        else if (msgJson['message_type'] == 'PING') {
            var response = {
                request_id: msgJson['request_id'],
                message_type: 'PONG'
            }
            MQTT.publishTopic(MQTT_HOST, MQTT_PORT, TOPIC_SELF, JSON.stringify(response))
            console.log('published')
        }
        else if (msgJson['message_type'] == 'NEW_ENGINE') {
            var resPayload = createNewEngine(msgJson['payload'])
            var response = {
                request_id: msgJson['request_id'],
                payload: resPayload,
                message_type: 'NEW_ENGINE'
            }
            MQTT.publishTopic(MQTT_HOST, MQTT_PORT, TOPIC_SELF, JSON.stringify(response))
        }
        else if (msgJson['message_type'] == 'GET_ENGINE_LIST') {
            var resPayload = egsmengine.getEngineList()
            var api = ROUTES.getRESTCredentials()
            resPayload.forEach(element => {
                element['worker_host'] = api.hostname
                element['worker_api_port'] = api.port
            });
        
            var response = {
                request_id: msgJson['request_id'],
                payload: resPayload,
                message_type: 'GET_ENGINE_LIST_RESP'
            }
            MQTT.publishTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_IN, JSON.stringify(response))
        }
    }
    else {

    }
}

function createNewEngine(payload) {
    LOG.logWorker('DEBUG', 'New engine creation requested', module.id)
    var responsePayload = {}
    //Check once again if the worker can serve one more engine
    if (!egsmengine.hasFreeSlot()) {
        LOG.logWorker('DEBUG', 'Request cancelled. Out of free Engine slots', module.id)
        return responsePayload['error'] = 'NO_SLOT'
    }

    //Check if necessary data fields are available
    var engine_id = payload.engine_id

    var mqtt_broker = payload.mqtt_broker
    var mqtt_port = payload.mqtt_port
    var mqtt_user = payload.mqtt_user
    var mqtt_password = payload.mqtt_password

    if (typeof engine_id == "undefined" || typeof mqtt_broker == "undefined" || mqtt_broker == "undefined" || typeof mqtt_port == "undefined"
        || typeof mqtt_user == "undefined" || typeof mqtt_password == "undefined") {
        LOG.logWorker('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return responsePayload['error'] = 'ARGUMENT_MISSING'
    }

    //Check if each necessary files are available
    var informalModel = payload.informal_model;
    var processModel = payload.process_model;
    var eventRouterConfig = payload.event_router_config;

    if (typeof informalModel == 'undefined' || typeof processModel == 'undefined' || typeof eventRouterConfig == 'undefined') {
        LOG.logWorker('DEBUG', 'Request cancelled. Necessary files have not received, process cannot be initiated!', module.id)
        return responsePayload['error'] = 'FILE_MISSING'
    }

    //Everything is provided, creating new engine

    //Check if there is any engine with the same engine id
    if (egsmengine.exists(engine_id)) {
        LOG.logWorker('WARNING', `Engine with id [${engine_id}] is already exists, could not created again`, module.id)
        return responsePayload['error'] = 'ENGINE_ID_CONFLICT'
    }
    //Check if the broker connection exists and create it is if not
    var result = MQTT.createConnection(mqtt_broker, mqtt_port, mqtt_user, mqtt_password, 'ntstmqtt_' + Math.random().toString(16).substr(2, 8));
    if (!result) {
        LOG.logWorker('DEBUG', 'Error while creating connection', module.id)
        return responsePayload['error'] = 'BROKER_CONN_ERROR'
    }
    if (result == 'created') {
        LOG.logWorker('DEBUG', 'New broker connection created for the new engine', module.id)
    }
    else if (result == 'connection_exists') {
        LOG.logWorker('DEBUG', 'New Broker connection was not needed, since it was already defined', module.id)
    }

    //Set up Default Broker for the engine
    event_router.setEngineDefaults(engine_id, mqtt_broker, mqtt_port, egsmengine.notifyEngine)

    //Adding Engine to the Event Router
    event_router.initConnections(engine_id, eventRouterConfig)

    //Creating new engine
    egsmengine.createNewEngine(engine_id, informalModel, processModel).then(
        function (value) {
            if (value == 'created') {
                LOG.logWorker('DEBUG', 'New engine created', module.id)
                return responsePayload['success'] = 'ENGINE_CREATED'
            }
            else {
                LOG.logWorker('WARNING', 'Unhandled error while creating new engine', module.id)
                return responsePayload['error'] = 'ERROR_WHILE_CREATING_ENGINE'
            }
        }
    )

}

async function wait(delay) {
    await AUX.sleep(delay)
}

async function checkIdCandidate(candidate) {
    var request_id = 'random' //TODO UUID.v4();
    var message = JSON.stringify(
        request_id = request_id,
        message_type = 'PING'
    )
    MQTT.publishTopic(MQTT_HOST, MQTT_PORT, candidate, JSON.stringify(message))
    var promise = new Promise(function (resolve, reject) {
        REQUEST_PROMISES.set(request_id, resolve)

        wait(ID_VERIFICATION_PERIOD).then(() => {
            resolve('ok')
        })
    });
    return promise
}

async function initPrimaryBrokerConnection(broker) {
    MQTT_HOST = broker.host
    MQTT_PORT = broker.port
    MQTT_USER = broker.username
    MQTT_USER_PW = broker.password

    MQTT.init(onMessageReceived)
    MQTT.createConnection(MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_USER_PW)

    //Find an unused, unique ID for the Engine
    while (true) {
        TOPIC_SELF = UUID.v4();
        MQTT.subscribeTopic(MQTT_HOST, MQTT_PORT, TOPIC_SELF)
        var result = await checkIdCandidate(TOPIC_SELF)
        console.log(result)
        if (result == 'ok') {
            break;
        }
        else {
            MQTT.unsubscribeTopic(MQTT_HOST, MQTT_PORT, TOPIC_SELF)
        }
    }
    MQTT.subscribeTopic(MQTT_HOST, MQTT_PORT, SUPERVISOR_TOPIC_OUT)
    return TOPIC_SELF
}

module.exports = {
    checkIdCandidate: checkIdCandidate,
    initPrimaryBrokerConnection: initPrimaryBrokerConnection
}

