const multer = require('multer'); //For receiving files through HTTP POST
var Client = require('node-rest-client').Client;
var client = new Client();
const fork = require('child_process').fork;
var express = require('express');
const { request } = require("http");
var app = express();
const { type } = require('os');

var aux = require("../modules/auxiliary/auxiliary");
var event_router = require('../modules/eventrouter/mqttconnector')
var engine = require('../modules/egsmengine/egsmengine')
var LOG = require('../modules/auxiliary/LogManager')

app.use(express.static(__dirname));

module.id = "MAIN"
LOG.logWorker('DEBUG', 'Worker started', module.id)

var SUPERVISOR = "localhost"
var SUPERVISOR_PORT = 8085

var WORKER_ID = 'worker'
var LOCAL_HTTP_PORT = 8086
var MAX_ENGINES = 10

var SUPERVISOR_CONNECTION = false

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


async function createNewEngine(engine_params, informalModel, processModel, eventRouterConfig) {
    LOG.logWorker('DEBUG', 'Creating new engine instance: ' + engine_params.engine_id, module.id)
    engine.createNewEngine(engine_params.engine_id, informalModel.buffer.toString(), processModel.buffer.toString());
    return true
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
    if (engine.getEngineNumber() >= MAX_ENGINES) {
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
    var engine_params = {
        engine_id, mqtt_broker, mqtt_port, mqtt_user, mqtt_password
    }
    createNewEngine(engine_params, informalModel, processModel, eventRouterConfig).then(
        function (value) {
            if (value) {
                LOG.logWorker('DEBUG', 'New engine created. Request status 200 sent', module.id)
                res.status(200).send({
                    result: true,
                    message: "New instance created"
                })
            }
            else {
                LOG.logWorker('DEBUG', 'Error while creating new engine. Request status 500 sent', module.id)
                res.status(500).send({
                    error: "Error while creating engine"
                })
            }
        }
    )
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
    var mqtt_broker = req.body.mqtt_broker || 'undefined'
    var mqtt_port = req.body.mqtt_port || 'undefined'
    var mqtt_user = req.body.mqtt_user || 'undefined'
    var mqtt_password = req.body.mqtt_password || 'undefined'
    var mqtt_client_uuid = req.body.client_uuid || 'undefined'

    if (typeof mqtt_broker == 'undefined' || typeof mqtt_port == 'undefined' || typeof mqtt_user == 'undefined' ||
        typeof mqtt_password == 'undefined') {
        LOG.logWorker('DEBUG', 'Request cancelled. Argument(s) are missing', module.id)
        return res.status(500).send({ error: "Parameter(s) missing" })
    }
    var result = event_router.createConnection(mqtt_password, mqtt_port, mqtt_user, mqtt_password, mqtt_client_uuid);
    if (!result) {
        LOG.logWorker('DEBUG', 'Error while creating connection', module.id)
        return res.status(500).send({ error: "Error while creating connection" })
    }
    LOG.logWorker('DEBUG', 'New broker connection created:' + mqtt_broker + ':' + mqtt_port, module.id)
    return res.status(200).send("New broker connection established")
})

//TODO Set default mqtt broker for process engine

//Delete existing process
app.delete("/engine/remove", function (req, res) {
    LOG.logWorker('DEBUG', 'Delete engine requested', module.id)

    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        LOG.logWorker('DEBUG', 'Request canceled. engine_id is missing', module.id)
        return res.status(500).send({
            error: "No engine_id"
        })
    }
    //TODO remove engine

    res.status(200).send("ok")
})

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

app.get('/status', function (req, res) {
    //TODO: implement
    res.status(200).send('Not implemented yet')
})

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
