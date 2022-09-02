const multer = require('multer'); //For receiving files through HTTP POST
var Client = require('node-rest-client').Client;
var express = require('express');
var app = express();

var aux = require("../modules/auxiliary/auxiliary");
var event_router = require('../modules/eventrouter/eventrouter')
var mqtt = require('../modules/eventrouter/mqttconnector')
var LOG = require('../modules/auxiliary/LogManager');
const egsmengine = require('../modules/egsmengine/egsmengine');

app.use(express.static(__dirname));

module.id = "MAIN"
LOG.logWorker('DEBUG', 'Worker started', module.id)

var client = new Client();
var SUPERVISOR = "localhost"
var SUPERVISOR_PORT = 8085

var WORKER_ID = 'worker'
var LOCAL_HTTP_PORT = 8086
var MAX_ENGINES = 10

var SUPERVISOR_CONNECTION = false

egsmengine.setEventRouter(event_router.processPublish)

//TODO: Add a websocket-based connection watchdog between worker and supervisor

function getCredentials(options) {
    var args = {
        data: {
            max_engines: MAX_ENGINES,
            rest_api_port: LOCAL_HTTP_PORT
        },
        headers: { "Content-Type": "application/json" }
    };
    return new Promise((resolve, reject) => {
        var req = client.post("http://" + SUPERVISOR + ":" + SUPERVISOR_PORT + "/worker/register", args, function (data, response) {
            // parsed response body as js object
            WORKER_ID = data.worker_id
            if (typeof WORKER_ID == 'undefined') {
                LOG.logWorker('WARNING', 'Supervisor did not provided WORKER_ID', module.id)
                resolve(false);
            }
            if (response.statusCode != 200) {
                LOG.logWorker('WARNING', 'Server response code: ' + response.statusCode, module.id)
                resolve(false);
            }
            resolve(true);
        });
        req.on('error', function (req) {
            LOG.logWorker('WARNING', 'Could not retrieve credentials from Supervisor', module.id)
            resolve(false);
        });
    });
}

function deregisterFromSupervisor(options) {
    var args = {
        data: {
            worker_id: WORKER_ID
        },
        headers: { "Content-Type": "application/json" }
    };
    return new Promise((resolve, reject) => {
        var req = client.post(`http://${SUPERVISOR}:${SUPERVISOR_PORT}/worker/deregister`, args, function (data, response) {
            if (response.statusCode != 200) {
                LOG.logWorker('WARNING', 'Deregistering may not be successfull. Server response code: ' + response.statusCode)
            }
            else {
                LOG.logWorker('DEBUG', 'Worker deregistered from Supervisor', module.id)
            }
            resolve(true);
        });
        req.on('error', function (req) {
            LOG.logWorker('WARNING', 'Deregistering may not be successfull', module.id)
            resolve(true);
        });
    });
}

//Setting up storage for file posting
const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, "");
    },
})

const upload = multer({ storage: storage });

//Notify Supervisor about Worker existance and request credentials
(async () => {
    while (!SUPERVISOR_CONNECTION) {
        LOG.logWorker('DEBUG', 'Reaching out Supervisor...', module.id)
        let res = await getCredentials()
        if (res) {
            SUPERVISOR_CONNECTION = true
            LOG.logWorker('DEBUG', 'Supervisor connection established', module.id)
        }
        else {
            LOG.logWorker('WARNING', 'Could not reach out Supervisor. Retry in 5 sec...', module.id)
            await aux.sleep(5000);
        }
    }
})();

//ROUTES
//Create New Process
app.post("/engine/new", upload.any(), function (req, res, next) {
    LOG.logWorker('DEBUG', 'New process creation requested', module.id)

    if (typeof req.body == 'undefined') {
        LOG.logWorker('DEBUG', 'Request body is missing', module.id)
        return res.status(500).send({ error: "Body missing" })
    }

    //Check if worker can serve one more engine
    if (egsmengine.getEngineNumber() >= MAX_ENGINES) {
        LOG.logWorker('DEBUG', 'Request cancelled. Out of free Engine slots', module.id)
        res.status(500).send({
            "error": "No free eGSM Engine slot left on the worker"
        })
    }

    //Check if necessary data fields are available
    var engine_id = req.body.engine_id
    var mqtt_broker = req.body.mqtt_broker || 'localhost'
    var mqtt_port = req.body.mqtt_port || 1883
    var mqtt_user = req.body.mqtt_user || "admin"
    var mqtt_password = req.body.mqtt_password || 'password'

    if (typeof engine_id == "undefined" || typeof mqtt_broker == "undefined" || mqtt_broker == "undefined" || typeof mqtt_port == "undefined"
        || typeof mqtt_user == "undefined" || typeof mqtt_password == "undefined") {
        LOG.logWorker('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ "error": "Argument(s) are missing" })
    }

    //Check if each necessary files are available
    if (req.files) {
        for (let i = 0; i < req.files.length; i++) {
            if (req.files[i].fieldname == "informal_model") {
                var informalModel = req.files[i];
            }
            else if (req.files[i].fieldname == "process_model") {
                var processModel = req.files[i];
            }
            else if (req.files[i].fieldname == "eventRouterConfig") {
                var eventRouterConfig = req.files[i];
            }

        }
    }
    if (typeof informalModel == 'undefined' || typeof processModel == 'undefined' || typeof eventRouterConfig == 'undefined') {
        LOG.logWorker('DEBUG', 'Request cancelled. Necessary files have not received, process cannot be initiated!', module.id)
        return res.status(500).send({ "error": "Config file(s) are missing, new process could not be initiated" })
    }

    //Everything is provided, creating new engine

    //Check if there is any engine with the same engine id
    if (egsmengine.exists(engine_id)) {
        LOG.logWorker('WARNING', `Engine with id [${engine_id}] is already exists, could not created again. Request status 500 sent`, module.id)
        return res.status(500).send({
            result: false,
            message: "Instance with this ID already exists"
        })
    }
    //Check if the broker connection exists and create it is if not
    var result = mqtt.createConnection(mqtt_broker, mqtt_port, mqtt_user, mqtt_password, 'ntstmqtt_' + Math.random().toString(16).substr(2, 8));
    if (!result) {
        LOG.logWorker('DEBUG', 'Error while creating connection', module.id)
        return res.status(500).send({ error: "Error while creating connection" })
    }
    if (result == 'created') {
        LOG.logWorker('DEBUG', 'New broker connection created for the new engine', module.id)
    }
    else if (result == 'connection_exists') {
        LOG.logWorker('DEBUG', 'New Broker connection was not needed, since it was already defined', module.id)
    }

    //Set up Default Broker for the engine
    event_router.setEngineDefaults(engine_id, mqtt_broker, mqtt_port, egsmengine.notifyEngine)

    //Creating new engine
    egsmengine.createNewEngine(engine_id, informalModel.buffer.toString(), processModel.buffer.toString()).then(
        function (value) {
            if (value == 'created') {
                LOG.logWorker('DEBUG', 'New engine created. Request status 200 sent', module.id)
                return res.status(200).send({
                    result: true,
                    message: "New instance created"
                })
            }
            else if (value == 'already_exists') {
                LOG.logWorker('WARNING', `Engine with id [${engine_id}] is already exists, could not created again. Request status 500 sent`, module.id)
                return res.status(500).send({
                    result: true,
                    message: "Instance with this ID already exists"
                })
            }
            else {
                LOG.logWorker('WARNING', 'Unhandled error while creating new engine. Request status 500 sent', module.id)
                return res.status(500).send({
                    error: "Unhandled error while creating engine"
                })
            }
        }
    )

    //Adding Engine to the Event Router
    event_router.initConnections(engine_id, eventRouterConfig.buffer.toString())
})

//New MQTT broker connection
app.post('/broker_connection/new', upload.any(), function (req, res) {
    LOG.logWorker('DEBUG', 'New Broker Connection requested', module.id)
    //Check if the necessary data fields are available
    if (typeof req.body == 'undefined') {
        LOG.logWorker('DEBUG', 'Request body is missing', module.id)
        return res.status(500).send({ error: "Body missing" })
    }

    //Check if the necessary data fields are available
    var mqtt_broker = req.body.mqtt_broker
    var mqtt_port = req.body.mqtt_port
    var mqtt_user = req.body.mqtt_user
    var mqtt_password = req.body.mqtt_password
    var mqtt_client_uuid = req.body.client_uuid

    if (typeof mqtt_broker == 'undefined' || typeof mqtt_port == 'undefined' || typeof mqtt_user == 'undefined' ||
        typeof mqtt_password == 'undefined' || typeof mqtt_client_uuid == 'undefined') {
        LOG.logWorker('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ error: "Parameter(s) missing" })
    }
    var result = mqtt.createConnection(mqtt_broker, mqtt_port, mqtt_user, mqtt_password, mqtt_client_uuid);
    if (result) {
        if (result == 'created') {
            LOG.logWorker('DEBUG', 'New broker connection created:' + mqtt_broker + ':' + mqtt_port, module.id)
            return res.status(200).send("New broker connection established")
        }
        else if (result == 'connection_exists') {
            LOG.logWorker('DEBUG', 'Broker connection already exists:' + mqtt_broker + ':' + mqtt_port, module.id)
            return res.status(200).send("Connection_exists")
        }
    }
    LOG.logWorker('DEBUG', 'Error while creating connection', module.id)
    return res.status(500).send({ error: "Error while creating connection" })
})

//Delete existing engine
app.delete("/engine/remove", function (req, res) {
    LOG.logWorker('DEBUG', `Delete engine requested`, module.id)

    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        LOG.logWorker('DEBUG', 'Request canceled. engine_id is missing', module.id)
        return res.status(500).send({
            error: "No engine_id"
        })
    }
    //Remove engine from EventRouter
    event_router.onEngineStop(engine_id)
    //Remove engine from Engine array
    var result = egsmengine.removeEngine(engine_id)
    if (result == 'not_defined') {
        return res.status(500).send({
            error: "not_defined"
        })
    }
    res.status(200).send("ok")
})

//Reset an already existing engine
app.get('/engine/reset', function (req, res) {
    LOG.logWorker('DEBUG', `Reset engine requested`, module.id)

    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        LOG.logWorker('DEBUG', 'Request canceled. engine_id is missing', module.id)
        return res.status(500).send({
            error: "No engine_id"
        })
    }
    var result = egsmengine.resetEngine(engine_id)
    if (result == 'not_defined') {
        return res.status(500).send({
            error: "not_defined"
        })
    }
    res.status(200).send("ok")
});

app.get('/engine/status', function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
        })
    }
    //TODO engine status

    res.status(200).send("ok")
})

app.get('/engine/config_stages', function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
        })
    }
    res.status(200).json(egsmengine.getCompleteDiagram(engine_id));
});

app.get('/engine/config_stages_diagram', function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
        })
    }
    res.status(200).json(egsmengine.getCompleteNodeDiagram(engine_id));
});

//TODO
/*app.get('/debugLog', function(req, res) {
    res.json(LogManager.debugLog);
});*/

app.get('/engine/infomodel', function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
        })
    }
    res.status(200).json(egsmengine.getInfoModel(engine_id));
});

//TODO: This route may not be necessary since Event Router has direct access to the engines
app.get('/engine/updateInfoModel', function (req, res) {
    var engine_id = req.query.engine_id
    var name = req.query['name']
    var value = req.query['value']
    if (typeof engine_id == "undefined" || typeof name == "undefined" || typeof value == "undefined") {
        return res.status(500).send({
            error: "No engine id/model name / model value provided"
        })
    }
    res.status(200).json(egsmengine.updateInfoModel(engine_id, req.query['name'], req.query['value']));
});

const rest_api = app.listen(LOCAL_HTTP_PORT, () => {
    LOG.logWorker(`DEBUG`, `Worker listening on port ${LOCAL_HTTP_PORT}`, module.id)
})

process.on('SIGINT', () => {
    deregisterFromSupervisor().then(() => {
        rest_api.close(() => {
            LOG.logWorker(`DEBUG`, `Terminating process...`, module.id)
            process.exit()
        });
    })
});
