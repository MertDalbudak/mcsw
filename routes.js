/*
    data holds incoming request data
    data.headers
    data.cookies
    data.param
    data.get
    data.put
    data.post
    data.delete
*/

const Session = require('./session.js');
const qs = require('querystring');
const fs = require('fs');
const mime = require('mime-types');


module.exports = function(req, res){
    let data;
    let path = req.url.match('^[^?]*')[0].replace(/\/+$/,'') || "/";  // GET PATH OF REQEST
    console.log(path);
    if(req.method == "POST" || req.method == "PUT"){    // GET BODY DATA IF REQUEST METHOD IS POST OR PUT
        req.on('data', function (data) {
            data[req.method] += data;
        });
    }
    data.cookies = parseCookies(req.headers.cookie); // PARSE COOKIES
    data.get = qs.parse(req.url);
    data.headers = req.headers;
    if(routes.hasOwnPorperty(path)){
        routes[path](data, res);
        return true
    }
    return false;
};

const routes = {
    "/": function(data, res){
        let user = data.cookies['user'];
        let server_data;
        if(user != undefined){
            let users = this.getFile(this.root + 'data/user.json');
            user = users[user];
        }
        else{
            res.setHeader('Set-Cookie', "user=;max-age=-1");
        }
        ping(req.headers['host'], 25565, (error, sd) => {
            if (error == null){
                server_data = sd;
            }
            this.ejsRenderFile(this.resource_path + 'index.ejs', {'user': user, 'server_data': server_data}, function(err, data){
                if(err == null){
                    res.end(data);
                }
            });
        });
    }
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