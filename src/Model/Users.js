const fs = require('fs/promises');
const ROOT = process.env.ROOT;
const pushLog = require(ROOT + '/lib/pushLog');
const Servers = require(ROOT + '/src/Model/Server');
const MojangAPI = require(ROOT + '/src/Mojang-API');
const Users = {};

const file_path = ROOT + '/data/user.json';


/**
 * Gets user by it's  unique_id
 * @param {Number|String} name
 * @return {{}} User
 * @public
 */
Users.get = async (uuid) => {
    let users = await Users.getAll();
    let user = users.find(user => user.uuid == uuid) || null;
    await populateAssignedServers(user);
    return user;
};

/**
 * Gets user by it's unique_id
 * @param {Number|String} name
 * @return {{}} User
 * @public
 */
Users.getByMojangName = async (name) => await Users.get(await MojangAPI.getIdByName(name));

/**
 * Gets user by email
 * @param {Number|String} name
 * @return {{}} User
 * @public
 */
Users.getByEmail = async (email, populate = true) => {
    let users = await Users.getAll();
    let user = users.find(user => user.email == email) || null;
    if(populate){
        await populateAssignedServers(user);
    }
    return user;
};

/**
 * Gets user by it's  unique_id
 * @param {Number|String} name
 * @return {{}} User
 * @public
 */
Users.getByName = async (name, populate = true) => {
    let users = await Users.getAll();
    let user = users.find(user => user.name == name) || null;
    if(populate){
        await populateAssignedServers(user);
    }
    return user;
};

/**
 * Gets all users
 * @return {{}} Users
 * @public
 */
Users.getAll = async () => JSON.parse(await fs.readFile(file_path));

/**
 * Creates a new user
 * @param {Number|String} name
 * @param {String} hash
 * @param {Number[]} assigned_servers
 * @return {Promise} Created User
 * @public
 */
Users.create = async (uuid, name, hash, assigned_servers = []) => {
    let users = await Users.getAll();
    // VALIDATE UUID WITH MOJANG ACCOUNT UUID
    const Mojang_UUID = await MojangAPI.getIdByName(name);
    if(Mojang_UUID){
        if(uuid == Mojang_UUID){
            let user = {'name': name, 'uuid': uuid, hash: hash, 'assigned_servers': assigned_servers, 'create_date': Date.now()};
            users.push(user);
            // TODO add to whitelist of servers

            await save(users);
            return user;
        }
        else{
            throw new Error("Given name does not match with the given Mojang ID");
        }
    }
    else{
        throw new Error("No Mojang Account is linked to this username");
    }
};

/**
 * Gets user by it's  unique_id
 * @param {Number|String} name
 * @param {{}} data
 * @return {Promise} Status
 * @public
 */
Users.update = async (name, data) => {
    let users = await Users.getAll();
    let userIndex = users.findIndex(e => e.name == name);
    let user = users[userIndex];
    if(user){
        let options = ['email', 'login_method', 'hash', 'assigned_servers'];
        for(let key in data){
            if(!options.find(e => e == key)){
                delete data[key];
            }
        }
        if(data.email){
            let already_in_use = await Users.getByEmail(data.email);
            if(already_in_use && already_in_use.name != name){
                throw new Error(`Couldn't change email address: ${data.email} already in use by another user`);
            }
            else{
                if(data.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) == null){
                    throw new Error(`Couldn't change email address: ${data.email} is not a valid email address`);
                }
            }
        }
        users[userIndex] = Object.assign(user, data);
        return save(users);
    }
    else{
        throw new Error("No user found for: " + name);
    }
};

Users.whitelist = async (uuid)=>{
    const user = Users.get(uuid);
    // WHITELIST USER FOR HIS ASSIGNED SERVERS
};

Users.remove = async (uuid) =>{
    let users = await Users.getAll();
    let count = users.length;
    users = users.filter(e => e.uuid != uuid)
    if(users.length != count){
        await save(users);
        return true;
    }
    return false;
};

async function populateAssignedServers(user){
    if(user){
        for(let i = 0; i < user.assigned_servers.length; i++){
            try{
                user.assigned_servers[i].server = await Servers.get(user.assigned_servers[i].id);
            }
            catch(error){
                user.assigned_servers.splice(i, 1);
                pushLog("Couldn't find actual Servers as in assigned_servers", "Get User")
            }
        }
        user.assigned_servers = user.assigned_servers.filter(e => e.server != null);
    }
}

function save(users){
    return fs.writeFile(file_path, JSON.stringify(users, null, "\t"), {'encoding': 'utf-8'});
}

module.exports = Users;