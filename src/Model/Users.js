const fs = require('fs/promises');
const Servers = require(process.env.ROOT + '/src/Model/Server')
const Users = {};

const file_path = process.env.ROOT + '/data/user.json';

/**
 * Gets user by it's  unique_id
 * @param {Number|String} name
 * @return {{}} User
 * @public
 */
Users.get = (name) => {
    let users = require(file_path);
    let user = users.find(user => user.name == name) || null;
    if(user != null){
        user.assigned_server = user.assigned_server.map(server_name => typeof server_name == "string" ? Servers.get(server_name) : server_name);
    }
    return user;
};

/**
 * Gets all users
 * @return {{}} Users
 * @public
 */
Users.getAll = () => require(file_path);

/**
 * Creates a new user
 * @param {Number|String} name
 * @param {String} hash
 * @param {Number[]} assigned_server
 * @return {Promise} Status
 * @public
 */
Users.create = async (name, hash, assigned_server = []) => {
    let users = require(file_path);
    let user = {'name': name, 'hash': hash, 'assigned_server': assigned_server, 'create_date': Date.now()};
    users.push(user);
    // TODO add to whitelist of servers
    return fs.writeFile(file_path, JSON.stringify(users), {'encoding': 'utf-8'});
};

/**
 * Gets user by it's  unique_id
 * @param {Number|String} name
 * @param {{}} data
 * @return {Promise} Status
 * @public
 */
Users.update = async (name, data) => {
    let users = require(file_path);
    let user = {'name': name};

    let options = ['hash', 'assigned_server'];
    let optional_keys = options.filter(e => data.hasOwnProperty(e));
    let optional_values = optional_keys.map(e => data[e]);

    user = Object.assign(user, optional_values);
    users.push(user);
    return fs.writeFile(file_path, JSON.stringify(users), {'encoding': 'utf-8'});
};

module.exports = Users;