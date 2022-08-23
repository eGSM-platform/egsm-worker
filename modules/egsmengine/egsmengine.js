var mqtt = require("mqtt")

function Engine(id) {
    return {
        id: id,
        notifyEngine(topic, message, hostname, port) {
            console.log("["+ id+ "] Message received: " + topic + " -> " + message);
        }
    }
}

var ENGINES = new Map()
ENGINES.set("engine1", new Engine(1))
ENGINES.set("engine2", new Engine(2))

var opts = { host: 'localhost', port: 1883, username: 'admin', password: 'password', keepalive: 30, clientId: 'client1' }
var mqttclient = mqtt.connect(this.opts)
mqttclient.publish('topic1', 'messagesssss')

module.exports = {
    createNewEngine: function(engineid){
        ENGINES.set(engineid, new Engine(engineid))
        console.log("New Engine created")
    },

    notifyEngine: function (engineid, topic, message, hostname, port) {
        ENGINES.get(engineid).notifyEngine(topic, message, hostname, port)
    }

}