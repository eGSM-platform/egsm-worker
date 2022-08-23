var mqtt = require("mqtt")

var egsm = require('../egsmengine/egsmengine')
var aux = require('../auxiliary/auxiliary')

function MqttBroker(hostname, port, userName, userPassword, clientId) {
    return {
        opts: { host: hostname, port: port, username: userName, password: userPassword, keepalive: 30, clientId: clientId },
        mqttclient: mqtt.connect(this.opts)
            .on('connect', function () {
                console.log('MQTT client connected');
            })
            .on('disconnect', function () {
                console.log('MQTT client disconnected');
            })
            .on('reconnect', function () {
                console.log('MQTT client reconnected');
            })
            .on('error', function (error) {
                console.log('MQTT client error' + error);
            })
            .on('message', function (topic, message) {
                console.log("Message received: " + topic + "||" + message)
                var subscribers = getSubscribers(hostname, port, topic)
                subscribers.forEach((item, index, arr) => {
                    egsm.notifyEngine(item, topic, message, hostname, port)
                })
            })
    }
}

let BROKERS = new Map(); // {IP, PORT} -> BROKER_DETAILS
let SUBSCRIPTIONS = new Map(); //ENGINE_ID -> [{IP, PORT, TOPIC}]
let ENGINES = new Map(); //ENGINE_ID -> BROKER_KEY 

function getSubscribers(hostname, port, topic) {
    var result = []
    SUBSCRIPTIONS.forEach((value, key) => {
        value.forEach((item, index, arr) => {
            if (JSON.stringify(item) === JSON.stringify({ hostname, port, topic })) {
                result.push(key)
            }
        })
    });
    return result
}

module.exports = {
    createConnection: function (hostname, port, username, userpassword, clientid) {
        if (!BROKERS.has([hostname, port].join(":"))) {
            BROKERS.set([hostname, port].join(":"), new MqttBroker(hostname, port, username, userpassword, clientid))
        }
        return true
    },

    closeConnection: function (hostname, port) {
        if (BROKERS.has([hostname, port].join(":"))) {
            BROKERS.get([hostname, port].join(":")).mqttclient.end()
            BROKERS.delete([hostname, port].join(":"))
            console.log('Connection closed: ' + hostname + ':' + port)
        }
    },

    setDefaultBroker(engineid, hostname, port) {
        ENGINES.set(engineid, { hostname, port })
    },

    subscribe: function (engineid, topic, hostname, port) {
        if (!SUBSCRIPTIONS.has(engineid)) {
            SUBSCRIPTIONS.set(engineid, []);
        }
        var hostname = hostname || ENGINES.get(engineid).hostname
        var port = port || ENGINES.get(engineid).port

        var subscriptionExists = false;
        SUBSCRIPTIONS.get(engineid).forEach((item, index, arr) => {
            if (JSON.stringify(item) === JSON.stringify({ hostname, port, topic })) {
                subscriptionExists = true;
            }
        })
        if (!subscriptionExists) {
            SUBSCRIPTIONS.get(engineid).push({ hostname, port, topic })
            BROKERS.get([hostname, port].join(":")).mqttclient.subscribe(topic);
        }
    },

    publish: function (engineid, topic, jsonmessage, hostname, port) {
        var hostname = hostname || ENGINES.get(engineid).hostname
        var port = port || ENGINES.get(engineid).port

        //Notify subscribed local Engine instances
        var subscribers = getSubscribers(hostname, port, topic)
        subscribers.forEach((item, index, arr) => {
            egsm.notifyEngine(item, topic, jsonmessage, hostname, port)
        })

        //Publish to broker
        BROKERS.get([hostname, port].join(":")).mqttclient.publish(topic, jsonmessage);
    },

    unsubscribe: function (engineid, topic, hostname, port) {
        var subscriptionIndex = -1
        if (SUBSCRIPTIONS.has(engineid)) {
            SUBSCRIPTIONS.get(engineid).forEach((item, index, arr) => {
                if (JSON.stringify(item) === JSON.stringify({ hostname, port, topic })) {
                    subscriptionIndex = index;
                }
            })
        }
        if (subscriptionIndex >= 0) {
            SUBSCRIPTIONS.get(engineid).splice(subscriptionIndex, 1)
            if (getSubscribers(hostname, port, topic).length > 0) {
                BROKERS.get([hostname, port].join(":")).mqttclient.unsubscribe(topic)
            }
        }
    }
};


//module.exports.createConnection("localhost", 1883, "admin", "password", "client1")
//module.exports.setDefaultBroker("engine1", "localhost", 1883)
//module.exports.setDefaultBroker("engine2", "localhost", 1883)
//
//module.exports.subscribe('engine1', 'topic1', 'localhost', 1883)
//module.exports.unsubscribe('engine1', 'topic1', 'localhost', 1883)
//module.exports.closeConnection('localhost', 1883)
//module.exports.subscribe('engine1','topic2','localhost',1883)
//module.exports.subscribe('engine2','topic1','localhost',1883)
//module.exports.subscribe('engine2','topic2','localhost',1883)



//console.log(BROKERS)
//console.log(BROKERS.get({"localhost", 1883}))
//console.log(SUBSCRIPTIONS)
//console.log(BROKERS)
/*console.log(ENGINES)
console.log("Event router is running")
module.exports.subscribe("emgine1", "topic", "localhost", 1883)
module.exports.subscribe("emgine2", "topic", "localhost", 1883)
module.exports.subscribe("emgine1", "topic555")
console.log(SUBSCRIPTIONS)
console.log(BROKERS)
console.log(getSubscribers("localhost", 1883, "topic"))

console.log(SUBSCRIPTIONS)
module.exports.unsubscribe('emgine1', 'topic', 'localhost', 1883)
console.log(getSubscribers("localhost", 1883, "topic"))
console.log(SUBSCRIPTIONS)

egsm.notifyEngine("engine1", 'topic1', "message1",'localhost',1883)
*/

//BROKERS.forEach(e => {
//    e.connect()
//});






/*if (process.send) {
    process.send("Hello");
  }
  
  process.on('message', message => {
    console.log('message from parent:', message);
  });*/
