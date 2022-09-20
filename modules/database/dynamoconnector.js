// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
var LOG = require('../auxiliary/LogManager');

module.id = 'DDB'
SUPPRESS_NO_CONFIG_WARNING = 1

const accessKeyId = 'fakeMyKeyId';
const secretAccessKey = 'fakeSecretAccessKey';
// Create the DynamoDB service object
// Set the region 
AWS.config.update({
    region: "local",
    endpoint: "http://localhost:8000",
    accessKeyId,
    secretAccessKey,
});
var DDB = new AWS.DynamoDB({ apiVersion: '2012-08-10' });

var STAGE_EVENT_ID = new Map()
var ARTIFACT_EVENT_ID = new Map()


function databaseInit() {
    //Artifact Definition Table
    var params = {
        AttributeDefinitions: [
            {
                AttributeName: 'TYPE',
                AttributeType: 'S'
            },
            {
                AttributeName: 'ID',
                AttributeType: 'S'
            }/*,
            {
                AttributeName: 'STAKEHOLDERS',
                AttributeType: 'S'
            },
            {
                AttributeName: 'ATTACHED_TO',
                AttributeType: 'S'
            }*/
        ],
        KeySchema: [
            {
                AttributeName: 'TYPE',
                KeyType: 'HASH'
            },
            {
                AttributeName: 'ID',
                KeyType: 'RANGE'
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        },
        TableName: 'ARTIFACT_DEFINITION',
        StreamSpecification: {
            StreamEnabled: false
        }
    };

    // Call DynamoDB to create the table
    DDB.createTable(params, function (err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Table Created");
        }
    });

    //Process Definition Table
    params = {
        AttributeDefinitions: [
            {
                AttributeName: 'TYPE',
                AttributeType: 'S'
            },
            {
                AttributeName: 'ID',
                AttributeType: 'S'
            }/*,
            {
                AttributeName: 'STAKEHOLDERS',
                AttributeType: 'S'
            },
            {
                AttributeName: 'GROUPS',
                AttributeType: 'S'
            },
            {
                AttributeName: 'STATUS',
                AttributeType: 'S'
            }*/
        ],
        KeySchema: [
            {
                AttributeName: 'TYPE',
                KeyType: 'HASH'
            },
            {
                AttributeName: 'ID',
                KeyType: 'RANGE'
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        },
        TableName: 'PROCESS_DEFINITION',
        StreamSpecification: {
            StreamEnabled: false
        }
    };
    // Call DynamoDB to create the table
    DDB.createTable(params, function (err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Table Created");
        }
    });

    //Process Group Definition Table
    params = {
        AttributeDefinitions: [
            {
                AttributeName: 'NAME',
                AttributeType: 'S'
            }/*,
            {
                AttributeName: 'MEMBERS',
                AttributeType: 'S'
            }*/
        ],
        KeySchema: [
            {
                AttributeName: 'NAME',
                KeyType: 'HASH'
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        },
        TableName: 'PROCESS_GROUP_DEFINITION',
        StreamSpecification: {
            StreamEnabled: false
        }
    };
    // Call DynamoDB to create the table
    DDB.createTable(params, function (err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Table Created");
        }
    });

    //Artifact Event Table
    params = {
        AttributeDefinitions: [
            {
                AttributeName: 'PROCESS_NAME',
                AttributeType: 'S'
            },
            {
                AttributeName: 'EVENT_ID',
                AttributeType: 'S'
            }/*,
            {
                AttributeName: 'ARTIFACT_TYPE',
                AttributeType: 'S'
            },
            {
                AttributeName: 'ARTIFACT_ID',
                AttributeType: 'S'
            },
            ,
            {
                AttributeName: 'STATE',
                AttributeType: 'S'
            }*/
        ],
        KeySchema: [
            {
                AttributeName: 'PROCESS_NAME',
                KeyType: 'HASH'
            },
            {
                AttributeName: 'EVENT_ID',
                KeyType: 'RANGE'
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        },
        TableName: 'ARTIFACT_EVENT',
        StreamSpecification: {
            StreamEnabled: false
        }
    };
    // Call DynamoDB to create the table
    DDB.createTable(params, function (err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Table Created");
        }
    });

    //Stage Event Table
    params = {
        AttributeDefinitions: [
            {
                AttributeName: 'PROCESS_NAME',
                AttributeType: 'S'
            },
            {
                AttributeName: 'EVENT_ID',
                AttributeType: 'S'
            }/*,
            {
                AttributeName: 'STAGE_NAME',
                AttributeType: 'S'
            },
            {
                AttributeName: 'STAGE_DETAILS',
                AttributeType: 'S'
            }*/
        ],
        KeySchema: [
            {
                AttributeName: 'PROCESS_NAME',
                KeyType: 'HASH'
            },
            {
                AttributeName: 'EVENT_ID',
                KeyType: 'RANGE'
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        },
        TableName: 'STAGE_EVENT',
        StreamSpecification: {
            StreamEnabled: false
        }
    };
    // Call DynamoDB to create the table
    DDB.createTable(params, function (err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Table Created",);
        }
    });

}

//Writes one item into a table, attributes arguments
//should be a list containing {name, data, type} elements
function writeItem(tablename, pk, sk, attr) {
    if (!sk) {
        var sk = { value: '' }
    }
    LOG.logWorker('DEBUG', `DDB writing: [${tablename}] ->[${pk.value}]:[${sk.value} ]`, module.id)
    var item = {}
    item[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        item[sk.name] = { 'S': sk.value }
    }
    for (var i in attr) {
        //If the type is specified
        if (attr[i].type) {
            var buff = {}
            buff[attr[i].type] = attr[i].value
            item[attr[i].name] = buff
        }
        //Otherwise assuming string
        else {
            item[attr[i].name] = { 'S': attr[i].value }
        }
    }
    var params = {
        TableName: tablename,
        Item: item
    }

    // Call DynamoDB to add the item to the table
    DDB.putItem(params, function (err, data) {
        if (err) {
            LOG.logWorker('ERROR', `DDB writing to [${tablename}] ->[${pk.value}]:[${sk.value}] was not successfull`, module.id)
            console.log("Error", err);
        } else {
            LOG.logWorker('DEBUG', `DDB writing to [${tablename}] ->[${pk.value}]:[${sk.value}] finished`, module.id)
        }
    });
}

async function readItem(tablename, pk, sk, requestedfields) {
    if (!sk) {
        var sk = { value: '' }
    }
    LOG.logWorker('DEBUG', `DDB reading: [${tablename}] ->[${pk.value}]:[${sk.value}]`, module.id)
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }
    var params = {
        TableName: tablename,
        Key: key
    };
    if (requestedfields) {
        params['ProjectionExpression'] = requestedfields
    }


    // Call DynamoDB to read the item from the table
    return new Promise((resolve, reject) => {
        DDB.getItem(params, function (err, data) {
            if (err) {
                LOG.logWorker('ERROR', `DDB reading: [${tablename}] ->[${pk.value}]:[${sk.value}] was not successful`, module.id)
                reject(err)
            } else {
                LOG.logWorker('DEBUG', `[${tablename}] ->[${pk.value}]:[${sk.value}] data retrieved`, module.id)
                resolve(data)
            }
        });
    });
}

function updateItem(tablename, pk, sk, attr) {
    if (!sk) {
        var sk = { value: '' }
    }
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }
    var expressionattributenames = {}
    var expressionattributevalues = {}
    var updateexpression = 'SET '
    for (var i in attr) {
        if (i != 0) {
            updateexpression += ','
        }
        //If the type is specified
        expressionattributenames['#' + i.toString()] = attr[i].name
        if (attr[i].type) {
            var buff = {}
            buff[attr[i].type] = attr[i].value
            expressionattributevalues[':' + i.toString()] = buff
        }
        //Otherwise assuming string
        else {
            expressionattributevalues[':' + i.toString()] = { 'S': attr[i].value }
        }
        updateexpression += '#' + i.toString() + ' = ' + ':' + i.toString()
    }
    var params = {
        ExpressionAttributeNames: expressionattributenames,
        ExpressionAttributeValues: expressionattributevalues,
        Key: key,
        ReturnValues: "ALL_NEW",
        TableName: tablename,
        UpdateExpression: updateexpression//"SET #0 = :0"
    };
    DDB.updateItem(params, function (err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else console.log(data);           // successful response
    });
}

function deleteItem(tablename, pk, sk) {
    if (!sk) {
        var sk = { value: '' }
    }
    var key = {}
    key[pk.name] = { 'S': pk.value }
    if (sk && sk.value != '') {
        key[sk.name] = { 'S': sk.value }
    }
    var params = {
        TableName: tablename,
        Key: key
    };

    // Call DynamoDB to delete the item from the table
    DDB.deleteItem(params, function (err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Success", data);
        }
    });
}

//EVENT OPERATIONS
//ARTIFACT EVENTS
function writeArtifactEvent(processName, artifactType, artifactId, artifactState) {
    var eventid = ARTIFACT_EVENT_ID.get(processName)
    eventid += 1
    ARTIFACT_EVENT_ID.set(processName, eventid)
    
    var utcTimeStamp = new Date().getTime();

    var pk = { name: 'PROCESS_NAME', value: processName }
    var sk = { name: 'EVENT_ID', value: eventid }
    var attributes = []
    attributes.push({ name: 'TIME',type:'N', value: utcTimeStamp })
    attributes.push({ name: 'ARTIFACT_TYPE', value: artifactType })
    attributes.push({ name: 'ARTIFACT_ID', value: artifactId })
    attributes.push({ name: 'STATE', value: artifactState })

    writeItem('ARTIFACT_EVENT', pk, sk, attributes)
}

//STAGE EVENTS
function writeStageEvent(processName, stageName, stageDetails) {
    var eventid = STAGE_EVENT_ID.get(processName)
    eventid += 1
    STAGE_EVENT_ID.set(processName, eventid)
    
    var utcTimeStamp = new Date().getTime();
    var pk = { name: 'PROCESS_NAME', value: processName }
    var sk = { name: 'EVENT_ID', value: eventid.toString() }
    var attributes = []
    attributes.push({ name: 'TIME', type:'N', value: utcTimeStamp })
    attributes.push({ name: 'STAGE_DETAILS', value: stageDetails })
    writeItem('STAGE_EVENT', pk, sk, attributes)
}

//ARTIFACT DEFINITION OPERATIONS
//Stakeholders should be a list of Strings
function writeNewArtifactDefinition(artifactType, artifactId, stakeholders) {
    var pk = { name: 'TYPE', value: artifactType }
    var sk = { name: 'ID', value: artifactId }
    var attributes = []
    attributes.push({ name: 'STAKEHOLDERS', type: 'SS', value: stakeholders })
    attributes.push({ name: 'ATTACHED_TO', type: 'SS', value: ['ROOT'] })
    writeItem('ARTIFACT_DEFINITION', pk, sk, attributes)
}

//Should be called when an artifact is attached/detached from a process
function addArtifactAttachment(artifactType, artifactId, processName) {
    readItem('ARTIFACT_DEFINITION', { name: 'TYPE', value: artifactType, }, { name: 'ID', value: artifactId }, 'ATTACHED_TO')
        .then(function (data) {
            var processes = []
            if (data.Item.ATTACHED_TO) {
                console.log(data.Item.ATTACHED_TO.SS)
                if (data.Item.ATTACHED_TO.SS.includes(processName)) {
                    return
                }
                processes = [...data.Item.ATTACHED_TO.SS];
            }
            processes.push(processName)
            updateItem('ARTIFACT_DEFINITION',
                { name: 'TYPE', value: artifactType },
                { name: 'ID', value: artifactId },
                [{ name: 'ATTACHED_TO', type: 'SS', value: processes }])
        }).catch(err => { console.log('error:' + err) })
}

function removeArtifactAttachment(artifactType, artifactId, processName) {
    readItem('ARTIFACT_DEFINITION', { name: 'TYPE', value: artifactType, }, { name: 'ID', value: artifactId }, 'ATTACHED_TO')
        .then(function (data) {
            var processes = []
            if (!data.Item.ATTACHED_TO) {
                return
            }
            else {
                console.log(data.Item.ATTACHED_TO.SS)
                if (!data.Item.ATTACHED_TO.SS.includes(processName)) {
                    return
                }
                for (var i = 0; i < data.Item.ATTACHED_TO.SS.length; i++) {
                    if (data.Item.ATTACHED_TO.SS[i] === processName) {
                        data.Item.ATTACHED_TO.SS.splice(i, 1);
                    }
                }
                processes = [...data.Item.ATTACHED_TO.SS];
                updateItem('ARTIFACT_DEFINITION',
                    { name: 'TYPE', value: artifactType },
                    { name: 'ID', value: artifactId },
                    [{ name: 'ATTACHED_TO', type: 'SS', value: processes }])
            }
        }).catch(err => { console.log('error:' + err) })
}

function deleteArtifact(artifactType, artifactId) {
    throw new Error('Non-implemented function')
}

//PROCESS DEFINITION OPERATIONS
function writeNewProcessDefinition(processType, processID, stakeholders, groups, status) {
    var pk = { name: 'TYPE', value: processType }
    var sk = { name: 'ID', value: processID }
    if (groups.length == 0) {
        groups.push('ROOT')
    }
    var attributes = []
    attributes.push({ name: 'STAKEHOLDERS', type: 'SS', value: stakeholders })
    attributes.push({ name: 'GROUPS', type: 'SS', value: groups })
    attributes.push({ name: 'STATUS', type: 'S', value: status })
    writeItem('PROCESS_DEFINITION', pk, sk, attributes)
}

function updateProcessState(processType, processId, newState) {
    updateItem('PROCESS_DEFINITION',
        { name: 'TYPE', value: processType },
        { name: 'ID', value: processId },
        [{ name: 'STATUS', type: 'S', value: newState }])
}

//PROCESS_GROUP_DEFINITION Table operations
function writeNewProcessGroup(groupname) {
    var pk = { name: 'NAME', value: groupname }
    var attributes = []
    attributes.push({ name: 'PROCESSES', type: 'SS', value: ['ROOT'] })
    writeItem('PROCESS_GROUP_DEFINITION', pk, undefined, attributes)
}

function addProcessToProcessGroup(groupname, processName) {
    readItem('PROCESS_GROUP_DEFINITION', { name: 'NAME', value: groupname })
        .then(function (data) {
            var processes = []
            if (data.Item.PROCESSES) {
                console.log(data.Item.PROCESSES.SS)
                if (data.Item.PROCESSES.SS.includes(processName)) {
                    return
                }
                processes = [...data.Item.PROCESSES.SS];
            }
            processes.push(processName)
            updateItem('PROCESS_GROUP_DEFINITION',
                { name: 'NAME', value: groupname },
                undefined,
                [{ name: 'PROCESSES', type: 'SS', value: processes }])
        }).catch(err => { console.log('error:' + err) })
}

function removeProcessFromProcessGroup(groupname, processName) {
    readItem('PROCESS_GROUP_DEFINITION', { name: 'NAME', value: groupname })
        .then(function (data) {
            var processes = []
            if (!data.Item.PROCESSES) {
                return
            }
            else {
                console.log(data.Item.PROCESSES.SS)
                if (!data.Item.PROCESSES.SS.includes(processName)) {
                    return
                }
                for (var i = 0; i < data.Item.PROCESSES.SS.length; i++) {
                    if (data.Item.PROCESSES.SS[i] === processName) {
                        data.Item.PROCESSES.SS.splice(i, 1);
                    }
                }
                processes = [...data.Item.PROCESSES.SS];
                updateItem('PROCESS_GROUP_DEFINITION',
                    { name: 'NAME', value: groupname },
                    undefined,
                    [{ name: 'PROCESSES', type: 'SS', value: processes }])
            }
        }).catch(err => { console.log('error:' + err) })
}

//writeNewProcessGroup('group001')
//addProcessToProcessGroup('group001', 'process002')
//removeProcessFromProcessGroup('group001', 'process001')
//writeNewArtifactDefinition('truck','asd111',['good company'])
readItem('ARTIFACT_DEFINITION', { name: 'TYPE', value: 'truck', }, { name: 'ID', value: 'asd111' })
    .then(function (data) {
        console.log(data.Item)
    }).catch(err => { console.log('error:' + err) })

//deleteItem('ARTIFACT_DEFINITION', { name: 'TYPE', value: 'truck', }, { name: 'ID', value: 'asd111', })


/*var params = { 
    TableName : 'ARTIFACT_DEFINITION'
};


DDB.deleteTable(params, function(err, data) {
    if (err) {
        console.error("Unable to delete table. Error JSON:", JSON.stringify(err, null, 2));
    } else {
        console.log("Deleted table. Table description JSON:", JSON.stringify(data, null, 2));
    }
});*/