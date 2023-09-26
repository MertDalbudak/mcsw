/*
AUTHOR: Mert Dalbudak

THIS SCRIPT CREATES A .ENV FILE FOR THE MCSW SERVICE 
*/

const p = require('path');
const fs = require('fs');
const crypto = require('crypto')
const readline = require('readline');
const { execSync } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const env_path = p.resolve(`${__dirname}/../.env`);
let env = "NODE_ENV=production\n\n";

console.log(`
#########################################
#                                       #
#       CREATING ENVIRONMENT FILE       #
#                                       #
#########################################
`);

fs.access(env_path, async(error) => {
    if(error){
        console.log('.env file does not exist');
        await env_questionaire();
    }
    else {
        console.log("ENVIRONMENT FILE ALREADY EXISTS. EXITING...");
        rl.close();
    }
});


/**
 * 
 * @param {Function} question 
 * @param {*} args 
 * @returns 
 */
async function ask(question, ...args){
    let error = null;
    let answer = null;
    do {
        try{
            answer = await question(...args);
            error = null;
        }catch(err){
            error = err;
            console.error(`\x1b[31m${err}\x1b[0m`);
        }
    }while(error != null);

    return answer;
}

function addLine(name, value){
    if(name == undefined)
        env += "\n";
    else
        env += `${name}=${value}\n`;
}

async function env_questionaire(){
    await ask(domain);
    await ask(port);
    addLine();
    await ask(salt_rounds);
    await ask(cookie_secret);
    await ask(session_secret);
    await ask(db_con_idle_timeout);
    await ask(request_timeout);
    await ask(session_max_age);
    addLine();
    addLine();
    await ask(mcsm_endpoints);
    await ask(mcsm_auth);

    rl.close();
    fs.writeFileSync(env_path, env);

    console.log(`\x1b[92mEnvironment file successfully created!\x1b[0m`);
    console.log(`For more options edit \x1b[33m${env_path}\x1b[0m manually`);
}

const domain = () => new Promise((res, rej) => {
    rl.question(`Enter the domain of your server (e.g.: example.com): `, domain =>{
        if(domain == null || domain == ""){
            rej("Domain cannot be empty");
        }
        else {
            addLine("DOMAIN", domain);
            res();
        }
    });
});

const port = () => new Promise((res, rej) => {
    const _default = 80;
    rl.question(`Specify a port on which the web server will be running (default: \x1b[33m${_default}\x1b[0m): `, port =>{
        if(isNaN(port)){
            rej("Input must be numeric");
        }
        else{
            addLine('PORT', port || _default);
            res();
        }
    });
});

const salt_rounds = () => new Promise((res, rej) => {
    const _default = 10;
    rl.question(`Define the amount of salt rounds (default: \x1b[33m${_default}\x1b[0m): `, s_rounds =>{
        if(isNaN(s_rounds)){
            rej("Input must be numeric");
        }
        else{
            addLine('SALT_ROUNDS', s_rounds || _default);
            res();
        }
    });
});

const cookie_secret = () => new Promise((res, rej) => {
    rl.question(`Specify the cookie secret (\x1b[33m automatically generated if blank\x1b[0m ): `, c_secret =>{
        addLine("COOKIE_SECRET", c_secret || crypto.randomBytes(16).toString('hex'));
        res();
    });
});

const session_secret = () => new Promise((res, rej) => {
    rl.question(`Specify the session secret (\x1b[33m automatically generated if blank\x1b[0m ): `, s_secret =>{
        addLine("SESSION_SECRET", s_secret || crypto.randomBytes(16).toString('hex'));
        res();
    });
});

const db_con_idle_timeout = () => new Promise((res, rej) => {
    const _default = 300;
    rl.question(`Specify the connection idle timout in ms (default: \x1b[33m${_default}\x1b[0m): `, timeout =>{
        if(isNaN(timeout)){
            rej("Input must be numeric");
        }
        else{
            addLine('DB_CONN_IDLE_TIMEOUT', timeout || _default);
            res();
        }
    });
});

const request_timeout = () => new Promise((res, rej) => {
    const _default = 6000;
    rl.question(`Specify the request timout in ms (default: \x1b[33m${_default}\x1b[0m): `, timeout =>{
        if(isNaN(timeout)){
            rej("Input must be numeric");
        }
        else{
            addLine('REQUEST_TIMEOUT', timeout || _default);
            res();
        }
    });
});

const session_max_age = () => new Promise((res, rej) => {
    const _default = "1d";
    rl.question(`Specify the session max age (default: \x1b[33m${_default}\x1b[0m): `, max_age =>{
        max_age = max_age || _default;
        let max_age_value = max_age.substring(0, max_age.length -1);
        if(isNaN(max_age_value)){
            rej("No valid input was provided");
        }
        else{
            max_age_value = parseInt(max_age_value);
        }
        switch(max_age.substr(-1)){
            case "s":
                max_age_value *= 1000;
                break;
            case "m":
                max_age_value *= (1000 * 60);
                break;
            case "h":
                max_age_value *= (1000 * 60 * 60);
                break;
            case "d":
                max_age_value *= (1000 * 60 * 60 * 24);
                break;
            default:
                rej("Only (s: Seconds, m: Minutes, h: Hours, d: Days) are allowed");
                return;
        }
        addLine("SESSION_MAX_AGE", max_age_value);
        res();
    });
});

const mcsm_endpoints = (root = true) => new Promise((res, rej) => {
    let _host = "";
    rl.question(`Do you want to specify a mcsm endpoint: (y/n): `, async (answer) => {
        if(answer == 'Y' || answer == 'y'){
            rl.question(`Enter the domain and port number of your mcsm server (e.g.: example.com:8124): `, async (host) =>{
                if(host == null || host == ""){
                    rej("Host cannot be empty");
                }
                else {
                    let split_host = host.split(':');
                    if(split_host.length != 2 || split_host[1] == "" || isNaN(split_host[1])){
                        rej("Invalid entry. Enter domain and port (e.g.: example.com:8124)");
                    }
                    else{
                        _host = `${host}${(await ask(mcsm_endpoints, false))}`;
                        if(root){
                            addLine("MCSM_ENDPOINTS", _host);
                        }
                        res(`,${_host}`);
                    }
                }
            });
        }
        else{
            if(root){
                addLine("MCSM_ENDPOINTS", _host);
            }
            res(_host);
        }
    });
});

const mcsm_auth = () => new Promise((res, rej) => {
    rl.question(`Specify a MCSM authentication phrase (at lease 8 characters): `, auth =>{
        if(auth.length < 8){
            rej("Input must be at least 8 characters long");
        }
        else{
            let hash = crypto.createHash('sha256').update(auth).digest('hex');
            console.log(`API Authentication: \x1b[96m${hash}\x1b[0m`);
            addLine("MCSM_AUTH", hash);
            res();
        }
    });
});