const fs = require('fs/promises');
const Servers = {};

const file_path = process.env.ROOT + '/data/server.json';

/**
 * Gets server by it's unique_id
 * @param {Number} id
 * @return {{}} Server
 * @public
 */
Servers.get = async (id) => {
    let servers = await Servers.getAll();
    return servers.find(server => server.id == id) || null;
};

/**
 * Gets server by it's unique_id
 * @param {Number|String} name
 * @return {{}} Server
 * @public
 */
Servers.getByName = async (name) => {
    let servers = await Servers.getAll();
    return servers.find(server => server.name == name) || null;
};

/**
 * Gets all servers
 * @return {{}} Servers
 * @public
 */
Servers.getAll = async () => JSON.parse(await fs.readFile(file_path));

/**
 * Creates a new server
 * @param {Number|String} name
 * @param {String} bin
 * @return {Promise} Status
 * @public
 */
Servers.create = async (name, bin) => {
    let servers = await Servers.getAll();
    let server = {'name': name, 'bin': bin};
    servers.push(server);
    return fs.writeFile(file_path, JSON.stringify(servers), {'encoding': 'utf-8'});
};

/**
 * Gets server by it's  unique_id
 * @param {Number|String} name
 * @param {{}} data
 * @return {Promise} Status
 * @public
 */
Servers.update = async (name, data) => {
    let servers = await Servers.getAll();
    let server = {'name': name};

    let options = ['bin'];
    let optional_keys = options.filter(e => data.hasOwnProperty(e));
    let optional_values = optional_keys.map(e => data[e]);

    server = Object.assign(server, optional_values);
    servers.push(server);
    return fs.writeFile(file_path, JSON.stringify(servers), {'encoding': 'utf-8'});
};

module.exports = Servers;