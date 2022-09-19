// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');

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

var lastWriteArtifactEvent = {
    time: new Date().getTime(null),
    counter: 0
}

var lastwriteStageEvent = {
    time: new Date().getTime(null),
    counter: 0
}


function databaseInit() {
    //Artifact Definition Table
    var params = {
        AttributeDefinitions: [
            {
                AttributeName: 'Type',
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
            console.log("Table Created", data);
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
            console.log("Table Created", data);
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
            console.log("Table Created", data);
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
                AttributeName: 'TIME',
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
                AttributeName: 'TIME',
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
            console.log("Table Created", data);
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
                AttributeName: 'TIME',
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
                AttributeName: 'TIME',
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
            console.log("Table Created", data);
        }
    });

}

//Writes one item into a table, attributes arguments
//should be a list containing {name, data, type} elements
function writeItem(tablename, pk, sk, attr) {
    var item = {}
    item[pk.name] = { 'S': pk.value }
    item[sk.name] = { 'S': sk.value }
    for (var i in attr) {
        item[attr[i].name] = { 'S': attr[i].value }
    }

    var params = {
        TableName: tablename,
        Item: item
    }

    // Call DynamoDB to add the item to the table
    return DDB.putItem(params, function (err, data) {
        if (err) {
            console.log("Error", err);
        } else {
            console.log("Success", data);
        }
    });
}

async function readItem(tablename, pk, sk) {
    var key = {}
    key[pk.name] = { 'S': pk.value }
    key[sk.name] = { 'S': sk.value }
    var params = {
        TableName: tablename,
        Key: key
        //ProjectionExpression: 'STRING_VALUE'
    };

    // Call DynamoDB to read the item from the table
    return new Promise((resolve, reject) => {

        DDB.getItem(params, function (err, data) {
            if (err) {
                console.log("Error", err);
                reject(err)
            } else {
                console.log("Success", data.Item);
                resolve(data)
            }
        });
    });
}

function writeArtifactEvent(processName, artifactType, artifactId, artifactState) {
    var utcTimeStamp = new Date().getTime();
    var offset = ''
    if (lastWriteArtifactEvent.time == utcTimeStamp) {
        lastWriteArtifactEvent.counter += 1
        offset = toString(lastWriteArtifactEvent.counter)
    }
    else {
        lastWriteArtifactEvent.time = utcTimeStamp
        lastWriteArtifactEvent.counter = 0
    }

    var attributes = {
        'TIME': utcTimeStamp.toString() + offset,
        'PROCESS_NAME': processName,
        'ARTIFACT_TYPE': artifactType,
        'ARTIFACT_ID': artifactId,
        "STATE": artifactState
    }
    writeItem('ARTIFACT_EVENT', attributes)
}

function writeStageEvent(processName, stageName, stageDetails) {
    var utcTimeStamp = new Date().getTime();
    var offset = ''
    if (lastwriteStageEvent.time == utcTimeStamp) {
        lastwriteStageEvent.counter += 1
        offset = toString(lastwriteStageEvent.counter)
    }
    else {
        lastwriteStageEvent.time = utcTimeStamp
        lastwriteStageEvent.counter = 0
    }

    var attributes = {
        'TIME': utcTimeStamp.toString() + offset,
        'PROCESS_NAME': processName,
        'STAGE_NAME': stageName,
        'STAGE_DETAILS': stageDetails
    }
    writeItem('STAGE_EVENT', attributes)
}

function writeNewArtifactDefinition(artifactType, artifactId, stakeholders) {
    var attributes = {
        'TYPE': artifactType,
        'ID': artifactId,
        'STAKEHOLDERS': stakeholders,
        //Currently attached to
    }
    writeItem('ARTIFACT_DEFINITIONS', attributes)
}

function addArtifactAttachment(artifactType, artifactId, processName) {

}

function removeArtifactAttachment(artifactType, artifactId, processName) {

}


function writeNewProcessDefinition(processType, processID, stakeholders, groups, status) {
    var attributes = {
        'TYPE': processType,
        'ID': processID,
        'STAKEHOLDERS': stakeholders,
        'GROUPS': groups,
        'STATUS': status
    }
    writeItem('PROCESS_DEFINITIONS', attributes)
}

function updateProcessState(processType, processId, newState) {

}

//function updateProcessGroup(processType, processId, )
//databaseInit()
//writeItem('ARTIFACT_DEFINITION', [{ name: 'Type', type: 'S', data: 'asd' }, { name: 'ID', type: 'S', data: 'asd2' },{ name: 'ATTR1', type: 'S', data: 'data1' } ])

//writeItem('PROCESS_DEFINITION', {name: 'Type',value:'aassd'}, {name: 'ID',value:'idassd'}, [{ name: 'attr1', value: 'asdasd'} , { name: 'attr2', value: '00001'},
//{ name: 'attr3', value: 'stakeholder1' }])

readItem('PROCESS_DEFINITION',
    { name: 'Type', value: 'aassd', }, { name: 'ID', value: 'idassd' }
).then(function (data) {
    console.log("Success", data);
}).catch(err => {console.log('error:' + err)})