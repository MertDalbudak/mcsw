const ngiN = require('../../lib/ngiN');
const Session = require('./session.js');
const ping = require('minecraft-server-util');
const http = require('http')
const https = require('https')
const fs = require('fs');
const mime = require('mime-types');
//const url = require('url')
//const qs = require('querystring');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const app = new ngiN(__dirname);
app.routes = require(app.root + 'routes.js');

const options = {
    key: fs.readFileSync(app.root + '../../keys/privkey.pem'),
    cert: fs.readFileSync(app.root + '../../keys/cert.pem')
};

app.dictionary = {};
let languages = app.getFileNamesOfDirectory(app.resource_path + "language");
for(let i = 0; i < languages.length; i++){
    app.dictionary[app.getBaseName(languages[i], ".json")] = app.getFile(app.resource_path + "language/" + languages[i]);
}

function parseCookies(rc) {
    var list = {};
    rc && rc.split(';').forEach(function( cookie ) {
        let parts = cookie.split('=');
        let value = decodeURI(parts.join('='));
        value = value.substring(value.indexOf("=") + 1);

        // IF SESSION
        if(value.indexOf('ngiNSession:') > -1){
            let session = Session.find(value.replace('ngiNSession:', ""));
            if(session != undefined)
                value = Session.find(value.replace('ngiNSession:', "")).value;
            else
                return;
        }
        list[parts.shift().trim()] = value;
    });

    return list;
}

function error404(req, res){
    let user = req.cookies['user'];
    let users = app.getFile(app.root + 'data/user.json');
    user = users[user];
    res.statusCode = 404;
    app.ejsRenderFile(app.resource_path + '404.ejs', {'user': user}, function(err, data){
        if(err == null){
            res.end(data);
        }
    });
}

const server = https.createServer(options, function(req, res){
    let path_match = false;
    let path = req.url.match('^[^?]*')[0].replace(/\/+$/,'') || "/";  // GET PATH OF REQEST
    console.log(path);
    let body = '';
    if(req.method == "POST" || req.method == "PUT"){    // GET BODY DATA IF REQUEST METHOD IS POST OR PUT
        req.on('data', function (data) {
            body += data;
        });
    }
    req.cookies = parseCookies(req.headers.cookie); // PARSE COOKIES
    app.pushLog(req.url + ' by: ' + req.connection.remoteAddress, 'Requested URL'); // LOG REQUEST

    // REQUEST HANDLER
    if(/^\/css|\/js/.test(path)){
        path_match = true;
        let css_file = app.getFile(app.public_path + req.url, true);
        if(css_file !== false){
            if(/^\/css/.test(req.url))
                res.setHeader('Content-Type', 'text/css')
            if(/^\/js/.test(req.url))
                res.setHeader('Content-Type', 'application/js')
            res.end(css_file);
        }
        else{
            res.statusCode = 404;
            res.end();
        }
    }
    if(path == '/favicon.ico'){
        path_match = true;
        fs.createReadStream(app.resource_path + 'icon/favicon.ico').pipe(res);
    }
    if(path.indexOf('/img/') == 0){
        path_match = true;
        fs.exists(app.public_path + req.url, (exists)=>{
            if(exists){
                res.setHeader('Content-Type', mime.contentType(app.getFileExtension(req.url)));
                fs.createReadStream(app.public_path + req.url).pipe(res);
            }
            else {
                res.statusCode = 404;
                res.end("404");
            }
        });
    }
    if(path.indexOf('/font/') == 0){
        path_match = true;
        fs.exists(app.public_path + req.url, (exists)=>{
            if(exists){
                res.setHeader('Content-Type', mime.contentType(app.getFileExtension(req.url)));
                fs.createReadStream(app.public_path + req.url).pipe(res);
            }
            else {
                res.statusCode = 404;
                res.end("404");
            }
        });
    }
    if(path == '/'){
        path_match = true;
        let user = req.cookies['user'];
        let server_data;
        if(user != undefined){
            let users = app.getFile(app.root + 'data/user.json');
            user = users[user];
        }
        else{
            res.setHeader('Set-Cookie', "user=;max-age=-1");
        }
        ping(req.headers['host'], 25565, (error, sd) => {
            if (error == null){
                server_data = sd;
            }
            app.ejsRenderFile(app.resource_path + 'index.ejs', {'user': user, 'server_data': server_data}, function(err, data){
                if(err == null){
                    res.end(data);
                }
            });
        });
    }
    if(path == '/my-server'){
        path_match = true;
        let user = req.cookies['user'];
        if(user != undefined){
            let users = JSON.parse(app.getFile(app.root + 'data/user.json', true));
            let servers = JSON.parse(app.getFile(app.root + 'data/server.json', true));
            user = users[user];
            user.assigned_server = servers.filter(element => user.assigned_server.find(e => e == element.id));
            app.ejsRenderFile(app.resource_path + 'my-server.ejs', {'user': user}, function(err, data){
                if(err == null){
                    res.end(data);
                }
            });
        }
        else{
            res.setHeader('Set-Cookie', "user=;max-age=-1");
            res.writeHead(302, {
                'Set-Cookie': "user=;max-age=0",
                'Location': '/'
            });
            res.end();
        }
    }
    if(req.url == '/help'){
        path_match = true;
        let user = req.cookies['user'];
        if(user != undefined){
            let users = app.getFile(app.root + 'data/user.json');
            user = users[user];
        }
        else
            user = undefined;
        app.ejsRenderFile(app.resource_path + 'help.ejs', {'user': user}, function(err, data){
            if(err == null){
                res.end(data);
            }
        });
    }
    if(req.url == '/login'){
        path_match = true;
        if(req.method == 'POST'){
            req.on('end', function () {
                let data = JSON.parse(body);
                let response = {
                    'error': null,
                    'data': null
                };
                let users = app.getFile(app.root + 'data/user.json');
                let user_id = users.findIndex(element => (element['name'] == data.user));
                if(user_id == -1){
                    response['error'] = "Benutzername oder Passwort falsch";
                }
                else{
                    let hash = users[user_id].hash;
                    bcrypt.compare(data.password, hash, function(err, result) {
                        if(result){
                            response['data'] = true;
                            res.setHeader('Set-Cookie', new Session("user", user_id, (24 * 60 * 60)).cookieString);
                        }
                        else {
                            response['error'] = "Benutzername oder Passwort falsch";
                        }
                        res.end(JSON.stringify(response));
                    });
                }
                if(response['error'] != null || response['data'] != null){
                    res.end(JSON.stringify(response));
                }
            });
        }
        else{
            res.statusCode = 403;
            res.end('METHOD NOT ALLOWED');
        }
    }
    if(req.url == '/logout'){
        path_match = true;
        if(req.cookies['user'] != undefined){   // UNSET COOKIE
            let session = Session.findByNameValue('user', req.cookies['user']);
            if(session != undefined)
                session.remove();
        }
        res.writeHead(302, {
            'Set-Cookie': "user=;max-age=0",
            'Location': '/'
        });
        res.end();
    }
    if(req.url == '/register'){
        path_match = true;
        if(req.method == 'POST'){
            let body = '';
            req.on('data', function (data) {
                body += data;
            });
            req.on('end', function () {
                let data = JSON.parse(body);
                let response = {
                    'error': null,
                    'data': null
                };
                let users = app.getFile(app.root + 'data/user.json');
                if(users.find(element => (element['name'] == data.user))){
                    // AN USER WITH THE SAME USERNAME ALREADY EXISTS
                    app.pushLog('Register failed, user: ' + data.user + ' already registered', "Register User");
                    response['error'] = "Registrierung fehlgeschlagen. Benutzer existiert bereits";
                }
                else {
                    let invitations = app.getFile(app.root + 'data/invitation.json');
                    invitation = invitations.find(element => (element['user'] == data.user && element['hash'] == data.invitation_code));
                    if(invitation == undefined){
                        // NO INVITATION FOUND
                        app.pushLog('Register failed, no invitation found for user: ' + data.user, "Register User");
                        response['error'] = 'Registrierung fehlgeschlagen. Kein Einladungscode gefunden für Benutzer: ' + data.user;
                    }
                    else {
                        if(data.password.length < 6){
                            // PASSWORD ISN'T LONG ENOUGH
                            app.pushLog('Register failed, password is too short: ' + data.user, "Register User");
                            response['error'] = 'Registrierung fehlgeschlagen. Passwort zu kurz';
                        }
                        else{
                            if(data.password !== data.password_repeat){
                                // PASSWORDS AREN'T THE SAME
                                app.pushLog('Register failed, password is not the same: ' + data.user, "Register User");
                                response['error'] = 'Registrierung fehlgeschlagen. Passwörter stimmen nicht überein';
                            }
                            else {
                                bcrypt.hash(data.password, saltRounds, function(err, hash) {
                                    // Store hash in your password DB.
                                    let users = app.getFile(app.root + 'data/user.json');
                                    users.push({'name': data.user, 'hash': hash, 'assigned_server': invitation.assigned_server, 'create_date': Date.now()});
                                    if(app.setFile(app.root + 'data/user.json', JSON.stringify(users), 'utf-8', true))
                                        response['data'] = "Registrierung erfolgreich";
                                    else 
                                        response['error'] = "Registrierung fehlgeschlagen. Irgendwas ist schief gelaufen";
                                    res.end(JSON.stringify(response));
                                });
                            }
                        }
                    }
                    
                }
                if(response['error'] != null || response['data'] != null){
                    res.end(JSON.stringify(response));
                }
            });
        }
        else{
            res.statusCode = 403;
            res.end('METHOD NOT ALLOWED');
        }
    }
    if(path_match == false){
        error404(req, res);
    }
    const error_timeout = setTimeout(()=> { // IF REQUEST DOES TAKE MORE THAN 10 SECONDS RESPONSE, TIMEOUT WITH ERROR 404
        error404(req, res);
    }, 10000);
    res.on('close', function(){
        clearTimeout(error_timeout);
    });
}).listen(443);

http.createServer(function (req, res) {
    app.pushLog("HTTP://" + req.url + ' by: ' + req.connection.remoteAddress, 'Requested URL');
    res.writeHead(301, {"Location": "https://" + req.headers['host'] + req.url});
    res.end();
}).listen(80);
