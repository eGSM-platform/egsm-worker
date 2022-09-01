var xml2js = require('xml2js');

var mqtt = require("./mqttconnector")
var LOG = require('../auxiliary/LogManager')
var egsm = require('../egsmengine/egsmengine')

module.id = "EVENTR"

let ENGINES = new Map(); //ENGINE_ID -> [DEFAULT_BROKER, onMessageReceived]
let SUBSCRIPTIONS = new Map(); //{HOST, PORT, TOPIC}-> [ENGINE_ID]
let ARTIFACTS = new Map() //ENGINE_ID -> [{ARTIFACT_NAME, BROKER, HOST, BINDING, UNBINDING}]
let STAKEHOLDERS = new Map() //Engine_ID -> [STAKEHOLDER_NAME, PROCESS_ID, BROKER, HOST]

function createSubscription(engineid, topic, hostname, port) {
    var key = [hostname, port, topic].join(":")

    //Add new topic to the map
    if (!SUBSCRIPTIONS.has(key)) {
        SUBSCRIPTIONS.set(key, [])
    }

    //Check if the engine is already subscribed to that topic
    if (SUBSCRIPTIONS.get(key).find(engineid)) {
        LOG.logWorker('WARNING', `Engine [${engineid}] is already subscribed to ${hostname}:${port} -> ${topic}`, module.id)
        return
    }

    //Perform subscription
    SUBSCRIPTIONS.get(key).push(engineid)
    mqtt.subscribeTopic(hostname, port, topic)
}

function deleteSubscription(engineid, topic, hostname, port) {
    var key = [hostname, port, topic].join(":")

    //Check if subscription exists
    if (!SUBSCRIPTIONS.has(key)) {
        LOG.logWorker('WARNING', `Engine [${engineid}] is not subscribed to ${hostname}:${port} -> ${topic}, cannot be unsubscribed`, module.id)
        return
    }

    //No engine is subscribed to the topic anymore
    if (SUBSCRIPTIONS.get(key).length() == 1) {
        mqtt.unsubscribeTopic(hostname, port, topic)
        SUBSCRIPTIONS.delete(key)
    }
    //Other engine(s) are still subscribed to the topic
    else {
        for (let i = 0; i < SUBSCRIPTIONS.get(key).length; i++) {
            if (SUBSCRIPTIONS.get(key)[i] == engineid) {
                SUBSCRIPTIONS.get(key).slice(i, 1)
                break
            }
        }
    }
}

module.exports = {
    setEngineDefaults(engineid, hostname, port, onMessageReceived) {
        LOG.logWorker('DEBUG', `setDefaultBroker called: ${engineid} -> ${hostname}:${port}`, module.id)
        ENGINES.set(engineid, { hostname, port, onMessageReceived })
    },



    initConnections: function (engineid, bindingfile, hostname, port) {
        var parseString = xml2js.parseString;
        parseString(bindingfile, function (err, result) {

            //Read Artifacts
            //Check if the engine id is defined in the map as a key
            if (!ARTIFACTS.has(engineid)) {
                ARTIFACTS.set(engineid, [])
            }

            //Iterate through artifacts and add them to the map
            var ra = bindingfile['martifact:definitions']['martifact:mapping'][0]['martifact:artifact'];
            for (var artifact in ra) {
                var br = [];
                for (var aid in ra[artifact]['martifact:bindingEvent']) {
                    br.push(ra[artifact]['martifact:bindingEvent'][aid]['$'].id);
                }
                var ur = [];
                for (var aid in ra[artifact]['martifact:unbindingEvent']) {
                    ur.push(ra[artifact]['martifact:unbindingEvent'][aid]['$'].id);
                }
                ARTIFACTS.get(engineid).push({
                    name: ra[artifact]['$'].name, bindingEvents: br,
                    unbindingEvents: ur, broker: ra[artifact]['$'].broker_host || undefined,
                    port: ra[artifact]['$'].port || undefined
                })
            }

            // Read Stakeholders
            //Check if the engine id is defined in the map as a key
            if (!STAKEHOLDERS.has(engineid)) {
                STAKEHOLDERS.set(engineid, [])
            }

            //Iterate through stakeholders and add them to the map
            var stakeHolders = bindingfile['martifact:definitions']['martifact:stakeholder'];
            for (var key in stakeHolders) {
                STAKEHOLDERS.get(engineid).push(stakeHolders)
                createSubscription(engineid,
                    stakeHolders[key]['$'].name + '/' + stakeHolders[key]['$'].processInstance,
                    stakeHolders[key]['$'].broker_host || ENGINES.get(engineid).hostname,
                    stakeHolders[key]['$'].port || ENGINES.get(engineid).port);
            }
        })
    },

    onMessageReceived: function (hostname, port, topic, message) {
        var key = [hostname, port, topic].join(":")
        if (!SUBSCRIPTIONS.has(key)) {
            LOG.logWorker('WARNING', `Message received without any subscriber [${hostname}:${port}] :: [${topic}] -> ${message}`, module.id)
            return;
        }

        //Check if the message is responsible for 
        //Forward message to the appropriate engine(s)
        SUBSCRIPTIONS.get(key).forEach(item => {
            ENGINES.get(item).onMessageReceived(hostname, port, topic, message)
        })
    },

    processPublish: function (engineid, data) {

    }
};




