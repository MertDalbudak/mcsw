require('dotenv').config();
process.env.ROOT = __dirname;

const NODE_ENV = process.env.NODE_ENV;
const DOMAIN = process.env.DOMAIN;
const PORT = process.env.PORT;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || 10);
const COOKIE_SECRET = process.env.COOKIE_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || false;


const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const csrf = require('csurf');
const fileUpload = require('express-fileupload');
const bcrypt = require('bcrypt');
const ejsRender = require('./lib/ejsRender');
const RestApi = require('./lib/RestApi');
const pushLog = require('./lib/pushLog');
const Users = require('./src/Model/Users');
const Invitations = require('./src/Model/Invitation')
//const SendMail = require('./src/SendMail');


const ROOT = process.env.ROOT;
const ROUTES_PATH = ROOT + "/routes/";
const STRINGS_PATH = ROOT + "/strings/";
const ALLOWED_LANGUAGES = require('./config/app').languages;
const SUPPORTED_LANGUAGES = fs.readdirSync(STRINGS_PATH).map(e => path.parse(e).name);
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
    'secret': SESSION_SECRET,
    'cookie': {
        'path': "/",
        'maxAge': SESSION_MAX_AGE,
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

app.use(express.static(ROOT + '/public/static'));

app.use(express.urlencoded({
    extended: true
}));

// USE SESSION MIDDLEWARE
app.use(session(SESSION_OPTIONS));
// USE JSON PARSE MIDDLEWARE
app.use(express.json());
// USE COOKIE-PARSER MIDDLEWARE
app.use(cookieParser(COOKIE_SECRET));
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
                req.user = await Users.get(req.session.username);
                resolve();
            }
            else
                reject();
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
    'tempFileDir': ROOT + "/temp/upload/",
    'limits': { 
        'fileSize': 50 * 1024 * 1024    // 50Mbyte
    },
    'preserveExtension': true,
    'abortOnLimit': true
}));

/////////// UPLOAD HANDLER ///////////


///////////// EJS RENDER /////////////

app.use(ejsRender({
    'template_path': ROOT + "/public/template/layout", 
    'dictionary_path': ROOT + "/strings", 
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
    let user = await Users.get(req.body.user);
    if(user != undefined){
        console.log(req.body);
        if(req.body.user && req.body.password){
            const check_password = await bcrypt.compare(req.body.password.toString(), user['hash']);
            if(check_password){
                // TODO SET COOKIE
                req.session.username = req.body.user;
                req.session.ip_address = req.remoteAddressAnonym;
                req.session.user_agent = req.headers['user-agent'];
                /* EXPRESS FRAMEWORK NOT ALLOWING THIS OR UNEXPECTED BEHAVIOR
                req.session.save((error)=>{
                    console.log(error);
                    if(error == null)
                        res.newMessage("success", "Angemeldet");
                    else
                        res.newMessage("error", "signIn_loginFailedSummary", "signInFailedStore_message");
                    res.redirect(302, '/');
                });
                await req.session.save().then(()=> {
                    res.newMessage("success", "Angemeldet")
                }, (error) => {
                    res.newMessage("error", "signIn_loginFailedSummary", "signInFailedStore_message");
                });
                */
                pushLog(`User ${req.body.user} successfuly logged in`, "SignIn", 'request');

                res.json({
                    error: null,
                    data: "Login successful"
                });
            }
            else{
                pushLog(`Wrong password for user: ${req.body.user}`, "SignIn", 'request');
                res.json({
                    error: "Wrong username or password",
                    data: null
                });
                // PASSWORD WRONG
            }
        }
        else{
            pushLog(`Either user or password was empty`, "SignIn", 'request');
            res.json({
                error: "Mandatory field cannot be empty",
                data: null
            });
        }
    }
    else{
        pushLog(`No user with username: ${req.body.user}`, "SignIn", 'request');
        res.json({
            error: "Wrong username or password",
            data: null
        });
        //res.newMessage("error", "signIn_loginFailedMessage");
        //res.redirect(302, '/signin');
        // PASSWORD WRONG
        // PUSH TO FAILED LOGINS
    }
});



app.post('/signup', async function(req, res) {
    // CHECK IF ALREADY SIGNED IN
    if(req.user != null){
        res.redirect(302, '/');
        return;
    }
    if(await Users.get(req.body.user) == null){
        let invitations = await Invitations.getAll();
        let invitation = invitations.findIndex(e => (e.user == req.body.user && e.hash == req.body.invitation_code));
        if(invitation != -1){
            const salt = bcrypt.genSaltSync(SALT_ROUNDS);
            const hash = bcrypt.hashSync(req.body.password, salt);
            Users.create(req.body.user, hash, invitations[invitation].assigned_server).then(function(sql_res){
                pushLog(`Users successfuly created`, "SignUp", 'sql');
                res.json({
                    error: null,
                    data: "Benutzer erfolgreich angelegt"
                });
                //res.redirect(302, '/');
            }).catch(function(err){
            console.error(err);
            pushLog(err, 'Insert new User', 'sql');
                //res.newMessage('error', "error_pageTitle")
                res.json({
                    error: 'Bei der Erstellung eines neuen Nutzers ist ein Fehler aufgetreten',
                    data: null
                });
            });
            /*
            const requestBody = {
    
            };
            const newContact = new RestApi('EC', 'setContact');
            newContact.req(JSON.stringify(requestBody)).then(function(data){
                const salt = bcrypt.genSaltSync(SALT_ROUNDS);
                const hash = bcrypt.hashSync(req.body.password, salt);
                Users.create(...)
            }, function(error){
                pushLog(error, "Create Contact");
                res.redirect('?success_msg[0]=Registrierung%20fehlgeschlagen');
            }).catch(function(error){
                pushLog(error);
                res.redirect('?success_msg[0]=Registrierung%20fehlgeschlagen');
            });*/
        }
        else{
            //res.newMessage('error', "Der eingegebene Einladungstoken für den Nutzer: " + req.body.user + " ist ungültig.")
            res.json({
                error: "Der eingegebene Einladungstoken für den Nutzer: " + req.body.user + " ist ungültig.",
                data: null
            });
        }
    }
    else{
        //res.newMessage('error', "Der eingegebene Einladungstoken für den Nutzer: " + req.body.user + " ist ungültig.")
        res.json({
            error: "Der Nutzer: " + req.body.user + " existiert bereits.",
            data: null
        });
    }
});

// LOAD ALL ROUTERS
fs.readdirSync(ROUTES_PATH).forEach(function(filename) {
    const route = filename == "root.js" ? '/' : `/${path.parse(filename).name}`;
    app.use(route, require(ROUTES_PATH + filename));
},);

/////////////// ROUTER ///////////////


app.listen(PORT, () => pushLog('Application running on port ' + PORT, "Server start"));
