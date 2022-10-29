const multer = require('multer'); //For receiving files through HTTP POST
var express = require('express');
var bodyParser = require('body-parser')
var jsonParser = bodyParser.json()
var app = express();
const axios = require('axios').default;
const path = require('path');

var egsmengine = require('../egsmengine/egsmengine');

var LOCAL_HOST_NAME = 'localhost' //TODO: retrieve it properly
var LOCAL_HTTP_PORT = 8086

//Setting up storage for file posting
const storage = multer.memoryStorage({
    destination: function (req, file, callback) {
        callback(null, "");
    },
})

const upload = multer({ storage: storage });

var LOG = require('../egsm-common/auxiliary/logManager');

app.use(express.static(__dirname + '/public'));
module.id = "ROUTES"

app.get('/api/config_stages', function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
        })
    }
    res.status(200).json(egsmengine.getCompleteDiagram(engine_id));
});

app.get('/api/config_stages_diagram', function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
        })
    }
    res.status(200).json(egsmengine.getCompleteNodeDiagram(engine_id));
});

//TODO
app.get('/api/debugLog', function (req, res) {

    var engine_id = req.query.engine_id
    res.json(egsmengine.getDebugLog(engine_id));
});

app.get('/api/infomodel', function (req, res) {
    var engine_id = req.query.engine_id
    if (typeof engine_id == "undefined") {
        return res.status(500).send({
            error: "No engine engine id provided"
        })
    }
    res.status(200).json(egsmengine.getInfoModel(engine_id));
});

//TODO: This route may not be necessary since Event Router has direct access to the engines
app.get('/api/updateInfoModel', function (req, res) {
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

app.get('/api/guards', function (req, res) {
    var engine_id = req.query.engine_id
    if (engine_id == '') {
        res.send('')
        return
    }
    res.json(egsmengine._Guards);
});

app.get('/api/stages', function (req, res) {
    var engineid = req.query.engine_id
    if (engineid == '') {
        res.send('')
        return
    }
    res.json(egsmengine._Stages);
});

app.get('/api/environments', function (req, res) {
    var engineid = req.query.engine_id
    if (engineid == '') {
        res.send('')
        return
    }
    res.json(egsmengine.Environment_);
});

app.get('/api/externals', function (req, res) {
    res.json(egsmengine.Externals_);
});

app.get('*', function (req, res) {
    res.sendFile('index.html', { root: path.join(__dirname, '/public') });
});


const rest_api = app.listen(LOCAL_HTTP_PORT, () => {
    LOG.logWorker(`DEBUG`, `Worker listening on port ${LOCAL_HTTP_PORT}`, module.id)
})

process.on('SIGINT', () => {
    rest_api.close(() => {
        LOG.logWorker(`DEBUG`, `Terminating process...`, module.id)
        process.exit()
    });
});

module.exports = {
    getRESTCredentials: function(){
        return {
            hostname: LOCAL_HOST_NAME,
            port: LOCAL_HTTP_PORT
        }
    }
}