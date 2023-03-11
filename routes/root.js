const router = require('express').Router();
const Mcsm = require('../src/Mcsm')
const pushLog = require('../lib/pushLog');

router.get('/', async function(req, res) {
    let slots = null;
    try{
        slots = await Mcsm.getAllSlots();
        console.log(slots);
        console.log(slots[0].server.players);
    }
    catch(error){
        pushLog(error, "MC Serve Query")
    }
    finally{
        res.ejsRender('home.ejs', {'slots': slots}, (err, file) => {
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
    }
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

router.get('/code-of-conduct', function(req, res){
    // TODO CREATE MESSAGE IN SESSION
    res.ejsRender('code-of-conduct.ejs', (err, file) => {
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