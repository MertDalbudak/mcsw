const router = require('express').Router();
const bcrypt = require('bcrypt');
const Users = require('../src/Model/Users');
const Servers = require('../src/Model/Server');
const Invitations = require('../src/Model/Invitation');
const Mcsm = require('../src/Mcsm');
const pushLog = require('../lib/pushLog');

// SECURITY
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || 10);


router.all('*', function(req, res, next){
    if(req.user == null){
        res.ejsRender('404.ejs', (err, file) => {
            res.send(file);
        });
    }
    else{
        next();
    }
});

router.get('/my-server', async function(req, res) {
    let slot_data = [];
    try{
        slot_data = await Mcsm.getNetworkSlots()
        console.log(slot_data);
    }
    catch(error){
        pushLog(error, "MCSM");
    }
    finally{
        res.ejsRender('my-server.ejs', {'slots': slot_data}, (err, file) => {
            if(err == null){
                res.clearCookie('msgs');
                res.send(file);
            }
            else{
                console.error(err);
                pushLog(err, "rendering my-server");
                res.sendStatus(500);
            }
            res.end();
        });
    }
});

router.post('/my-server/:slot_uid/:server_id/start', async function(req, res) {
    const server_id = req.params.server_id;
    const slot = await Mcsm.getStatus(req.params.slot_uid);
    if(slot){
        if(slot.server == null){
            const user_permission = req.user.assigned_servers.find(s => (s.id == server_id && s.permissions.start));
            if(user_permission){
                // REQUEST SERVER STOP
                Mcsm.startServer(slot.uid, server_id, (error, data)=>{
                    console.log(error, data);
                });
                res.json({
                    'error': null,
                    'data': {},
                    'message': "Starting requested"
                });
            }
            else{
                res.statusCode = 403;
                res.json({
                    'error': "You are not allowed to start this server",
                    'data': {},
                    'message': "Failed"
                });
            }
        }
        else{
            res.statusCode = 400;
            res.json({
                'error': "Slot already has a server assigned.",
                'data': {},
                'message': "Failed"
            });
        }
    }
    else{
        res.statusCode = 400;
        res.json({
            'error': "Unfortunately there is no slot running currently to run this server",
            'data': {},
            'message': "Failed"
        });
    }
});

router.post('/my-server/:slot_uid/:server_id/restart', async function(req, res) {
    const server_id = req.params.server_id;
    const slot = await Mcsm.getStatus(req.params.slot_uid);
    if(slot){
        if(slot.server != null && slot.server.id == server_id){
            const user_permission = req.user.assigned_servers.find(s => (s.id == server_id && s.permissions.restart));
            if(user_permission){
                // REQUEST SERVER STOP
                Mcsm.restartServer(slot.uid, server_id, (error, data)=>{
                    // DO STUFF
                });
                res.json({
                    'error': null,
                    'data': {},
                    'message': "Restart requested"
                });
            }
            else{
                res.statusCode = 403;
                res.json({
                    'error': "You are not allowed to start this server",
                    'data': {},
                    'message': "Failed"
                });
            }
        }
        else{
            res.statusCode = 400;
            res.json({
                'error': "Cannot restart server which is not running already.",
                'data': {},
                'message': "Failed"
            });
        }
    }
    else{
        res.statusCode = 400;
        res.json({
            'error': "Unfortunately there is no slot running currently to run this server",
            'data': {},
            'message': "Failed"
        });
    }
});


router.post('/my-server/:id/stop', async function(req, res) {
    const slot = await Mcsm.getStatus(req.params.id);
    if(slot){
        const server = slot.server;
        const user_permission = req.user.assigned_servers.find(s => (s.id == server.id && s.permissions.stop));
        if(user_permission){
            if(server.players.online == 0){
                // REQUEST SERVER STOP
                Mcsm.stopServer(slot.uid);
                res.json({
                    'error': null,
                    'data': {},
                    'message': "Stopping requested"
                });
            }
            else{
                res.statusCode = 400;
                res.json({
                    'error': "Server is not empty",
                    'data': {},
                    'message': "Failed"
                });
            }
        }
        else{
            res.statusCode = 403;
            res.json({
                'error': "You are not allowed to stop this server",
                'data': {},
                'message': "Failed"
            });
        }
    }
    else{
        res.statusCode = 400;
        res.json({
            'error': "No Server found running",
            'data': {},
            'message': "Failed"
        });
    }
});

router.get('/invites', async function(req, res){
    let invited_by_user = await Invitations.getByInvited(req.user.name);
    res.ejsRender('invites', {'invites': invited_by_user}, (err, file)=>{
        if(err == null){
            res.clearCookie('msgs');
            res.send(file);
        }
        else{
            console.error(err);
            pushLog(err, "rendering invites");
            res.sendStatus(500);
        }
        res.end();
    });
});

router.delete('/invites/delete/:id', async function(req, res){
    let invite = await Invitations.get(req.params.id);
    if(invite != null && invite.invited_by == req.user.name){
        Invitations.remove(invite.id).then(()=>{
            pushLog("Invitation was removed", "Delete Invitation")
            res.json({error: null, message: "Deletion successful"});
        }, (error)=>{
            pushLog(error, "Delete Invitation")
            res.json({error: "Something went wrong", message: null});
        });
    }
    else{
        res.status(403);
        pushLog("No such Invitation or no permission", "Delete Invitation");
        res.json({error: "Either there is no invitation with this id or you do not have permission", data: {}});
    }
});

router.post('/invite', async function(req, res) {
    if(Array.isArray(req.body.server) && typeof req.body.user == "string"){
        let invited_by_user = await Invitations.getByInvited(req.user.name);
        let user_invitation = invited_by_user.find(invitation => invitation.name == req.body.user);
        if(user_invitation){
            Invitations.update(user_invitation.id, {'assigned_servers': req.body.server}, true).then(async (invitation) => {
                res.json({
                    error: null,
                    data: {
                        'hash': invitation.hash
                    },
                    'message': `Der bestehende Einladungstoken wurde für ${invitation.name} erneut generiert.`
                });
            }).catch((error)=> {
                res.json({
                    error: error,
                    data: null
                });
            });
        }
        else{
            try{
                const invite = await Invitations.create(req.body.user, req.user.name, req.body.server);
                res.json({
                    error: null,
                    data: {
                        'hash': invite.hash
                    },
                    'message': `Ein Einladungstoken wurde für ${req.body.user} generiert!`,
                });
            }
            catch(error){
                console.error(error);
                res.json({
                    error: error.toString(),
                    data: null
                });
            }
        }
    }
    else{
        res.sendStatus(400);
        res.end('BAD REQUEST')
    }
});

router.get('/settings', function(req, res) {
    res.ejsRender('settings.ejs', (err, file) => {
        if(err == null){
            res.clearCookie('msgs');
            res.send(file);
        }
        else{
            pushLog(err, "rendering settings");
            res.sendStatus(500);
        }
        res.end();
    });
});

router.post('/update', async (req, res) =>{
    const email_change = req.body.email != req.user.email, username_change = req.body.username != req.user.name;
    try{
        await Users.update(req.user.name, {'email': req.body.email});
        if(email_change){
            // res.newMessage('warn', "We've sent you an confirmation mail. Please open the link in the email to confirm the change!");
        }
        res.newMessage('success', "Profile updated");
    }catch(error){
        pushLog(error.toString(), "UPDATE PROFILE");
        res.newMessage('error', "Something went wrong");
    }
    res.redirect('/profile/settings');
});

router.post('/security/updatePassword', async (req, res) =>{
    if(req.body.password == undefined || req.body.password == ""){
        res.newMessage('error', "Password cannot be empty");
        res.redirect('/profile/settings');
        return;
    }
    else{
        if(!(await bcrypt.compare(req.body.password, req.user.hash))){
            res.newMessage('error', "Wrong password");
            res.redirect('/profile/settings');
            return;
        }
    }
    if(req.body.new_password == undefined){
        res.newMessage('error', "New password is mandatory");
        res.redirect('/profile/settings');
        return;
    }
    if(req.body.new_password.length < 6){
        res.newMessage('error', "New password does not fulfill password criterias");
        res.redirect('/profile/settings');
        return;
    }
    if(req.body.new_password == req.body.password_repeat){
        try{
            const salt = await bcrypt.genSalt(SALT_ROUNDS);
            const hash = await bcrypt.hash(req.body.new_password, salt);
            await Users.update(req.user.name, {'hash': hash});
            res.newMessage('success', "Password updated successfully");
        }catch(error){
            pushLog(error.toString(), "Update Password");
            res.newMessage('error', "Something went wrong. Password couldn't be updated");
        }
        
    }
    else{
        res.newMessage('error', "Passwords are not identical");
    }
    res.redirect('/profile/settings');
});

router.post('/security/update', async (req, res) =>{
    const user_data = {};
    const login_methods = ['username', 'email'];
    if(login_methods.find(e => e == req.body.login_method) && req.user.login_method != req.body.login_method){
        user_data['login_method'] = req.body.login_method;
    }
    try{
        await Users.update(req.user.name, user_data);
        res.newMessage('success', "Security settings updated");
    }catch(error){
        pushLog(error.toString(), "UPDATE PROFILE");
        res.newMessage('error', "Something went wrong");
    }
    res.redirect('/profile/settings');
});

router.post('/delete', async (req, res) =>{
    if(req.body.password == undefined || req.body.password == ""){
        res.newMessage('error', "Password cannot be empty");
        res.redirect('/profile/settings');
        return;
    }
    else{
        if(!(await bcrypt.compare(req.body.password, req.user.hash))){
            res.newMessage('error', "Wrong password");
            res.redirect('/profile/settings');
            return;
        }
    }
    try{
        await Users.remove(req.user.uuid);
        res.newMessage('success', "Profile deleted");
        // TODO CREATE MESSAGE IN SESSION
        req.session.destroy((err)=>{
            if(err != null){
                pushLog(err.toString(), "Logout");
            }
            res.redirect('/');
        });
    }catch(error){
        pushLog(error.toString(), "DELETE PROFILE");
        res.newMessage('error', "Something went wrong");
        res.redirect('/profile/settings');
    }
});

module.exports = router;