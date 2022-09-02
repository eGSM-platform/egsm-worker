var xml2js = require('xml2js');

var mqtt = require("./mqttconnector")
var LOG = require('../auxiliary/LogManager')

module.id = "EVENTR"

let ENGINES = new Map(); //ENGINE_ID -> [DEFAULT_BROKER, onMessageReceived]
let SUBSCRIPTIONS = new Map(); //{HOST, PORT, TOPIC}-> [ENGINE_ID]
let ARTIFACTS = new Map() //ENGINE_ID -> [{ARTIFACT_NAME, BROKER, HOST, BINDING, UNBINDING, ID}]
let STAKEHOLDERS = new Map() //Engine_ID -> [STAKEHOLDER_NAME, PROCESS_ID, BROKER, HOST]

//Subscribe an engine specified by its ID to a topic at a specified broker
function createSubscription(engineid, topic, hostname, port) {
    LOG.logWorker('DEBUG', `createSubscription function called for [${engineid}] to subscribe ${hostname}:${port} -> ${topic}`, module.id)
    var key = [hostname, port, topic].join(":")

    //Add new topic to the map
    if (!SUBSCRIPTIONS.has(key)) {
        SUBSCRIPTIONS.set(key, [])
    }
    else {
        //Check if the engine is already subscribed to that topic
        if (SUBSCRIPTIONS.has(key) && SUBSCRIPTIONS.get(key).indexOf(engineid) != -1) {
            LOG.logWorker('WARNING', `Engine [${engineid}] is already subscribed to ${hostname}:${port} -> ${topic}`, module.id)
            return
        }
    }

    //Perform subscription
    LOG.logWorker('DEBUG', `Performing subscription: [${engineid}] to ${hostname}:${port} -> ${topic}`, module.id)
    SUBSCRIPTIONS.get(key).push(engineid)
    mqtt.subscribeTopic(hostname, port, topic)
}

//Delete subscription of a specified engine
function deleteSubscription(engineid, topic, hostname, port) {
    LOG.logWorker('DEBUG', `deleteSubscription function called for [${engineid}] to unsubscribe ${hostname}:${port} -> ${topic}`, module.id)
    var key = [hostname, port, topic].join(":")

    //Check if subscription exists
    if (!SUBSCRIPTIONS.has(key)) {
        LOG.logWorker('WARNING', `Engine [${engineid}] is not subscribed to ${hostname}:${port} -> ${topic}, cannot be unsubscribed`, module.id)
        return
    }

    //No other engine is subscribed to the topic
    if (SUBSCRIPTIONS.get(key).length == 1) {
        LOG.logWorker('DEBUG', `No other engine subscribed to ${hostname}:${port} -> ${topic}. Performing system level unsubscription`, module.id)
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

function onMessageReceived(hostname, port, topic, message) {
    LOG.logWorker('DEBUG', `onMessageReceived called`, module.id)
    var key = [hostname, port, topic].join(":")
    if (!SUBSCRIPTIONS.has(key)) {
        LOG.logWorker('WARNING', `Message received without any subscriber [${hostname}:${port}] :: [${topic}] -> ${message}`, module.id)
        return;
    }

    var elements = topic.split('/')
    var subscribers = SUBSCRIPTIONS.get(key)
    var msgJson = JSON.parse(message.toString())

    for (var engine in subscribers) {
        var stakeholders = STAKEHOLDERS.get(subscribers[engine])
        var artifacts = ARTIFACTS.get(subscribers[engine])
        //Check if the event is from Stakeholder -> do binding/unbinding
        if (elements.length == 2) {
            //Iterate through the engine's skateholders and look for match
            //If a stakeholder found and it is verified that the message is coming from a stakeholder
            //then iterating through the artifacts and their binding and unbinding events
            //Performing subscribe and/or unsubscribe operations if any event match found
            for (var stakeholder in stakeholders) {
                if ((elements[0] == stakeholders[stakeholder].name) && (elements[1] == stakeholders[stakeholder].instance) && (hostname == stakeholders[stakeholder].host) && (port == stakeholders[stakeholder].port)) {
                    for (var artifact in artifacts) {
                        //Binding events
                        for (var bindigEvent in artifacts[artifact].bindingEvents) {
                            if (msgJson.event.payloadData.eventid == artifacts[artifact].bindingEvents[bindigEvent]) {
                                //Unsubscribing from old artifact topic if it exists
                                if (artifacts[artifact].id != '') {
                                    deleteSubscription(subscribers[engine],
                                        artifacts[artifact].name + '/' + artifacts[artifact].id + '/status',
                                        artifacts[artifact].host,
                                        artifacts[artifact].port)
                                }
                                artifacts[artifact].id = msgJson.event.payloadData.data || ''
                                if (artifacts[artifact].id != '') {
                                    createSubscription(subscribers[engine],
                                        artifacts[artifact].name + '/' + artifacts[artifact].id + '/status',
                                        artifacts[artifact].host,
                                        artifacts[artifact].port)
                                }
                            }
                        }
                        //Unbinding events
                        for (var unbindigEvent in artifacts[artifact].unbindingEvents) {
                            if (msgJson.event.payloadData.eventid == artifacts[artifact].unbindingEvents[unbindigEvent]) {
                                if (artifacts[artifact].id != '') {
                                    deleteSubscription(subscribers[engine],
                                        artifacts[artifact].name + '/' + artifacts[artifact].id + '/status',
                                        artifacts[artifact].host,
                                        artifacts[artifact].port)

                                    artifacts[artifact].id = ''
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
            ENGINES.get(subscribers[engine]).onMessageReceived(hostname, port, topic,
                { parameters: { name: (JSON.parse(message.toString())).event.payloadData.eventid, value: '' } })
        }
    }
}

mqtt.init(onMessageReceived)
module.exports = {
    //Set up default broker and onMessageReceived function for a specified engine
    setEngineDefaults(engineid, hostname, port, onMessageReceived) {
        LOG.logWorker('DEBUG', `setDefaultBroker called: ${engineid} -> ${hostname}:${port}`, module.id)
        ENGINES.set(engineid, { hostname: hostname, port: port, onMessageReceived: onMessageReceived })
    },

    //Init connections for a specified engine based on the provided binding file
    initConnections: function (engineid, bindingfile) {
        LOG.logWorker('DEBUG', `initConnections called for ${engineid}`, module.id)
        var parseString = xml2js.parseString;
        return parseString(bindingfile, function (err, result) {
            if (err) {
                LOG.logWorker('ERROR', `Error while parsing biding file for ${engineid}: ${err}`, module.id)
                return 'error'
            }
            //Read Artifacts
            //Check if the engine id is defined in the map as a key
            if (!ARTIFACTS.has(engineid)) {
                ARTIFACTS.set(engineid, [])
            }

            //Iterate through artifacts and add them to the map
            var ra = result['martifact:definitions']['martifact:mapping'][0]['martifact:artifact'];
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
                    unbindingEvents: ur, 
                    host: ra[artifact]['$'].broker_host || ENGINES.get(engineid).hostname,
                    port: ra[artifact]['$'].port || ENGINES.get(engineid).port,
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
            return 'ok'
        })
    },

    processPublish: function (engineid, data) {

    },

    onEngineStop: function (engineid) {

    }
};




