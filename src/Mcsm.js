const net = require('net');
const util = require('minecraft-server-util');
const ScanNetwork = require('../lib/ScanNetwork');
const pushLog = require('../lib/pushLog');
const Mcsm = {};

const mcsm_endpoints = process.env.MCSM_ENDPOINTS.split(',').map(e => {
    e = e.split(':');
    return {'host': e[0], 'port': e[1]}
});
console.log(mcsm_endpoints);

let mcsm_slots = [];

const request_schema = {
    'authentication': process.env.MCSM_AUTH,
    'command':{
        'name': "",
        'args': {

        }
    }
};

function getRequestPayload(command_name, args = {}){
    const payload = {...request_schema};
    payload.command.name = command_name;
    payload.command.args = args;

    return JSON.stringify(payload);
}

/**
 * Starts MC Server (:id)
 * @param {Number|String} slot_uid
 * @param {Number|String} server_id
 * @return {Void}
 * @public
 */
Mcsm.startServer = async (slot_uid, server_id, callback) => {
    if(isNaN(slot_uid)){
        throw new Error(`First parameter must be a Number. ${typeof slot_id} given instead.`)
    }
    if(isNaN(server_id)){
        throw new Error(`Second parameter must be a Number. ${typeof server_id} given instead.`)
    }
    let slot = await Mcsm.getStatus(slot_uid);
    if(slot == undefined){
        callback(`Couldn't find slot (slot_uid: ${slot_uid})`, null);
        return;
    }
    const payload = getRequestPayload('startServer', {'slot_id': slot.id, 'server_id': server_id});
    connect(slot.mcsm_host, payload, callback);
};

/**
 * Retarts MC Server (:id)
 * @param {Number|String} slot_uid
 * @param {Number|String} server_id
 * @return {Void}
 * @public
 */
Mcsm.restartServer = async (slot_uid, server_id, callback) => {
    if(isNaN(slot_uid)){
        throw new Error(`First parameter must be a Number. ${typeof slot_id} given instead.`)
    }
    if(isNaN(server_id)){
        throw new Error(`Second parameter must be a Number. ${typeof server_id} given instead.`)
    }
    let slot = await Mcsm.getStatus(slot_uid);
    if(slot == undefined){
        callback(`Couldn't find slot (slot_uid: ${slot_uid})`, null);
        return;
    }
    const payload = getRequestPayload('restartServer', {'slot_id': slot.id, 'server_id': server_id});
    connect(slot.mcsm_host, payload, callback);
};

/**
 * Stops current Server
 * @return {Void}
 * @param {Number|String} slot_uid
 * @param {Function} callback
 * @public
 */
 Mcsm.stopServer = async (slot_uid, callback) => {
    if(isNaN(slot_uid)){
        throw new Error(`First parameter must be a Number. ${typeof slot_id} given instead.`)
    }
    let slot = await Mcsm.getStatus(slot_uid);
    if(slot == undefined){
        if(callback)
            callback(`Couldn't find slot (slot_uid: ${slot_uid})`, null);
        return;
    }
    const payload = getRequestPayload('stopServer', {'slot_id': slot.id});
    connect(slot.mcsm_host, payload, callback);
};

/**
 * 
 * @param {Number} slot_uid 
 * @returns {*}
 */
Mcsm.getStatus = async (slot_uid) => mcsm_slots.find(e => e.uid == slot_uid) || (await Mcsm.getNetworkSlots()).find(e => e.uid == slot_uid);

/**
 * GET LIST OF SERVER SLOTS
 * @returns {Void}
 * @public
 */
Mcsm.getSlotData = (endpoint, callback) =>{
    pushLog(`Requesting Slot Data of ${endpoint.host}`, "MCSM");
    const payload = getRequestPayload('getSlotData');
    connect(endpoint, payload, callback);
};

/**
 * GETS ALL PREDEFINED SERVER SLOTS
 * @returns {Void}
 * @public
 */
Mcsm.getAllSlots = async () => {
    let promises = [], slots = [];
    for(let i = 0; i < mcsm_endpoints.length; i++){
        promises.push(new Promise((resolve)=> {
            Mcsm.getSlotData(mcsm_endpoints[i], (error, data)=>{
                if(error == null){
                    data.uid = parseInt(`${i}${data.id}`);
                    data.mcsm_host = mcsm_endpoints[i];
                }
                resolve({'error': error, 'data': data});
            });
        }));
    }
    mcsm_responses = await Promise.all(promises);
    for(let i = 0; i < mcsm_responses.length; i++){
        let mcsm_response = mcsm_responses[i];
        if(mcsm_response.error == null){
            slots.push(...mcsm_response.data);
        }
        else{
            console.error(mcsm_response.error);
        }
    }
    mcsm_slots = slots;
    return slots;
};

/**
 * GETS ALL SERVER SLOTS IN SAME NETWORK
 * @returns {Void}
 * @public
 */
Mcsm.getNetworkSlots = async () => {
    let promises = [], slots = [];
    let found = await ScanNetwork();
    found = found.map(e => ({'host': e.ip, 'port': e.port}));
    for(let i = 0; i < found.length; i++){
        promises.push(new Promise((resolve)=> {
            Mcsm.getSlotData(found[i], (error, data)=>{
                if(error == null){
                    data.uid = parseInt(`${i}${data.id}`);
                    data.mcsm_host = found[i];
                }
                resolve({'error': error, 'data': data});
            });
        }));
    }
    console.log(found);
    mcsm_responses = await Promise.all(promises);
    for(let i = 0; i < mcsm_responses.length; i++){
        let mcsm_response = mcsm_responses[i];
        if(mcsm_response.error == null){
            slots.push(mcsm_response.data);
        }
        else{
            console.error(mcsm_response.error);
        }
    }
    mcsm_slots = slots;
    return slots;
};

function connect(host, payload, callback){
    const client = net.createConnection(host, ()=>{
        pushLog(`Connection to MCSM Server established.`, "MCSM");
        client.write(payload);
    });
    let response = "";
    client.on('data', (data)=> {
        response += data.toString();
    });
    client.on('end', () => {
        try{
            response = JSON.parse(response);
            console.log(response);
            if(callback){
                callback(response.error, response.data, response.message);
            }
        }
        catch(error){
            pushLog(host, "MCSM Error");
            pushLog(error.toString(), "MCSM Error");
            callback(error, null);
        }
        pushLog('Connection to MCSM Server has ended', "MCSM");
    });
    client.on('error', (error) => {
        pushLog(error.toString(), "MCSM Error");
        callback(error, null);
    });
    client.setTimeout(1500, () => {
        client.destroy();
        console.log(callback);
        callback("Timeout", null);
    });
}

Mcsm.util = util;

Mcsm.getAllSlots();

module.exports = Mcsm;