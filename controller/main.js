const multer = require('multer'); //For receiving files through HTTP POST
var Client = require('node-rest-client').Client;
var client = new Client();
const fork = require('child_process').fork;
var express = require('express');
const { request } = require("http");
var app = express();

var aux = require("../modules/auxiliary/auxiliary");
var event_router = require('../modules/eventrouter/mqttconnector')
var engine = require('../modules/egsmengine/egsmengine')
const { type } = require('os');

app.use(express.static(__dirname));


function getCredentials(options) {
    return new Promise((resolve, reject) => {
        console.log("req")
        var req = client.post("http://" + SUPERVISOR + ":" + SUPERVISOR_PORT + "/worker/register", args, function (data, response) {
            // parsed response body as js object
            console.log(data);
            var MQTT_CLIENT_UUID = data.mqtt_client_uuid || 'ntstmqtt_' + Math.random().toString(16).substr(2, 8)
            resolve(true);
        });
        req.on('error', function (req) {
            console.log('Could not retrieve credentials from Supervisor');
            //req.abort();
            resolve(false);
        });
    });
}

async function createNewEngine(engine_params, informalModel, processModel, eventRouterConfig) {
    console.log("New instace created with: ")
    console.log(engine_params.engine_id)
    engine.createNewEngine(engine_params.engine_id);
    return true
}


//Setting up storage for file posting
const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, "");
    },
})

const upload = multer({ storage: storage })

var SUPERVISOR = "localhost"
var SUPERVISOR_PORT = 8085
var LOCAL_HTTP_PORT = 8086
var WORKER_ID = "WORKER_1" //TODO: Change to system variable
var MAX_ENGINES = 10

var SUPERVISOR_CONNECTION = false

//Notify Supervisor about Worker existance and request credentials
var args = {
    data: {
        max_engines: MAX_ENGINES,
        worker_id: WORKER_ID
    },
    headers: { "Content-Type": "application/json" }
};

(async () => {
    while (!SUPERVISOR_CONNECTION) {
        let res = await getCredentials()
        if (res) {
            SUPERVISOR_CONNECTION = true
        }
        else {
            console.log("Retry in 5 sec")
            await aux.sleep(5000);
        }
    }
})();


//Engine-related variables
var engines = [];
//ROUTES

//Create New Process
app.post("/engine/new", upload.any(), function (req, res, next) {
    console.log("New EGSM Engine instance requested")

    //Check if worker can serve one more engine
    if (engines.length >= MAX_ENGINES) {
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
        console.log("Necessary argument(s) are missing")
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
        if (typeof informalModel == 'undefined' || typeof processModel == 'undefined' || typeof eventRouterConfig == 'undefined') {
            console.log("Necessary files have not received, process cannot be initiated!")
            return res.status(500).send({ "error": "Config file(s) are missing, new process could not be initiated" })
        }

        var engine_params = {
            engine_id, mqtt_broker, mqtt_port, mqtt_user, mqtt_password
        }
        createNewEngine(engine_params, informalModel, processModel, eventRouterConfig).then(
            function (value) {
                if (value) {
                    res.status(200).send({
                        result: true,
                        message: "New instance created"
                    })
                }
                else {
                    res.status(500).send({
                        error: "Error while creating engine"
                    })
                }
            }
        )
    } else {
        res.status(500).send({
            "error": "No config files provided"
        })
    }
})

app.post('/broker_connection/new', upload.any(), function (req, res) {
    //Check if necessary data fields are available
    if (typeof req.body == 'undefined') {
        return res.status(500).send({ error: "Body missing" })
    }
    var mqtt_broker = req.body.mqtt_broker || 'undefined'
    var mqtt_port = req.body.mqtt_port || 'undefined'
    var mqtt_user = req.body.mqtt_user || 'undefined'
    var mqtt_password = req.body.mqtt_password || 'undefined'
    var mqtt_client_uuid = req.body.client_uuid || 'undefined'

    if (typeof mqtt_broker == 'undefined' || typeof mqtt_port == 'undefined' || typeof mqtt_user == 'undefined' ||
        typeof mqtt_password == 'undefined') {
        return res.status(500).send({ error: "Parameter(s) missing" })
    }
    var result = event_router.createConnection(mqtt_password, mqtt_port, mqtt_user, mqtt_password, mqtt_client_uuid);
    if (!result) {
        return res.status(500).send({ error: "Error while creating connection" })
    }
    return res.status(200).send("New broker connection established")
})

//Delete existing process
app.delete("/engine/remove", function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
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

app.get('/status', function(req, res){
    //TODO: implement
    res.status(200).send('Not implemented yet')
})


app.listen(LOCAL_HTTP_PORT, () => {
    console.log(`Example app listening on port ${LOCAL_HTTP_PORT}`)
})






//TODO: Spawn child processes (EVENT ROUTER & ENGINE POOL)
/*const program = path.resolve('../eventrouter/main.js');
const parameters = [];
const options = {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
};

const child = fork(program, parameters, options);
child.on('message', message => {
  console.log('message from child:', message);
  child.send('Hi');
});*/




