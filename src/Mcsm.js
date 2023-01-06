const env = require('dotenv').config();
const net = require('net')
const Mcsm = {};
const file_path = process.env.ROOT + '/data/invitation.json';

const request_schema = {
    'authentication': process.env.MCSM_AUTH,
    'command':{
        'name': "",
        'args': {

        }
    }
}

function getRequestPayload(command_name, args = {}){
    const payload = {...request_schema};
    payload.command.name = command_name;
    payload.command.args = args;

    return JSON.stringify(payload);
}

/**
 * Starts MC Server (:id)
 * @param {Number|String} id
 * @return {Promise<Object>} Promise
 * @public
 */
Mcsm.startServer = (id, callback) => {
    const payload = getRequestPayload('startServer', {'id': id});
    const client = net.createConnection({ port: 8124 }, () => {
        console.log('connected to server!');
        client.write(payload);
    });
    client.on('data', (data) => {
        try{
            const response = JSON.parse(data);
            if(response.keep_alive != true){
                client.end();
            }
            if(callback){
                callback(response.error, response.data);
            }
            console.log(response);
        }
        catch(error){
            callback(error, null);
            console.error(error);
        }
    });
    client.on('end', () => {
        console.log('disconnected from server');
    });
    client.on('error', (error) => {
        console.error(error);
    });
};

/**
 * Stops current Server
 * @return {Promise<Object>} Promise
 * @public
 */
 Mcsm.stopServer = (callback) => {
    const payload = getRequestPayload('stopServer');
    const client = net.createConnection({ port: 8124 }, () => {
        // 'connect' listener.
        console.log('connected to server!');
        client.write(payload);
    });
    client.on('data', (data) => {
        try{
            const response = JSON.parse(data);
            client.end();
            console.log(response);
            if(callback){
                callback(response.error, response.data);
            }
        }
        catch(error){
            console.error(error);
            callback(error, null);
        }
    });
    client.on('end', () => {
        console.log('disconnected from server');
    });
    client.on('error', (error) => {
        console.error(error);
    });
};

module.exports = Mcsm;