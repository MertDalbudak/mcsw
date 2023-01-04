const router = require('express').Router();
const ping = require('minecraft-server-util');
const Users = require('../src/Model/Users');
const Servers = require('../src/Model/Server');
const Invitations = require('../src/Model/Invitation');
const pushLog = require('../lib/pushLog');

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

router.get('/my-server', function(req, res) {
    let server_data = null;
    ping(process.env.MC_SERVER_IP, parseInt(process.env.MC_SERVER_PORT), (error, sd) => {
        if (error == null){
            server_data = sd;
        }
        res.ejsRender('my-server.ejs', {'server_data': server_data}, (err, file) => {
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
    });
});

router.post('/my-server/:id/start', function(req, res) {
    const server = req.user.assigned_server.find(s => s.id == req.params.id);
    if(server){
        ping(process.env.MC_SERVER_IP, parseInt(process.env.MC_SERVER_PORT), (error, sd) => {
            if (error == null){
                if(server.name == sd.descriptionText){
                    res.json({
                        'error': "Server is already running",
                        'message': "Failed"
                    });
                }
                else{
                    if(sd.onlinePlayers == 0){
                        res.json({
                            'error': null,
                            'message': "Another server is currently running. It will stopping shortly. Your server will soon start. Be patient."
                        });
                    }
                    else{
                        res.json({
                            'error': "Another server currently running and people are still playing. Check soon again.",
                            'message': "Failed"
                        });
                    }
                }
            }
            else{
                res.json({
                    'error': "An error occured, try again later",
                    'message': "Failed"
                });
            }
        });
    }
    else{
        res.json({
            'error': "You are not allowed to start this server",
            'message': "Failed"
        });
    }
    res.end();
});

router.post('/my-server/:id/stop', function(req, res) {
    const server = req.user.assigned_server.find(s => s.id == req.params.id);
    if(server){
        ping(process.env.MC_SERVER_IP, parseInt(process.env.MC_SERVER_PORT), (error, sd) => {
            if (error == null){
                if(server.name == sd.descriptionText){
                    if(sd.onlinePlayers == 0){
                        // REQUEST SERVER STOP

                        res.json({
                            'error': null,
                            'message': "Stopping requested"
                        });
                    }
                    else{
                        res.json({
                            'error': "Server is not empty",
                            'message': "Failed"
                        });
                    }
                }
                else{
                    res.json({
                        'error': "Another server is currently running",
                        'message': "Failed"
                    });
                }
            }
            else{
                res.json({
                    'error': "An error occured, try again later",
                    'message': "Failed"
                });
            }
        });
    }
    else{
        res.json({
            'error': "You are not allowed to stop this server",
            'message': "Failed"
        });
    }
});

router.get('/invites', function(req, res){
    let invited_by_user = Invitations.getByInvited(req.user.name);
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

router.delete('/invites/delete/:id', function(req, res){
    let invite = Invitations.get(req.params.id);
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
        res.json({error: "Either there is no invitation with this id or you do not have permission", message: null});
    }
});

router.post('/invite', function(req, res) {
    if(Array.isArray(req.body.server) && typeof req.body.user == "string"){
        let invited_by_user = Invitations.getByInvited(req.user.name);
        let user_invitation = invited_by_user.find(invitation => invitation.user == req.body.user);
        if(user_invitation){
            Invitations.update(user_invitation.id, {'assigned_server': req.body.server}, true).then((id) => {
                res.json({
                    error: null,
                    data: {
                        'message': `Der bestehende Einladungstoken wurde für ${req.body.user} erneut generiert.`,
                        'hash': Invitations.get(user_invitation.id).hash
                    }
                });
            }).catch((error)=> {
                res.json({
                    error: error,
                    data: null
                });
            });
        }
        else{
            Invitations.create(req.body.user, req.user.name, req.body.server).then((id) => {
                res.json({
                    error: null,
                    data: {
                        'message': `Ein Einladungstoken wurde für ${req.body.user} generiert!`,
                        'hash': Invitations.get(id).hash
                    }
                });
            }).catch((error)=> {
                res.json({
                    error: error,
                    data: null
                });
            });
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


module.exports = router;