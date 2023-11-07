// LOAD CONFIG FILE
require('dotenv').config();

// REQUIRE DEPENDECIES
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const csrf = require('csurf');
const fileUpload = require('express-fileupload');
const bcrypt = require('bcrypt');

// SET CONST VARIABLE
const NODE_ENV = process.env.NODE_ENV;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || 10);

// SET PROCESS ENV VARIABLES
process.env.ROOT = path.resolve(__dirname);
process.env.ROUTES_PATH = path.join(process.env.ROOT, "routes");
process.env.STRINGS_PATH = path.join(process.env.ROOT, "strings");
process.env.PUBLIC_PATH = path.join(process.env.ROOT, "public");
process.env.PUBLIC_STATIC = path.join(process.env.PUBLIC_PATH, "static");
process.env.TEMPLATE_PATH = path.join(process.env.PUBLIC_PATH, "template");
process.env.TEMPLATE_LAYOUT_PATH = path.join(process.env.TEMPLATE_PATH, "layout");

// REQUIRE CUSTOM DEPENDENCIES
const ejsRender = require('./lib/ejsRender');
const pushLog = require('./lib/pushLog');
const Users = require('./src/Model/Users');
const Invitations = require('./src/Model/Invitation')
//const SendMail = require('./src/SendMail');


const ALLOWED_LANGUAGES = require('./config/app').languages;
const SUPPORTED_LANGUAGES = fs.readdirSync(process.env.STRINGS_PATH).map(e => path.parse(e).name);
const FILE_NAME_LENGTH = 32;
const COOKIE_OPTIONS = {
    'path': "/",
    'signed': true,
    'httpOnly': true,
    'secure': NODE_ENV == "production",
    'sameSite': "strict"
};
const SESSION_OPTIONS = {
    'name': "usid",
    'resave': false,
    'saveUninitialized': false,
    'secret': process.env.SESSION_SECRET,
    'cookie': {
        'path': "/",
        'maxAge': parseInt(process.env.SESSION_MAX_AGE) || false,
        'httpOnly': true, 
        'secure': NODE_ENV == "production",
        'sameSite': "strict"
    },
    'store': require('./src/Model/Session')(session.Store),
    'proxy': true
};
const CSRF_OPTIONS = { cookie: true };

const app = express();

// TRUST PROXY WHEN PRODUCTION
if (NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

/**
 * Gets the first accepted language
 * @param {string} remote_lang Language
 * @return {Object}
 * @public
 */
function acceptedLanguage(remote_lang){
    remote_lang = remote_lang.toLowerCase();
    const _default = ALLOWED_LANGUAGES.find(allowed => SUPPORTED_LANGUAGES.find(available => available.toLowerCase() == allowed.toLowerCase()));
    try{
        remote_lang = remote_lang.split(',').map(s => s.substr(0, 2));
        for(let i = 0; i < remote_lang.length; i++){
            const lang = ALLOWED_LANGUAGES.find(e => e.substr(0, 2).toLowerCase() == remote_lang[i]);
            if(lang != undefined)
                return lang;
        }
        pushLog(`Remote's accepted language is not allowed or not supported.`, 'Remote', 'request');
    }catch {
        pushLog(`Cannot understand remote's accepted language.`, 'Remote', 'request');
    }
    pushLog(`Setting ${_default} as language.`, 'Remote', 'request');
    return _default;
}

app.use(express.static(process.env.PUBLIC_STATIC));

app.use(express.urlencoded({
    extended: true
}));

// USE SESSION MIDDLEWARE
app.use(session(SESSION_OPTIONS));
// USE JSON PARSE MIDDLEWARE
app.use(express.json());
// USE COOKIE-PARSER MIDDLEWARE
app.use(cookieParser(process.env.COOKIE_SECRET));
// USE CSRF MIDDLEWARE
app.use(csrf(CSRF_OPTIONS));
app.use(function(err, req, res, next) {
    console.error(err);
    if (err.code !== 'EBADCSRFTOKEN') return next(err)

    // handle CSRF token errors here
    res.sendStatus(403);
    res.end();
});

/////////// CUSTOM MIDDLEWARE ///////////

app.use(async function(req, res, next){
    //////////// SET LANGUAGE ////////////

    req.language = req.signedCookies['lang'] || acceptedLanguage(req.headers['accept-language'] || "");

    //////////// SET LANGUAGE ////////////


    ////////////// MESSAGES //////////////

    req.messages = [];
    if(req.signedCookies['msgs'] != undefined){
        try{
            req.messages = JSON.parse(req.signedCookies['msgs']);
            if(Array.isArray(req.messages) == false)
                pushLog("Cannot understand messages", "Parse Messages")
        }
        catch(error){
            pushLog(error);
            req.messages = [];
        }
    }
    /**
     * Create a new message which will be shown when a new page will be rendered
     * @param {'success'|'warn'|'error'} type Message type
     * @param {string} subject Subject
     * @param {string} text Detailed message
     * @returns {void} Void, returns undefined
     * @overwrite
    */
    res.newMessage = function (type, subject, text = ""){
        req.messages.push({'type': type, 'subject': subject, 'text': text});
        // maxAge 5min: 5(min) * 60(sec) * 1000(millisec.) = 300000
        res.cookie('msgs', JSON.stringify(req.messages), {...COOKIE_OPTIONS, 'maxAge': 300000});
    };

    ////////////// MESSAGES //////////////

    /////// VALIDATE LOGIN STATUS ///////
    req.user = null;
    req.check_user_status = new Promise(async (resolve, reject)=> {
        if(req.session != undefined){
            if(req.session.username != undefined){
                const user = await Users.getByName(req.session.username);
                if(user){
                    req.user = user;
                    resolve();
                }
                else{
                    reject();
                }
            }
            else{
                reject();
            }
        }
        else
            reject();
    });
    /////// VALIDATE LOGIN STATUS ///////
    
    next();
});


/////////// UPLOAD HANDLER ///////////

app.use(fileUpload({
    'useTempFiles' : true,
    'tempFileDir': process.env.ROOT + "/temp/upload/",
    'limits': { 
        'fileSize': 50 * 1024 * 1024    // 50Mbyte
    },
    'preserveExtension': true,
    'abortOnLimit': true
}));

/////////// UPLOAD HANDLER ///////////


///////////// EJS RENDER /////////////

app.use(ejsRender({
    'template_path': process.env.TEMPLATE_LAYOUT_PATH, 
    'dictionary_path': process.env.STRINGS_PATH, 
    'default_dict': "root"
}));

///////////// EJS RENDER /////////////


/////////////// ROUTER ///////////////

app.all('/*', async (req, res, next) => {
    req.remoteAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    req.remoteAddressAnonym = req.remoteAddress.substring(0, req.remoteAddress.lastIndexOf('.'));
    pushLog(`${req.method}: ${req.url} from: ${req.remoteAddress}`, "Incoming", "request");

    req.ejs_data = {};
    req.ejs_options = {};

    req.check_user_status.then(() => {
        // RULES FOR LOGGED IN USERS HERE
        pushLog(`Logged in. User: ${req.user.name}, Session id: ${req.session.id}`, "User Status", 'request');
    }, ()=> {
        // RULES FOR NOT LOGGED IN USERS HERE
        pushLog("Not logged in", "User Status", 'request');
    }).finally(()=>{
        next();
    });
});

app.get('/lang/*', function(req, res){
    let lang = req.params[0];
    if(lang){
        lang = ALLOWED_LANGUAGES.find(e => e == lang.replace('/', '')) || ALLOWED_LANGUAGES[0];
        res.cookie('lang', lang, COOKIE_OPTIONS);
        res.redirect(302, req.query['redirect'] || '/');
    }
    else
        res.redirect('/');
});

app.post('/signin', async function(req, res) {
    // CHECK IF ALREADY SIGNED IN
    if(req.user != null){
        res.redirect(302, '/');
        return;
    }
    // CHECK IF PASSWORD IS CORRECT
    let user = null;
    try{
        if(req.body.user.match(/^\S+@\S+\.\S+$/)){
            user = await Users.getByEmail(req.body.user);
        }
        else{
            user = await Users.getByMojangName(req.body.user);
            if(user.login_method == 'email'){
                throw new Error('Login with username is not accepted');
            }
        }
    }catch(error){
        pushLog(error.toString(), "SignIn", 'request');
        pushLog(`No user with username: ${req.body.user}`, "SignIn", 'request');
        res.statusCode = 400;
        res.json({
            error: "Wrong username or password",
            data: null
        });
        return;
    }
    
    if(user != null && req.body.password){
        const check_password = await bcrypt.compare(req.body.password.toString(), user['hash']);
        if(check_password){
            // TODO SET COOKIE
            req.session.username = user.name;
            req.session.ip_address = req.remoteAddressAnonym;
            req.session.user_agent = req.headers['user-agent'];
            
            pushLog(`User ${req.body.user} successfuly logged in`, "SignIn", 'request');

            res.json({
                error: null,
                data: "Login successful"
            });
        }
        else{
            pushLog(`Wrong password for user: ${req.body.user}`, "SignIn", 'request');
            res.statusCode = 400;
            res.json({
                error: "Wrong username or password",
                data: null
            });
            // PASSWORD WRONG
        }
    }
    else{
        pushLog(`Either user or password was empty`, "SignIn", 'request');
        res.statusCode = 400;
        res.json({
            error: "Mandatory field cannot be empty",
            data: null
        });
    }
});



app.post('/signup', async function(req, res) {
    // CHECK IF ALREADY SIGNED IN
    if(req.user != null){
        res.redirect(302, '/');
        return;
    }
    res.statusCode = 400;
    if(await Users.getByName(req.body.user) == null){
        let invitations = await Invitations.getByName(req.body.user);
        for(let i = 0; i < invitations.length; i++){
            let invitation = invitations[i];
            if(invitation && invitation.hash == req.body.invitation_code){
                const salt = bcrypt.genSaltSync(SALT_ROUNDS);
                const hash = bcrypt.hashSync(req.body.password, salt);
                Users.create(invitation.uuid, invitation.name, hash, invitation.assigned_servers).then(function(created_user){
                    pushLog(`Users successfuly created`, "SignUp", 'sql');
                    Invitations.remove(invitation.id);
                    res.statusCode = 201;
                    res.json({
                        error: null,
                        data: "Benutzer erfolgreich angelegt"
                    });
                    //res.redirect(302, '/');
                }).catch(function(error){
                    console.log(invitation);
                    console.error(error);
                    pushLog(error.toString(), 'Insert new User', 'sql');
                    res.json({
                        error: error.toString(),
                        data: null
                    });
                });
                return;
            }
        }
        //res.newMessage('error', "Der eingegebene Einladungstoken für den Nutzer: " + req.body.user + " ist ungültig.")
        res.json({
            error: "Der eingegebene Einladungstoken für den Nutzer: " + req.body.user + " ist nicht gültig.",
            data: null
        });
    }
    else{
        //res.newMessage('error', "Der eingegebene Einladungstoken für den Nutzer: " + req.body.user + " ist ungültig.")
        res.json({
            error: "Der Nutzer: " + req.body.user + " existiert bereits.",
            data: null
        });
    }
});

function init_router_directory(route_path){
    const relative_path = '/' + path.relative(process.env.ROUTES_PATH, route_path).replace('\\', '/');
    // LOAD ALL ROUTERS
    fs.readdirSync(route_path, {withFileTypes: true}).sort(e=> e.isDirectory ? -1 : 1).forEach(function(file) {
        if(!file.isDirectory()){
            const route = file.name == "root.js" ? relative_path : `${relative_path.length > 1 ? relative_path : ''}/${path.parse(file.name).name}`;
            app.use(route, require(path.join(route_path, file.name)));
        }
        else{
            init_router_directory(path.join(route_path, file.name));
        }
    });
}

init_router_directory(process.env.ROUTES_PATH);

// SENT 404 PAGE NOT FOUND
app.all('*', (req, res)=>{
    res.ejsRender('404.ejs', (err, file) => {
        res.send(file);
    });
});

/////////////// ROUTER ///////////////

app.disable('x-powered-by');
app.listen(process.env.PORT, () => pushLog('Application running on port ' + process.env.PORT, "Server start"));
