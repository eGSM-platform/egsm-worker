var xml2js = require('xml2js');

var mqtt = require("./mqttconnector")
var LOG = require('../auxiliary/LogManager')
var egsm = require('../egsmengine/egsmengine');
const { unsubscribeTopic, subscribeTopic } = require('./mqttconnector');

module.id = "EVENTR"

let ENGINES = new Map(); //ENGINE_ID -> [DEFAULT_BROKER, onMessageReceived]
let SUBSCRIPTIONS = new Map(); //{HOST, PORT, TOPIC}-> [ENGINE_ID]
let ARTIFACTS = new Map() //ENGINE_ID -> [{ARTIFACT_NAME, BROKER, HOST, BINDING, UNBINDING, ID}]
let STAKEHOLDERS = new Map() //Engine_ID -> [STAKEHOLDER_NAME, PROCESS_ID, BROKER, HOST]

function createSubscription(engineid, topic, hostname, port) {
    var key = [hostname, port, topic].join(":")

    //Add new topic to the map
    if (!SUBSCRIPTIONS.has(key)) {
        SUBSCRIPTIONS.set(key, [])
    }

    //Check if the engine is already subscribed to that topic
//var asd = []
//asd.indexOf
    if (SUBSCRIPTIONS.has(key) && SUBSCRIPTIONS.get(key).indexOf(engineid) != -1) {
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
        ENGINES.set(engineid, { hostname: hostname, port: port, onMessageReceived: onMessageReceived })
    },

    initConnections: function (engineid, bindingfile) {
        var parseString = xml2js.parseString;
        parseString(bindingfile, function (err, result) {

            if (err) {
                console.log('Error while parsing biding file...')
            }
            //Read Artifacts
            //Check if the engine id is defined in the map as a key
            if (!ARTIFACTS.has(engineid)) {
                ARTIFACTS.set(engineid, [])
            }

            //Iterate through artifacts and add them to the map
            var ra = result['martifact:definitions']['martifact:remoteArtifact'];
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
                    port: ra[artifact]['$'].port || undefined,
                    id: ''
                })
            }

            // Read Stakeholders
            //Check if the engine id is defined in the map as a key
            if (!STAKEHOLDERS.has(engineid)) {
                STAKEHOLDERS.set(engineid, [])
            }

            //Iterate through stakeholders and add them to the map
            var stakeHolders = result['martifact:definitions']['martifact:stakeholder'];
            for (var key in stakeHolders) {
                STAKEHOLDERS.get(engineid).push({
                    name: stakeHolders[key]['$'].name,
                    instance: stakeHolders[key]['$'].processInstance,
                    host: stakeHolders[key]['$'].broker_host || ENGINES.get(engineid).hostname,
                    port: stakeHolders[key]['$'].port || ENGINES.get(engineid).port
                })
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

        var elements = topic.split('/')
        var subscribers = SUBSCRIPTIONS.get(key)
        var msgJson = JSON.parse(message.toString())

        for (var engine in subscribers) {
            var stakeholders = STAKEHOLDERS.get(engine)
            var artifacts = ARTIFACTS.get(engine)
            //Check if the event is from Stakeholder -> do binding/unbinding
            if (elements.length == 2) {
                //Iterate through the engine's skateholders and look for match
                //If a stakeholder found and it is verified that the message is coming from a stakeholder
                //then iterating through the artifacts and their binding and unbinding events
                //Performing subscribe and/or unsubscribe operations if any event match found
                for (var stakeholder in stakeholders) {
                    if (elements[0] == stakeholder.name && elements[1] == stakeholder.instance && hostname == stakeholder.host, port == stakeholder.port) {
                        for (var artifact in artifacts) {
                            //Binding events
                            for (var bindigEvent in artifact.bindingEvents) {
                                if (msgJson.event.payloadData.eventid == bindigEvent) {
                                    //Unsubscribing from old artifact topic if it exists
                                    if (artifact.id != '') {
                                        deleteSubscription(engine, artifact.name + '/' + artifact.id + '/status', hostname, port)
                                    }
                                    artifact.id = msgJson.event.payloadData.data
                                    if (artifact.id != '') {
                                        subscribeTopic(engine, port, artifact.name + '/' + artifact.id + '/status')
                                    }
                                }
                            }
                            //Unbinding events
                            for (var unbindigEvent in artifact.unbindingEvents) {
                                if (msgJson.event.payloadData.eventid == unbindigEvent) {
                                    if (artifact.id != '') {
                                        deleteSubscription(engine, artifact.name + '/' + artifact.id + '/status', hostname, port,)
                                        artifact.id = ''
                                    }
                                }
                            }
                        }
                    }
                }
            }
            //Check if the event is from Artifact and forward it to the engine
            else if (elements.length == 3 && elements[2] == 'status') {
                //Forward message to the engine
                ENGINES.get(engine).onMessageReceived(hostname, port, topic,
                    { parameters: { name: (JSON.parse(message.toString())).event.payloadData.eventid, value: '' } })
            }
        }
    },

    processPublish: function (engineid, data) {

    }
};




