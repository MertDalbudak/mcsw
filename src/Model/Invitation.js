const fs = require('fs/promises');
const crypto = require('crypto');
const ROOT = process.env.ROOT;
const Servers = require(ROOT + '/src/Model/Server')
const Users = require(ROOT + '/src/Model/Users')
const MojangAPI = require(ROOT + '/src/Mojang-API')
const Invitations = {};
const file_path = ROOT + '/data/invitation.json';

/**
 * Gets invitation by it's  unique_id
 * @param {Number|String} unique_id
 * @return {{}} Invitation
 * @public
 */
Invitations.get = async (id) => {
    let invitations = await Invitations.getAll();
    return invitations.find(invitation => invitation.id == id);
};

/**
 * Gets invitation by name
 * @param {Number|String} name
 * @return {[{}]} Invitation
 * @public
 */
 Invitations.getByName = async (name) => {
    let invitations = await Invitations.getAll();
    return invitations.filter(invitation => invitation.name == name);
};

/**
 * Gets invitation by invited_by
 * @param {Number|String} invited_by
 * @return {[{}]} Invitation
 * @public
 */
 Invitations.getByInvited = async (invited_by) => {
    let invitations = await Invitations.getAll();
    return invitations.filter(invitation => invitation.invited_by == invited_by);
};

/**
 * Gets all invitations
 * @param {Boolean} everything
 * @return {[{}]|{}} Invitations
 * @public
 */
Invitations.getAll = async (everything = false) =>{
    let document = JSON.parse(await fs.readFile(file_path));
    return everything ? document : document.list;
}

/**
 * Gets auto increment value only
 * @return {Number} Invitations
 * @public
 */
 Invitations.getAutoIncrement = require(file_path).auto_increment;

/**
 * Creates a new invitation
 * @param {Number|String} name
 * @param {{id, administrator, permissions}} assigned_servers
 * @return {Promise} Status
 * @public
 */
Invitations.create = async (name, invited_by, assigned_servers = []) => {
    // CHECK IF invited_by ALREADY EXISTIS
    invited_by = await Users.getByName(invited_by);
    if(invited_by != null){
        // GET USERS MOJANG UUID
        let uuid = "";
        try{
            uuid = await MojangAPI.getIdByName(name);
        }
        catch(error){
            console.error(error);
            throw new Error("No Mojang Account linked with the given name: " + name);
        }
        let assigned_servers_exists = false;
        for(let i = 0; i < assigned_servers.length; i++){
            if(isNaN(assigned_servers[i].id)){
                throw new Error(`Assigned Server identifier needs to be a Number. Expected a Number, ${typeof assigned_servers[i].id} given.`);
            }
            else{
                assigned_servers[i].id = parseInt(assigned_servers[i].id);
                if(await Servers.get(assigned_servers[i].id)){
                    if(invited_by.assigned_servers.find(e => e.id == assigned_servers[i].id).permissions.inviteOthers){
                        assigned_servers_exists = true;
                    }
                    else{
                        throw new Error(`No permission to invite other people for this server`);
                    }
                }
            }
        }
        if(assigned_servers_exists){
            // REORDER PERMISSION
            const assigned_servers_options = ['id', 'permissions']
            assigned_servers = assigned_servers.map(e => {
                e.permissions = {
                    'inviteOthers': e.inviteOthers ? true : false,
                    'start': e.start ? true : false,
                    'stop': e.stop ? true : false,
                    'restart': e.restart ? true : false,
                }
                for(let key in e){
                    if(!assigned_servers_options.find(option => option == key))
                        delete e[key];
                }
                return e;
            });
            let invitations = await Invitations.getAll(true);
            let hash = crypto.randomBytes(16).toString('hex');
            let invitation = {'id': invitations.auto_increment++, 'name': name, 'uuid': uuid, 'invited_by': invited_by.name, 'hash': hash, 'assigned_servers': assigned_servers, 'invitation_date': Date.now()};
            invitations.list.push(invitation);
            await fs.writeFile(file_path, JSON.stringify(invitations, null, "\t"), {'encoding': 'utf-8'});
            return invitation;
        }
        else{
            throw new Error('Assigned Server does not exists');
        }
    }
    else{
        throw new Error("Inviting name does't exists");
    }
};

/**
 * Gets invitation by it's  unique_id
 * @param {Number|String} name
 * @param {{}} data
 * @return {Promise} Invitation
 * @public
 */
Invitations.update = async (id, data, new_hash = false) => {
    let invitations = await Invitations.getAll(true);
    let options = ['invited_by', 'assigned_servers'];
    for(let key in data){
        if(options.hasOwnProperty(key)){
            delete data[key];
        }
    }
    if(new_hash){
        data['hash'] = crypto.randomBytes(16).toString('hex');
    }
    let invitation = invitations.list.find(invite => invite.id == id);
    Object.assign(invitation, data);
    
    await fs.writeFile(file_path, JSON.stringify(invitations, null, "\t"), {'encoding': 'utf-8'});
    return invitation;
};

/**
 * Gets invitation by it's id
 * @param {Number} id
 * @return {void}
 * @public
 */
 Invitations.remove = async (id) => {
    let invitations = await Invitations.getAll(true);
    invitations.list = invitations.list.filter(invitation => invitation.id != id);
    return fs.writeFile(file_path, JSON.stringify(invitations), {'encoding': 'utf-8'});
};


module.exports = Invitations;