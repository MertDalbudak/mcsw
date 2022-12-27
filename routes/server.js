const router = require('express').Router();
const ping = require('minecraft-server-util');
const Users = require('../src/Model/Users');
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

router.get('/events-rewards', function(req, res) {
    res.ejsRender('events-rewards.ejs', (err, file) => {
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

router.get('/:id/events-rewards', function(req, res) {
    res.end('gifts for' + req.params.id);
});


module.exports = router;