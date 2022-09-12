var xml2js = require('xml2js');
var EventManager = require('../auxiliary/EventManager');
var LogManager = require("../auxiliary/LogManager")
var fs = require('fs');

// attribute model
var ATTRIBUTE = {
    // initialize instance
    init: function (name, parent, type, use) {
        this.name = name;
        this.parent = parent;
        this.type = type;
        this.use = use;
        this._learningValues = [];
        this.timestamp = Date.now();

        //TODO: handle attribute 'timestamp', which is different from 'this.timestamp'
        if (name == 'timestamp' && type == 'xs:dateTime') {
            this.value = Date.now();
        }
        else {
            this.value = '';
        }
    },
    // change attribute value
    changeValue: function (newValue) {
        LogManager.logModelAttribute(this.name, this.parent, this.value, newValue);
        if (this.value != newValue) {
            this.value = newValue;
            this.timestamp = Date.now();
        }
    }
};

// information model
var INFORMATION = {
    // initialize instance
    init: function (name, pub, sub) {
        this.name = name;
        this.pub = pub;
        this.sub = sub;
        this._attributes = [];
        this._array_dep = [];
    },
    // change attributes
    changeAttributes: function (engine, newAttributes) {
        LogManager.logModelInfo(this.name);
        var changedValue = false;
        var changedStatus = false;
        var newValue;
        for (var key in newAttributes) {
            var attr = this._attributes[newAttributes[key].name];
            if (attr != undefined) {
                // attribute found
                if (attr.value != newAttributes[key].value) {
                    changedValue = true;
                    // update value if different from current one, and emit 'name_l' and 'name_e' events
                    attr.changeValue(newAttributes[key].value);
                    if (attr.name == 'status') {
                        changedStatus = true;
                        newValue = newAttributes[key].value;
                    }
                }
            }
        }

        //TODO: revise if XML or XSD file structure changes
        //events 'name_l' and 'name_e' are emitted only if 'status' attribute is present in event payload, otherwise only event 'name' is emitted.
        if (changedValue && changedStatus) {
            if (engine.Event_array[this.name + '_l'] != undefined && engine.Event_array[this.name + '_e'] != undefined) {
                LogManager.logTrace('changedInfo_status', this.name, 'INFO', 'attributes', '0', newValue);
                //emit events 'name_l' e 'name_e'
                engine.Event_array[this.name + '_l'].emitEvent(engine);
                engine.Event_array[this.name + '_e'].emitEvent(engine);

                //handle process flow guard dependencies
                for (var item in this._array_dep) {
                    if (engine.Data_array[this._array_dep[item]].type == 'P') {
                        engine.Data_array[this._array_dep[item]].update(engine, false);
                    }
                }
            }
        }
        else if (!changedValue && !changedStatus) {
            //emit event 'name'
            if (engine.Event_array[this.name] != undefined) {
                LogManager.logTrace('changedInfo_event', this.name, 'INFO', 'attributes', '0', '0');
                engine.Event_array[this.name].emitEvent(engine);
            }
        }
    }
};

// event model
var EVENTO = {
    // initialize instance
    init: function (name) {
        this.name = name;
        //event status: if true then emit event and re-evaluate model
        this.value = false;
        this._array_dep = [];
        this.timestamp = Date.now();
    },
    // emit event
    emitEvent: function (engine) {
        //true -> event was received
        this.setActive();
        engine.EventAdministrator.emit(this.name, engine.Event_array[this.name]._array_dep);
        this.setUnactive();
        //false -> event was handled (so to disable guard after evaluating sentry)
        engine.EventAdministrator.emit(this.name, engine.Event_array[this.name]._array_dep);
    },
    // activate event status (when event is received)
    setActive: function () {
        this.timestamp = Date.now();
        this.value = true;
        LogManager.logModelEvent(this.name, this.value);
    },
    // deactivate event status (when event is handled)
    setUnactive: function () {
        this.timestamp = Date.now();
        this.value = false;
        LogManager.logModelEvent(this.name, this.value);
    }
};

//data model (data flow guards, process flow guards, fault loggers e milestones)
var DATA = {
    //initialize instance
    init: function (name, stage, sentry, type) {
        this.name = name;
        this.value = false;
        this.stage = stage;
        this.sentry = sentry;
        this.type = type;
        this._array_dep = [];
        this.timestamp = Date.now();
        //Check
        if (sentry == undefined) { sentry = 'false'; }
    },
    //evaluate sentry (invoked by the engine when a dependency between the sentry and an element that changed is detected)
    update: function (engine, invalidator) {
        var oldValue = this.value;
        var newValue = this.value;

        LogManager.logModelData(this.name, this.type, this.stage, 'UPDATE START', this.value, this.sentry);

        //evaluate sentry
        if (this.type == 'D') //Data flow guard
        {
            newValue = engine.eval(this.sentry);
        }
        else if (this.type == 'P') //Process flow guard
        {
            newValue = engine.eval(this.sentry);
        }
        else if (this.type == 'M') //Milestone
        {
            //milestone is evaluated only when the stage is open
            if (engine.Stage_array[this.stage].state == 'opened') {
                newValue = engine.eval(this.sentry);
            }
            else if (invalidator == true) {
                //invalidate milestone
                newValue = false;
            }
        }
        else if (this.type == 'F') //Fault logger
        {
            //fault logger is evaluated only if the stage is open and its value is 'false'
            if (engine.Stage_array[this.stage].state == 'opened' && this.value == false) {
                newValue = engine.eval(this.sentry);
            }
        }

        //check if value has changed after evaluating sentry
        if (oldValue != newValue) {
            this.value = newValue;
            this.timestamp = Date.now();
            LogManager.logModelData(this.name, this.type, this.stage, 'UPDATE END | CHANGED', this.value, this.sentry);
            if (this.type != 'P') {
                //TODO check if exclusion of process flow guards is correct
                var dep = [this.stage];
                if (this._array_dep.length > 0)
                    Array.prototype.push.apply(dep, this._array_dep);
                engine.EventAdministrator.emit(this.name, dep);
            }
        }
        else {
            LogManager.logModelData(this.name, this.type, this.stage, 'UPDATE END | UNCHANGED', this.value, this.sentry);
        }
    }
};

//stage model
var STAGE = {
    init: function (name, parent, rank) {
        this.name = name;
        this.status = 'regular'; //possible values: 'regular', 'faulty'
        this.state = 'unopened'; //possible values 'unopened', 'opened', 'closed'
        this.compliance = 'onTime'; //possible values: 'onTime', 'outOfOrder', 'skipped'
        this.parent = parent;
        this.rank = rank;
        this.timestamp = Date.now();
        this._array_dep = [];
        this._dataGuards = [];
        this._processGuards = [];
        this._milestones = [];
        this._faults = [];
        this._childs = [];
        this._history = [];
    },

    // reset model
    reset: function (engine, resetStage) {
        LogManager.logTrace('reset', this.name, 'STAGE', this.status, this.state, this.compliance);
        if (resetStage) {
            this.changeState('unopened');
            this.changeStatus('regular');
            this.changeCompliance('onTime');
        }
        //recursively reset all child stages
        for (var ch in this._childs) {
            engine.Stage_array[this._childs[ch]].reset(true);
        }
        //invalidate all milestones for current stage
        for (var mile in engine.Data_array) {
            if (engine.Data_array[mile].stage == this.name && engine.Data_array[mile].type == 'M') {
                console.log('Invalidazione --> ' + mile);
                engine.Data_array[mile].update(engine, true);
            }
        }
        //re-compute all process flow guards for current stage
        for (var proc in engine.Data_array) {
            if (engine.Data_array[proc].stage == this.name && engine.Data_array[proc].type == 'P') {
                console.log('Reset process guards --> ' + proc);
                engine.Data_array[proc].update(engine, true);
            }
        }
    },
    changeState: function (newState) {
        LogManager.logModelStage('changeState', this.name, 'state', this.state, newState);
        LogManager.logTrace('changedState', this.name, 'STAGE', 'state', this.state, newState);
        var oldState = this.state;
        this.state = newState;
        this.timestamp = Date.now();
        var rev = {};
        rev.timestamp = this.timestamp;
        rev.oldValue = oldState;
        rev.newValue = newState;
        this._history.push(rev);
        //reset stage if re-opened
        if (oldState == 'closed' && (newState == 'opened' || newState == 'unopened')) {
            this.reset(false);
        }
    },
    changeCompliance: function (newCompliance) {
        LogManager.logModelStage('changeCompliance', this.name, 'compliance', this.compliance, newCompliance);
        LogManager.logTrace('changedCompliance', this.name, 'STAGE', 'compliance', this.compliance, newCompliance);
        var oldCompliance = this.compliance;
        this.compliance = newCompliance;
        this.timestamp = Date.now();
        var rev = {};
        rev.timestamp = this.timestamp;
        rev.oldValue = oldCompliance;
        rev.newValue = newCompliance;
        this._history.push(rev);
    },
    changeStatus: function (newStatus) {
        LogManager.logModelStage('changeStatus', this.name, 'status', this.status, newStatus);
        LogManager.logTrace('changedStatus', this.name, 'STAGE', 'status', this.status, newStatus);
        var oldStatus = this.status;
        this.status = newStatus;
        this.timestamp = Date.now();
        var rev = {};
        rev.timestamp = this.timestamp;
        rev.oldValue = oldStatus;
        rev.newValue = newStatus;
        this._history.push(rev);
    },
    //verify if a stage should be opened (if it should transition from 'Unopened' to 'Opened')
    checkUnopenedToOpened: function (engine) {
        //parent stage must be opened (or undefined -> no parent exists)
        var checkParent = false;
        if (engine.Stage_array[this.parent] != undefined && engine.Stage_array[this.parent].state == 'opened') {
            checkParent = true;
        }
        else if (engine.Stage_array[this.parent] == undefined) {
            checkParent = true;
        }
        LogManager.logModelStage('checkUnopenedToOpened', this.name, 'PARENT', this.parent, checkParent);

        //at least one data flow guard must be active
        var checkData = false;
        for (var i = 0; i < this._dataGuards.length; i++) {
            LogManager.logModelStage('checkUnopenedToOpened', this.name, 'DATA FLOW GUARD', this._dataGuards[i], engine.Data_array[this._dataGuards[i]].value);
            checkData = checkData || engine.Data_array[this._dataGuards[i]].value;
        }

        //return the result
        return checkData && checkParent;
    },
    //verify if a stage should become out of order (if it should transition from 'OnTime' to 'OutOfOrder')
    checkOnTimeOutOfOrder: function (engine) {
        //check process flow guards (if at least one is active, then the transition must NOT fire)
        var checkProcess = false;
        if (this._processGuards.length == 0) {
            LogManager.logModelStage('checkOnTimeOutOfOrder', this.name, 'NO PROCESS FLOW GUARDS', '-1', checkProcess);
            checkProcess = true;
        }
        for (var i = 0; i < this._processGuards.length; i++) {
            LogManager.logModelStage('checkOnTimeOutOfOrder', this.name, 'PROCESS FLOW GUARD', this._processGuards[i], engine.Data_array[this._processGuards[i]].value);
            checkProcess = checkProcess || engine.Data_array[this._processGuards[i]].value;
        }

        return !checkProcess;
    },
    //verify if a stage should become faulty (if it should transition from 'Regular' to 'Faulty')
    checkRegularToFaulty: function (engine) {
        var checkFault = false;
        for (var i = 0; i < this._faults.length; i++) {
            LogManager.logModelStage('checkRegularToFaulty', this.name, 'FAULT LOGGER', this._faults[i], engine.Data_array[this._faults[i]].value);
            checkFault = checkFault || engine.Data_array[this._faults[i]].value;
        }
        return checkFault;
    },
    //verify if a stage should be closed (if it should transition from 'Opened' to 'Closed')
    checkOpenedToClosed: function (engine) {
        //verify if parent stage is closed (if so then current stage should be closed too)
        var checkParent = false;
        if (engine.Stage_array[this.parent] != undefined && engine.Stage_array[this.parent].state == 'closed') {
            checkParent = true;
        }
        LogManager.logModelStage('checkOpenedToClosed', this.name, 'PARENT', this.parent, checkParent);

        //at least one milestone for current stage is fulfilled
        var checkMilestone = false;
        for (var i = 0; i < this._milestones.length; i++) {
            LogManager.logModelStage('checkOpenedToClosed', this.name, 'MILESTONE', this._milestones[i], engine.Data_array[this._milestones[i]].value);
            checkMilestone = checkMilestone || engine.Data_array[this._milestones[i]].value;
        }

        return checkMilestone || checkParent;
    },
    //verify if a stage should be re-opened (if it should transition from 'Closed' to 'Opened')
    checkClosedToOpened: function (engine) {
        //parent stage must be opened (or undefined -> no parent exists)
        var checkParent = false;
        if (engine.Stage_array[this.parent] != undefined && engine.Stage_array[this.parent].state == 'opened') {
            checkParent = true;
        }
        else if (engine.Stage_array[this.parent] == undefined) {
            checkParent = true;
        }
        LogManager.logModelStage('checkClosedToOpened', this.name, 'PARENT', this.parent, checkParent);

        //at least one data flow guard must be active
        var checkData = false;
        for (var i = 0; i < this._dataGuards.length; i++) {
            LogManager.logModelStage('checkClosedToOpened', this.name, 'DATA FLOW GUARD', this._dataGuards[i], engine.Data_array[this._dataGuards[i]].value);
            checkData = checkData || engine.Data_array[this._dataGuards[i]].value;
        }

        //TODO, change with milestone invalidation logic (TBD)
        // var checkInvalidator = false;
        // for(var i = 0; i < this._dataGuards.length; i++)
        // {
        //   console.log('update STAGE - ' + this.name + ' - check data ' + this._dataGuards[i] +' value --> ' + Data_array[this._dataGuards[i]].value);
        //   checkData = checkData || Data_array[this._dataGuards[i]].value;
        // }

        return checkData && checkParent;
    },
    //verify which stages should be marked as skipped (if current stage is open and 'OutOfOrder', determine which stages should transition from 'Regular' to 'Skipped')
    setUnopenedOnTimeRegularToSkipped: function (engine) {
        //check all stages in the model
        for (var s in engine.Stage_array) {
            //select only stages that differ from current one with 'UnOpened' status, and 'OnTime' and 'Regular' compliance
            var stage = engine.Stage_array[s];
            if (stage.name != this.name && stage.state == 'unopened' && stage.compliance == 'onTime' && stage.status == 'regular') {
                //check all process flow guards for current stage
                for (var p in this._processGuards) {
                    //check if the sentry for current stage contains 'GSM.isStageActive(stage)': if so, then stage 'stage' must be 'skipped'
                    if (engine.Data_array[this._processGuards[p]].sentry.indexOf("GSM.isStageActive(\"" + stage.name + "\")") > -1) {
                        stage.changeCompliance('skipped');
                        LogManager.logModelStage('setUnopenedOnTimeRegularToSkipped', this.name, 'PROCESS FLOW GUARD', this._processGuards[p], stage.name);
                    }
                    else {
                        //check if the sentry for current stage contains 'isMilestoneAchieved(m)', and if m belongs to 'stage': if so, then stage 'stage' must be 'skipped'
                        for (var m in stage._milestones) {
                            //TODO, search for the whole PAC rule (currently only the presence of m in the sentry is checked)
                            if (stage._milestones[m] != null && engine.Data_array[this._processGuards[p]].sentry.indexOf(stage._milestones[m]) > -1) {
                                stage.changeCompliance('skipped');
                                LogManager.logModelStage('setUnopenedOnTimeRegularToSkipped', this.name, 'MILESTONE', stage._milestones[m], stage.name);
                            }
                        }
                    }
                }
            }
        }
    },
    //update the lifecycle of the stage (called by the engine when a dependency between the current stage and another elment that changed is detected)
    update: function (engine) {
        var oldState = this.state;
        var newState = this.state;
        LogManager.logModelStage('update', this.name, this.state, this.compliance, this.status);
        //if stage is unopened
        if (this.state == 'unopened') {
            //determine if it should be opened
            if (this.checkUnopenedToOpened(engine)) {
                //open stage
                this.changeState('opened');
                //check compliance (execution order)
                if (this.compliance == 'onTime' && this.checkOnTimeOutOfOrder(engine)) {
                    //incorrect execution order
                    this.changeCompliance('outOfOrder');
                    //find if there were stages that were skipped
                    this.setUnopenedOnTimeRegularToSkipped(engine);
                }
                else if (this.compliance == 'skipped') {
                    //if the stage was 'skipped', then it will always be 'outOfOrder'
                    this.changeCompliance('outOfOrder');
                    this.setUnopenedOnTimeRegularToSkipped(engine);
                }
            }
        }
        //if stage is opened
        else if (this.state == 'opened') {
            //check if it has become faulty
            if (this.status == 'regular' && this.checkRegularToFaulty()) {
                this.changeStatus('faulty');
            }
            //check if it must be closed
            if (this.checkOpenedToClosed(engine)) {
                this.changeState('closed');
            }
        }
        //if stage is closed
        else if (this.state == 'closed') {
            //check if it must be reopened
            if (this.checkClosedToOpened(engine)) {
                //evaluate compliance before resetting stage (and inner elements)
                var checkOnTimeOutOfOrder_checkClosedToOpened = this.checkOnTimeOutOfOrder(engine);
                this.changeState('opened');
                if (this.compliance == 'onTime' && checkOnTimeOutOfOrder_checkClosedToOpened) {
                    //if compliance was not met, then set stage as 'outOfOrder' 
                    this.changeCompliance('outOfOrder');
                    this.setUnopenedOnTimeRegularToSkipped(engine);
                }
            }
        }

        LogManager.logModelStage('update END', this.name, this.state, this.compliance, this.status);
        //handle closing of all child stages if current stage is closed
        var dep = [];
        //add to dependencies all child stages only if current stage is closed (so to close them if still opened)
        //WARNING: do not remove condition [this.state == 'closed'] otherwise closed stages will be reopened
        if (this.state == 'closed' && this._childs.length > 0)
            Array.prototype.push.apply(dep, this._childs);
        if (this._array_dep.length > 0)
            Array.prototype.push.apply(dep, this._array_dep);
        engine.EventAdministrator.emit(this.name, dep);
    }
};

//parser model
var PARSER = {
    //convert expressions specified for sentries in the model in a format understandable by the engine
    convertExpressionToSentry: function (engine, expr, artifactId) {
        LogManager.logParser(artifactId, 'INIZIO', 'NaN', expr);
        //add double quotes to arguments in PAC rules, so to turn them into function parameters (method(argument) --> method("argument"))
        var reg = new RegExp(/\((\w+)\)/g);
        var sentry = expr;
        var variable = '';
        while ((result = reg.exec(sentry)) !== null) {
            variable = result[1];
            sentry = sentry.replace(/\((\w+)\)/, "(\"$1\")");
            LogManager.logParser(artifactId, 'AGGIUNTA APICI', variable, sentry);
            //check for dependencies and populate array (which is then used to populate the internal data structure)
            if (engine.Dependency_Array[artifactId] == undefined && variable != '') {
                engine.Dependency_Array[artifactId] = [];
                engine.Dependency_Array[artifactId].push(variable);
            }
            else {
                if (variable != '')
                    engine.Dependency_Array[artifactId].push(variable);
            }
        }

        //replace XPath expression in infoModel with PAC rule GSM.isInfoModel(arg1, arg2, arg3)
        reg = new RegExp(/\{infoModel\.\/infoModel\/(\w+)\/(\w+)\} ([!<>'=]=?) \[(\w+)\]/g);
        while ((result = reg.exec(sentry)) !== null) {
            variable = result[1];
            sentry = sentry.replace(/\{infoModel\.\/infoModel\/(\w+)\/(\w+)\} ([!<>'=]=?) \[(\w+)\]/, "GSM.isInfoModel(\"$1\",\"$2\",\"$4\",\"$3\")");
            LogManager.logParser(artifactId, 'PAC GSM.isInfoModel', variable, sentry);
            //check for dependencies and populate array (which is then used to populate the internal data structure)
            if (engine.Dependency_Array[artifactId] == undefined && variable != '') {
                engine.Dependency_Array[artifactId] = [];
                engine.Dependency_Array[artifactId].push(variable);
            }
            else {
                if (variable != '')
                    engine.Dependency_Array[artifactId].push(variable);
            }
        }

        //replace 'and' with '&&'
        reg = new RegExp(/ and /g);
        while ((result = reg.exec(sentry)) !== null) {
            variable = result[0];
            sentry = sentry.replace(/ and /, " && ");
            LogManager.logParser(artifactId, 'CONVERSIONE &&', variable, sentry);
        }
        //replace 'or' with '||'
        reg = new RegExp(/ or /g);
        while ((result = reg.exec(sentry)) !== null) {
            variable = result[0];
            sentry = sentry.replace(/ or /, " || ");
            LogManager.logParser(artifactId, 'CONVERSIONE ||', variable, sentry);
        }
        //replace 'not' with '!'
        reg = new RegExp(/((not )|( not))/g);
        while ((result = reg.exec(sentry)) !== null) {
            variable = result[0];
            sentry = sentry.replace(/((not )|( not))/, "!");
            LogManager.logParser(artifactId, 'CONVERSIONE !', variable, sentry);
        }
        //return expression converted to an executable sentry
        LogManager.logParser(artifactId, 'FINALE', 'NaN', sentry);
        return sentry;
    },
    //recursive function to parse XML file and create internal data structure
    stageParsingRecursive: function (engine, nextStage, rank, parent) {
        //for each stage at root level, invoke recursive function to parse it
        //two root stages should be present in the XML file
        //1. process model stage
        //2. artifact lifecycle stage
        if (nextStage) {
            //create STAGE instance
            var stage = nextStage;
            var stageId = stage['$'].id;
            engine.Stage_array[stageId] = Object.create(STAGE);
            engine.Stage_array[stageId].init(stageId, parent, rank);
            // create DATA instance of type DataFlowGuard, connected to STAGE
            for (var dfg in stage['ca:DataFlowGuard']) {
                var guard = stage['ca:DataFlowGuard'][dfg];
                var guardId = guard['$'].id;
                //convert expression
                var sentry = PARSER.convertExpressionToSentry(engine, guard['$'].expression, guardId);
                //create DATA instance and initialize it
                engine.Data_array[guardId] = Object.create(DATA);
                engine.Data_array[guardId].init(guardId, stageId, sentry, 'D');
                engine.Stage_array[stageId]._dataGuards.push(guardId);
            }
            // create DATA instance of type ProcessFlowGuard, connected to STAGE
            for (var pfg in stage['ca:ProcessFlowGuard']) {
                var guard = stage['ca:ProcessFlowGuard'][pfg];
                var guardId = guard['$'].id;
                //convert expression
                var sentry = PARSER.convertExpressionToSentry(engine, guard['$'].expression, guardId);
                //create DATA instance and initialize it
                engine.Data_array[guardId] = Object.create(DATA);
                engine.Data_array[guardId].init(guardId, stageId, sentry, 'P');
                engine.Stage_array[stageId]._processGuards.push(guardId);
            }
            // create DATA instance of type FaultLogger, connected to STAGE
            for (var fl in stage['ca:FaultLogger']) {
                var guard = stage['ca:FaultLogger'][fl];
                var guardId = guard['$'].id;
                //convert expression
                var sentry = PARSER.convertExpressionToSentry(engine, guard['$'].expression, guardId);
                //create DATA instance and initialize it
                engine.Data_array[guardId] = Object.create(DATA);
                engine.Data_array[guardId].init(guardId, stageId, sentry, 'F');
                engine.Stage_array[stageId]._faults.push(guardId);
            }
            // create DATA instance of type Milestone, connected to STAGE
            for (var m in stage['ca:Milestone']) {
                var milestone = stage['ca:Milestone'][m];
                var milestoneId = milestone['$'].id;
                //convert expression
                var sentry = PARSER.convertExpressionToSentry(engine, milestone['ca:Condition'][0]['$'].expression, milestoneId);
                //create DATA instance and initialize it
                engine.Data_array[milestoneId] = Object.create(DATA);
                engine.Data_array[milestoneId].init(milestoneId, stageId, sentry, 'M');
                engine.Stage_array[stageId]._milestones.push(milestoneId);
            }

            //define listener for STAGE event
            engine.EventAdministrator.on('STAGE', stageId, function (stage_dep) {
                //dependency array is passed as a stage parameter, when it fires the event
                //in this way, it is possible to determine which elements (STAGE or DATA) munst be updated 
                //TODO: review when update() is called (first DATA then STAGE?)
                if (stage_dep != undefined) {
                    for (var k = 0; k < stage_dep.length; k++) {
                        if (engine.Data_array[stage_dep[k]] != undefined) {
                            //update DATA elements
                            engine.Data_array[stage_dep[k]].update(engine, false);
                        }
                    }

                    for (var k = 0; k < stage_dep.length; k++) {
                        if (engine.Stage_array[stage_dep[k]] != undefined) {
                            //update STAGE elements
                            engine.Stage_array[stage_dep[k]].update(engine);
                        }
                    }
                }
            });

            //handle SubStage elements in XML file
            var subStages = stage['ca:SubStage'];
            if (subStages != undefined && subStages[0] != undefined) {
                //iterate over all child stages, which are linked to the parent stage
                for (var key in subStages) {
                    if (typeof subStages[key] == "object") {
                        //create parent-child link
                        var subStage = subStages[key];
                        var subStageId = subStage['$'].id;
                        engine.Stage_array[stageId]._childs.push(subStageId);
                        //invoke recursive function to create STAGE instance for child stage
                        PARSER.stageParsingRecursive(engine, subStage, rank + 1, stageId);
                    }
                }
            }
        }

        return;
    },

    eventParsing: function (engine, evento) {
        //create EVENT instance and initialize it
        engine.Event_array[evento['$'].id] = Object.create(EVENTO);
        engine.Event_array[evento['$'].id].init(evento['$'].name);
        //define listener for that event
        engine.EventAdministrator.on('EVENTO', evento['$'].id, function (event_dep) {
            //when an event is fired, the array with all elements that depend on that event are passed (e.g., PAC isEventOccurring)
            //the listener will then call the update() method on the DATA instance
            if (event_dep != undefined) {
                for (var k = 0; k < event_dep.length; k++) {
                    //check DATA dependencies and call update() method (e.g., updated DFG1 or M1)
                    if (engine.Data_array[event_dep[k]] != undefined) {
                        engine.Data_array[event_dep[k]].update(engine, false);
                    }
                }
            }
        });
    },

    //parse information model
    infoParsing: function (engine, info) {
        //create INFORMATION instance and initialize it
        var infoId = info['$'].name;
        var pub = info['$'].pub;
        var sub = info['$'].sub;
        engine.Info_array[infoId] = Object.create(INFORMATION);
        engine.Info_array[infoId].init(infoId, pub, sub);
        //iterate over attributes in XSD section 'xs:attribute'
        var attributes = info['xs:complexType'][0]['xs:attribute'];
        for (var att in attributes) {
            // create ATTRIBUTE instance, initialize it and link it to INFORMATION
            var attributeName = attributes[att]['$'].name;
            var attributeType = attributes[att]['$'].type;
            var attributeUse = attributes[att]['$'].use;
            //TODO check for duplicate attributes
            //Info_array[infoId]._attributes.push(attributeName);
            engine.Info_array[infoId]._attributes[attributeName] = Object.create(ATTRIBUTE);
            engine.Info_array[infoId]._attributes[attributeName].init(attributeName, infoId, attributeType, attributeUse);
        }
        //define event listener
        engine.EventAdministrator.on('INFO', infoId, function (id, attributes) {
            //when an attribute in INFORMATION is changed, the INFORMATION instance id is passed
            //together with an array containing all changed elements
            //the listener then calls method changeAttributes(attributes)
            if (attributes != undefined) {
                if (engine.Info_array[id] != undefined) {
                    engine.Info_array[id].changeAttributes(engine, attributes);
                }
            }
        });
    },

    setDataListeners: function (engine) {
        //Add event
        for (var key in engine.Data_array) {
            var data_item = engine.Data_array[key];

            engine.EventAdministrator.on('DATA', data_item.name, function (dep) {
                if (dep != undefined) {
                    for (var k = 0; k < dep.length; k++) {
                        if (engine.Stage_array[dep[k]] != undefined) { engine.Stage_array[dep[k]].update(engine); }
                    }
                    for (var k = 0; k < dep.length; k++) {
                        if (engine.Data_array[dep[k]] != undefined && engine.Data_array[dep[k]].type == 'P') { engine.Data_array[dep[k]].update(engine,false); }
                    }
                    for (var k = 0; k < dep.length; k++) {
                        if (engine.Data_array[dep[k]] != undefined && engine.Data_array[dep[k]].type == 'F') { engine.Data_array[dep[k]].update(engine, false); }
                    }
                    for (var k = 0; k < dep.length; k++) {
                        if (engine.Data_array[dep[k]] != undefined && engine.Data_array[dep[k]].type == 'D') { engine.Data_array[dep[k]].update(engine, false); }
                    }
                    for (var k = 0; k < dep.length; k++) {
                        if (engine.Data_array[dep[k]] != undefined && engine.Data_array[dep[k]].type == 'M') { engine.Data_array[dep[k]].update(engine, false); }
                    }
                }
            });
        }
    },

    setDependencies: function (engine) {
        for (key in engine.Dependency_Array) {
            for (dep in engine.Dependency_Array[key]) {
                if (engine.Data_array[engine.Dependency_Array[key][dep]] != undefined) {
                    //Releated guard
                    if (engine.Data_array[engine.Dependency_Array[key][dep]]._array_dep.indexOf(engine.Dependency_Array[key]) == -1)
                        engine.Data_array[engine.Dependency_Array[key][dep]]._array_dep.push(key);
                }
                else if (engine.Event_array[engine.Dependency_Array[key][dep]] != undefined) {
                    //Releated guard
                    if (engine.Event_array[engine.Dependency_Array[key][dep]]._array_dep.indexOf(engine.Dependency_Array[key]) == -1)
                        engine.Event_array[engine.Dependency_Array[key][dep]]._array_dep.push(key);
                }
                else if (engine.Stage_array[engine.Dependency_Array[key][dep]] != undefined) {
                    //Releated guard
                    if (engine.Stage_array[engine.Dependency_Array[key][dep]]._array_dep.indexOf(engine.Dependency_Array[key]) == -1)
                        engine.Stage_array[engine.Dependency_Array[key][dep]]._array_dep.push(key);
                }
                else if (engine.Info_array[engine.Dependency_Array[key][dep]] != undefined) {
                    //Releated guard
                    if (engine.Info_array[engine.Dependency_Array[key][dep]]._array_dep.indexOf(engine.Dependency_Array[key]) == -1)
                        engine.Info_array[engine.Dependency_Array[key][dep]]._array_dep.push(key);
                }
                else {
                    //
                    LogManager.logParser('ATTENZIONE: variabile non gestita ---> ' + engine.Dependency_Array[key][dep]);
                }
            }
        }
    },

    checkUniqueIDs: function (engine) {
        //verify if duplicate IDs are present
        //if so, write error to event log, so to know if a malformed XML or XSD model has been provided
        for (var d in engine.Data_array) {
            if (engine.Stage_array[d] != undefined) {
                LogManager.log('ERROR', d, 'duplicate id in Data_array and Stage_array');
            }
            if (engine.Info_array[d] != undefined) {
                LogManager.log('ERROR', d, 'duplicate id in Data_array and Info_array');
            }
            if (engine.Event_array[d] != undefined) {
                LogManager.log('ERROR', d, 'duplicate id in Data_array and Event_array');
            }
        }
        for (var i in engine.Info_array) {
            if (engine.Stage_array[i] != undefined) {
                LogManager.log('ERROR', i, 'duplicate id in Info_array and Stage_array');
            }
            if (engine.Event_array[i] != undefined) {
                LogManager.log('ERROR', i, 'duplicate id in Info_array and Event_array');
            }
        }
        for (var s in engine.Stage_array) {
            if (engine.Event_array[s] != undefined) {
                LogManager.log('ERROR', s, 'duplicate id in Stage_array and Event_array');
            }
        }

    }
}

var passive = false;

var prefisso = (new Date().toISOString().replace(/:/g, '')).replace(/\./g, '');

function Engine(id) {
    return {
        id: id,
        // initialize arrays containing process model elements
        Data_array: {},       //data flow guards, process flow guards, fault loggers and milestones
        Stage_array: {},       //stages
        Info_array: {},       //information model
        Event_array: {},    //events
        Dependency_Array: {},  //dependencies

        //EventManager Instance
        EventAdministrator: EventManager.EventManager(id),

        //Initialize E-GSM engine
        initModel: function (processModel, infoModel) {
            //reset arrays
            this.Data_array = {};
            this.Stage_array = {};
            this.Dependency_Array = {};
            this.Info_array = {};
            this.Event_array = {};

            //reset event manager
            this.EventAdministrator.reset();

            //parse XML, section 'ca:EventModel'
            var events = processModel['ca:CompositeApplicationType']['ca:EventModel'][0]['ca:Event'];
            for (var key in events) {
                PARSER.eventParsing(this, events[key]);
            }

            //parse XML, section 'ca:Stage'
            var stages = processModel['ca:CompositeApplicationType']['ca:Component'][0]['ca:GuardedStageModel'][0]['ca:Stage'];
            for (var key in stages) {
                PARSER.stageParsingRecursive(this, stages[key], 0, '');
            }

            //configure listener for DATA events
            PARSER.setDataListeners(this);

            //parse XSD, section 'xs:element'
            var infos = infoModel['xs:schema']['xs:element'];
            for (var key in infos) {
                PARSER.infoParsing(this, infos[key]);
            }

            //update DATA, EVENT, STAGE, INFORMATION instances with dependencies computed by PARSER
            PARSER.setDependencies(this);

            //check for unique IDs
            PARSER.checkUniqueIDs(this);

            //write snapshot of the whole data structure to log file
            LogManager.logSnapshot(this.Stage_array);
            LogManager.logSnapshot(this.Data_array);
            LogManager.logSnapshot(this.Dependency_Array);
            LogManager.logSnapshot(this.Event_array);
            LogManager.logSnapshot(this.Info_array);

            //create snapshot folder
            if (!passive) {
                prefisso = (new Date().toISOString().replace(/:/g, '')).replace(/\./g, '');
                fs.mkdirSync('snapshot/' + prefisso);
            }

            //initialize process by evaluating all sentries for the first time
            for (key in this.Data_array) {
                this.Data_array[key].update(this, false);
            }

            //uncomment to enable configuration of communication manager
            //CommunicationManager.init(this.Info_array);

            //engine is now ready
        },

        //save a snapshot of the engine state
        saveState: function () {
            fs.writeFile('snapshot/' + prefisso + '/Data_array.json', JSON.stringify(this.Data_array), (err) => {
                if (err) throw err;
            });
            fs.writeFile('snapshot/' + prefisso + '/Stage_array.json', JSON.stringify(this.Stage_array), (err) => {
                if (err) throw err;
            });
            fs.writeFile('snapshot/' + prefisso + '/Info_array.json', JSON.stringify(this.Info_array), (err) => {
                if (err) throw err;
            });
            fs.writeFile('snapshot/' + prefisso + '/Event_array.json', JSON.stringify(this.Event_array), (err) => {
                if (err) throw err;
            });
            fs.writeFile('snapshot/' + prefisso + '/Dependency_Array.json', JSON.stringify(this.Dependency_Array), (err) => {
                if (err) throw err;
            });
        },

        // E-GSM process instance: used to evaluate expressions and PAC rules
        // check if a milestone is achieved
        isMilestoneAchieved: function (milestone) {
            LogManager.logModelPAC1('isMilestoneAchieved', milestone, this.Data_array[milestone].value);
            return this.Data_array[milestone].value;
        },
        // check if an event is occurring
        isEventOccurring: function (event) {
            LogManager.logModelPAC1('isEventOccurring', event, this.Event_array[event].value);
            return this.Event_array[event].value;
        },
        // check if a stage is active (opened)
        isStageActive: function (stage) {
            LogManager.logModelPAC1('isStageActive', stage, this.Stage_array[stage].state == 'opened');
            return this.Stage_array[stage].state == 'opened';
        },
        // check information model
        isInfoModel: function (model, attribute, value, operator) {
            // EXPERIMENTAL: learn admissibile attribute values
            var attributes = this.Info_array[model]._attributes;
            for (var key in attributes) {
                if (attributes[key].name == attribute && attributes[key]._learningValues.indexOf(value) < 0) {
                    // add attribute value to list if not already present
                    attributes[key]._learningValues.push(value);
                }
            }

            // check information model status
            var checkValue = false;
            for (var key in attributes) {
                if (attributes[key].name == attribute) {
                    switch (operator) {
                        case "==":
                            // value is identical to specified one
                            if (attributes[key].value == value)
                                checkValue = true;
                            break;
                        case "!=":
                            // value is identical to specified one
                            if (attributes[key].value != value)
                                checkValue = true;
                            break;
                        case "<=":
                            // value is identical to specified one
                            if (attributes[key].value <= value)
                                checkValue = true;
                            break;
                        case ">=":
                            // value is identical to specified one
                            if (attributes[key].value >= value)
                                checkValue = true;
                            break;
                        case "<":
                            // value is identical to specified one
                            if (attributes[key].value < value)
                                checkValue = true;
                            break;
                        case ">":
                            // value is identical to specified one
                            if (attributes[key].value > value)
                                checkValue = true;
                            break;
                    }
                }
            }

            LogManager.logModelPAC2('isInfoModel', model, attribute, value, checkValue);
            return checkValue;
        },
        // evaluate expressions (sentries)
        eval: function (expression) {
            try {
                // return results of the expression
                LogManager.logModelExpression(expression);
                return eval(expression);
            } catch (e) {
                // Log exception
                LogManager.log('EVAL ERROR', 'when evaluating sentry', expression);
                LogManager.log('EVAL ERROR', 'exception', e);
                // if an exception is raised, always return 'false'
                return false;
            }
        },

        // Other PAC rules (to be implemented)
        // GSM.hasGroupOfAllRelatedArtifactsMilestoneBeenAchieved
        // GSM.hasGroupOfAnyRelatedArtifactsMilestoneBeenAchieved
        // GSM.hasRelatedArtifactMilestoneBeenAchieved
        // GSM.hasTaskCompleted
        // GSM.isRelatedArtifactStageActive
        // GSM.isStageCompleted
        // GSM.milestoneAchievedOnEvent
        // GSM.RelatedArtifactMilestoneAchievedOnEvent
        // GSM.stageActivatedOnEvent
        // GSM.stageClosedOnEvent

        notifyEngine(name, data) {
            console.log("[" + id + "] Message received: " + topic + " -> " + message);
        },

        //UI
        //recursive method to build JSON file for UI (convert flat array into hierarchical structure)
        completeDiagram: function (json, stage, rank) {
            if (stage) {
                //define JSON fields
                json.name = this.Stage_array[stage.name].name;
                json.state = this.Stage_array[stage.name].state;
                json.status = this.Stage_array[stage.name].status;
                json.compliance = this.Stage_array[stage.name].compliance;
                json.array_dep = this.Stage_array[stage.name]._array_dep;
                //populate data flow guards
                json.dataGuards = [];
                for (var key2 in stage._dataGuards) {
                    json.dataGuards.push(this.Data_array[stage._dataGuards[key2]]);
                }
                //populate process flow guards
                json.processGuards = [];
                for (var key2 in stage._processGuards) {
                    json.processGuards.push(this.Data_array[stage._processGuards[key2]]);
                }
                //populate milestones
                json.milestones = [];
                for (var key2 in stage._milestones) {
                    json.milestones.push(this.Data_array[stage._milestones[key2]]);
                }
                //populate fault loggers
                json.faults = [];
                for (var key2 in stage._faults) {
                    json.faults.push(this.Data_array[stage._faults[key2]]);
                }
                //add child stages
                json.sub_stages = [];
                for (var key in stage._childs) {
                    if (typeof this.Stage_array[stage._childs[key]] == "object") {
                        //invoke recursive function
                        json.sub_stages.push(this.completeDiagram({}, this.Stage_array[stage._childs[key]], this.Stage_array[stage._childs[key]].rank));
                    }
                }
                return json;
            }
            return json;
        },


        //EXPOSED FUNCTIONS
        // engine initialization
        start: function (xsdInfoModel, xmlProcessModel) {
            // parse XML and XSD files, then start engine
            var parseString = xml2js.parseString;
            var that = this
            parseString(xmlProcessModel, function (err, result) {
                //TODO: add exception handling
                var processModel = result;
                parseString(xsdInfoModel, function (err, result) {
                    var infoModel = result;
                    // initialize and start engine
                    that.initModel(processModel, infoModel);
                });
            });
        },
        // engine reset
        reset: function (processModelPath, infoModelPath) {
            //reset arrays
            this.Data_array = {};
            this.Stage_array = {};
            this.Dependency_Array = {};
            this.Info_array = {};
            this.Event_array = {};
            //reset event manager
            this.EventAdministrator.reset();
        },
        // create JSON to represent model in UI
        getCompleteDiagram: function () {
            //build json model for GUI
            var json_model = [];
            for (var key in this.Stage_array) {
                if (this.Stage_array[key].rank == 0)
                    json_model.push(this.completeDiagram({}, this.Stage_array[key], 0));
            }
            return json_model;
        },
        // create JSON to represent model in UI
        getCompleteNodeDiagram: function () {
            //build json model for GUI
            var json_model = [];
            for (var key in this.Stage_array) {
                var stageM = {};
                stageM.name = this.Stage_array[key].name;
                stageM.key = this.Stage_array[key].name;
                if (this.Stage_array[key].state == 'unopened' && this.Stage_array[key].compliance == 'onTime') {
                    stageM.color = "silver";
                }
                else if (this.Stage_array[key].compliance == 'skipped') {
                    stageM.color = "gray";
                }
                else if (this.Stage_array[key].state == 'opened' && this.Stage_array[key].compliance == 'onTime') {
                    stageM.color = "orange";
                }
                else if (this.Stage_array[key].state == 'closed' && this.Stage_array[key].compliance == 'onTime') {
                    stageM.color = "darkgreen";
                }
                else if (this.Stage_array[key].compliance == 'outOfOrder') {
                    stageM.color = "red";
                }

                stageM.isGroup = true;
                stageM.group = this.Stage_array[key].parent;
                stageM.inservices = [];
                for (var key2 in this.Stage_array[key]._dataGuards) {
                    var guard = {};
                    guard.name = this.Data_array[this.Stage_array[key]._dataGuards[key2]].name
                    stageM.inservices.push(guard);
                }
                json_model.push(stageM);

                for (var key2 in this.Stage_array[key]._dataGuards) {
                    var guard = {};
                    guard.name = 'DFG' + key2;
                    guard.key = this.Data_array[this.Stage_array[key]._dataGuards[key2]].name;
                    guard.color = "silver"
                    guard.group = this.Data_array[this.Stage_array[key]._dataGuards[key2]].stage;
                    json_model.push(guard);
                }
            }
            return json_model;
        },
        getInfoModel: function () {
            var json_model = [];
            for (var key in this.Info_array) {
                var infoM = {};
                infoM.name = this.Info_array[key].name;
                infoM.attributes = [];
                for (var key2 in this.Info_array[key]._attributes) {
                    if (this.Info_array[key]._attributes[key2].name != 'timestamp')
                        infoM.attributes.push(this.Info_array[key]._attributes[key2]);
                }
                json_model.push(infoM);
            }
            return json_model;
        },
        getEventModel: function () {
            var json_model = [];
            for (var key in this.Event_array) {
                var extM = {};
                extM.name = this.Event_array[key].name;
                extM.value = this.Event_array[key].value;
                json_model.push(extM);
            }
            return json_model;
        },
        updateInfoModel: function (name, value) {
            console.log(`update model: ${name}->${value}`)
            if (!passive) {
                var attrs = [];
                if (value != undefined && value != '') {
                    attrs = [];
                    attrs[0] = new Object();
                    attrs[0].name = 'status';
                    attrs[0].value = value;
                    this.Info_array[name].changeAttributes(this, attrs);
                }
                else {
                    this.Info_array[name].changeAttributes(this, attrs);
                }
                this.saveState();
            }
        },
        loadStaticState: function (path) {
            fs.readFile(path + '/Data_array.json', (err, data) => {
                if (err) throw err;
                this.Data_array = JSON.parse(data);
            });
            fs.readFile(path + '/Stage_array.json', (err, data) => {
                if (err) throw err;
                this.Stage_array = JSON.parse(data);
            });
            fs.readFile(path + '/Info_array.json', (err, data) => {
                if (err) throw err;
                this.Info_array = JSON.parse(data);
            });
            fs.readFile(path + '/Event_array.json', (err, data) => {
                if (err) throw err;
                this.Event_array = JSON.parse(data);
            });
            fs.readFile(path + '/Dependency_Array.json', (err, data) => {
                if (err) throw err;
                this.Dependency_Array = JSON.parse(data);
            });
            passive = true;
        }
    }
}

var ENGINES = new Map()
var SUBSCRIBE;

module.exports = {
    getDataArray: function (engineid) {
        return ""//ENGINES.get(engineid).Data_array
    },
    getStageArray: function (engineid) {
        return ""//ENGINES.get(engineid).Stage_array
    },

    setEventRouter: function (publishfunction) {
        SUBSCRIBE = publishfunction
    },

    //returns true if an engine with the provided id exists
    exists: function (engineid) {
        return ENGINES.has(engineid)
    },

    getDebugLog: function (engineid) {
        //TODO
        return ''
    },

    createNewEngine: async function (engineid, informalModel, processModel) {
        if (ENGINES.has(engineid)) {
            return "already_exists"
        }
        ENGINES.set(engineid, new Engine(engineid))
        console.log("New Engine created")
        //Start Engine
        ENGINES.get(engineid).start(informalModel, processModel)
        return "created"
    },

    removeEngine: function (engineid) {
        if (!ENGINES.has(engineid)) {
            return "not_defined"
        }
        ENGINES.delete(engineid)
        return 'removed'
    },

    resetEngine: function (engineid) {
        if (!ENGINES.has(engineid)) {
            return "not_defined"
        }
        ENGINES.get(engineid).reset()
        return 'resetted'
    },

    // create JSON to represent model in UI
    getCompleteDiagram: function (engineid) {
        if (!ENGINES.has(engineid)) {
            return "not_defined"
        }
        //build json model for GUI
        return ENGINES.get(engineid).getCompleteDiagram()
    },

    getCompleteNodeDiagram: function (engineid) {
        if (!ENGINES.has(engineid)) {
            return "not_defined"
        }
        //build json model for GUI
        return ENGINES.get(engineid).getCompleteNodeDiagram()
    },

    getInfoModel: function (engineid) {
        if (!ENGINES.has(engineid)) {
            return "not_defined"
        }
        return ENGINES.get(engineid).getInfoModel()
    },

    updateInfoModel: function (engineid, name, value) {
        if (!ENGINES.has(engineid)) {
            return "not_defined"
        }
        return ENGINES.get(engineid).updateInfoModel(name, value)
    },

    getEngineNumber: function () {
        return ENGINES.length;
    },

    notifyEngine: function (engineid, name, value) {
            ENGINES.get(engineid).updateInfoModel(name, value)
    }

}