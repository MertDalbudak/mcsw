const fs = require('fs/promises');
const crypto = require('crypto');
const Servers = require(process.env.ROOT + '/src/Model/Server')
const Invitations = {};
const file_path = process.env.ROOT + '/data/invitation.json';

/**
 * Gets invitation by it's  unique_id
 * @param {Number|String} unique_id
 * @return {{}} User
 * @public
 */
Invitations.get = async (id) => {
    let invitations = await Invitations.getAll();
    return invitations.find(invitation => invitation.id == id);
};

/**
 * Gets invitation by user
 * @param {Number|String} user
 * @return {[{}]} Users
 * @public
 */
 Invitations.getByUser = async (user) => {
    let invitations = await Invitations.getAll();
    return invitations.filter(invitation => invitation.user == user);
};

/**
 * Gets invitation by invited_by
 * @param {Number|String} invited_by
 * @return {[{}]} Users
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
 * @param {Number|String} user
 * @param {Number[]} assigned_server
 * @return {Promise} Status
 * @public
 */
Invitations.create = async (user, invited_by, assigned_server = []) => {
    let assigned_server_exists = true;
    for(let i = 0; i < assigned_server.length; i++){
        if(isNaN(assigned_server[i])){
            throw new Error(`Assigned Server identifier needs to be a Number. Expected a Number, ${typeof assigned_server[i]} given.`);
        }
        else{
            assigned_server[i] = parseInt(assigned_server[i]);
            if(await Servers.get(assigned_server[i]) == null)
                assigned_server_exists = false;
        }
    }
    if(assigned_server_exists){
        let invitations = await Invitations.getAll(true);
        let hash = crypto.randomBytes(16).toString('hex');
        let invitation = {'id': invitations.auto_increment++, 'user': user, 'invited_by': invited_by, 'hash': hash, 'assigned_server': assigned_server, 'invitation_date': Date.now()};
        invitations.list.push(invitation);
        await fs.writeFile(file_path, JSON.stringify(invitations), {'encoding': 'utf-8'});
        return invitations.auto_increment - 1;
    }
    else{
        throw new Error('Assigned Server does not exists');
    }
};

/**
 * Gets invitation by it's  unique_id
 * @param {Number|String} user
 * @param {{}} data
 * @return {Promise} Status
 * @public
 */
Invitations.update = async (id, data, new_hash = false) => {
    let invitations = await Invitations.getAll(true);
    let options = ['invited_by', 'assigned_server'];
    for(let key in data){
        if(options.find(option => option == key) == undefined){
            delete data[key];
        }
    }
    if(new_hash){
        data['hash'] = crypto.randomBytes(16).toString('hex');
    }

    Object.assign(invitations.list.find(invite => invite.id == id), data);
    
    return fs.writeFile(file_path, JSON.stringify(invitations), {'encoding': 'utf-8'});
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