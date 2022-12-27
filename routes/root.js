require('dotenv').config();

const router = require('express').Router();
const ping = require('minecraft-server-util');
const pushLog = require('../lib/pushLog');

router.get('/', function(req, res) {
    let server_data = null;
    ping(process.env.MC_SERVER_IP, parseInt(process.env.MC_SERVER_PORT), (error, sd) => {
        if (error == null){
            server_data = sd;
        }
        res.ejsRender('home.ejs', {'server_data': server_data}, (err, file) => {
            if(err == null){
                res.clearCookie('msgs');
                res.send(file);
            }
            else{
                pushLog(err, "rendering home");
                res.sendStatus(500);
            }
            res.end();
        });
    });
});

router.get('/faq', function(req, res){
    // TODO CREATE MESSAGE IN SESSION
    res.ejsRender('faq.ejs', (err, file) => {
        if(err == null){
            res.clearCookie('msgs');
            res.send(file);
        }
        else{
            pushLog(err, "rendering home");
            res.sendStatus(500);
        }
        res.end();
    });
});

router.get('/logout', function(req, res){
    // TODO CREATE MESSAGE IN SESSION
    req.session.destroy((err)=>{
        if(err != null){
            pushLog(err, "Logout");
        }
        else
            res.newMessage('success', "signOut_message");
        res.redirect(302, '/');
    })
});

module.exports = router;