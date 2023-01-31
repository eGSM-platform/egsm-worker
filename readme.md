# Engine Worker Application for eGSM Monitoring Platform
eGSM Monitoring Platform is a microservice-based, distributed business process monitoring platform. Its operation is based on Engine Workers and Aggregator Agents.
This application is the Engine Worker component of the system, which is capable to perform eGSM engine instances, receiving and processing events in real-time coming from the smart objects. The architecture can contain more of this module at the same time, the necessary port setups are happening in runtime automatically.

## Requirements
The eGSM Monitoring Platform requires:
1. MQTT broker using at least MQTT v5.0
2. DynamoDB database (cloud or locally deployed), which the appropriate tables created (see Supervisor module) 

## Usage
1. Clone repository
2. Run `git submodule update --init`
3. Run `npm install package.json` and make sure all libraries have been installed successfully
4. If necessary, update the content of `config.xml`, which defines the network address of the MQTT broker and the database
5. Before deploying any application of the platform, the database has to be populated with the necessary tables (see Supervisor Module)
6. Run `node main.js`
7. The application is now running and ready to receive requests