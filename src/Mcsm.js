const net = require('net');
const util = require('minecraft-server-util');
const pushLog = require('../lib/pushLog');
const Mcsm = {};

const mcsm_hosts = process.env.MCSM_HOSTS.split(',').map(e => {
    e = e.split(':');
    return {'host': e[0], 'port': e[1]}
});
console.log(mcsm_hosts);

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
Mcsm.getStatus = async (slot_uid) => mcsm_slots.find(e => e.uid == slot_uid) || (await Mcsm.getAllSlots()).find(e => e.uid == slot_uid);

/**
 * GET LIST OF SERVER SLOTS
 * @returns {Void}
 * @public
 */
Mcsm.getSlots = (host, callback) =>{
    const payload = getRequestPayload('getSlotList');
    connect(host, payload, callback);
};

Mcsm.getAllSlots = async () => {
    let promises = [], slots = [];
    for(let i = 0; i < mcsm_hosts.length; i++){
        promises.push(new Promise((resolve)=> {
            Mcsm.getSlots(mcsm_hosts[i], (error, data)=>{
                if(Array.isArray(data)){
                    for(let j = 0; j < data.length; j++){
                        data[j].uid = parseInt(`${i}${data[j].id}`);
                        data[j].mcsm_host = mcsm_hosts[i];
                    }
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

function connect(host, payload, callback){
    const client = net.createConnection(host, ()=>{
        pushLog(`Connection to MCSM Server established. Requesting Slot List ...`, "MCSM");
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
        callback("Timeout", null);
    });
}

Mcsm.util = util;

Mcsm.getAllSlots();

module.exports = Mcsm;