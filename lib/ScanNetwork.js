const os = require('os');
const evilscan = require('evilscan');
const pushLog = require('./pushLog');
const interfaces = os.networkInterfaces();
const local_networks = [];

const SCAN_NETWORK_TIMEOUT = 150;

for(interface in interfaces){
    interfaces[interface].forEach(e => {
        if(!e.internal && e.family == 'IPv4'){
            local_networks.push(e.cidr);
        }
    });
}
/**
 * 
 * @param {String|[String]} cidr 
 * @param {Number} port 
 * @returns 
 */
const ScanNetwork = (cidr = local_networks, port = 8124) => {
    return new Promise((resolve, reject)=>{
        if(!Array.isArray(cidr)){
            cidr = [cidr];
        }
        cidr.forEach(network => {
            new evilscan({'target': network, 'port': port, 'timeout': SCAN_NETWORK_TIMEOUT}, (error, scan)=> {
                let found = [];
                if(error){
                    console.error(error);
                    return;
                }
                scan.on('result', data => {
                    found.push(data);
                    pushLog(data, "Network Port Check");
                });
            
                scan.on('error', err => {
                    pushLog(err.toString(), "Network Port Check");
                    reject(err.toString());
                });
            
                scan.on('done', () => {
                    resolve(found);
                });
            
                scan.run();
            });
        });
    });
}

module.exports = ScanNetwork;