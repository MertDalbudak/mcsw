require('dotenv').config();
const fs = require('fs');
const Users = require('./Users');
const pushLog = require('../../lib/pushLog');
const ROOT = process.env.ROOT;

module.exports = function (Store) {
    class SessionStore extends Store {
        constructor(options = {}){
            super(options);
        }
        /**
         * Get all sessions
         * @param {listSessionCallback} callback callback(error, sessions)
         */
        all(callback){
            fs.readFile(ROOT + '/data/session.json', 'utf8', (err, data)=> {
                if(err == null)
                    callback(null, JSON.parse(data));
                else
                    callback(err, null);
            });
        }

        /**
         * 
         * @param {voidSessionCallback} callback 
         */
        destroy(sid, callback){
            this.all((err, sessions)=> {
                if(err == null){
                    fs.writeFileSync(ROOT + '/data/session.json', JSON.stringify(sessions.filter(session => session.sid != sid)));
                }
                pushLog(err);
                pushLog(sessions);
                callback();
            });
        }

        /**
         * 
         * @param {voidSessionCallback} callback 
         */
        clear(callback){
            fs.writeFileSync(ROOT + '/data/session.json', '[]');
            callback();
        }

        /**
         * 
         * @param {lengthSessionCallback} callback 
         */
        length(callback){
            this.all((err, sessions)=>{
                if(err == null)
                    callback(null, sessions.length);
                else
                    callback(err, null);
            });
        }
        /**
         * Gets Sessions
         * @param {getSessionCallback} callback 
         */
        get(sid, callback){
            this.all((err, sessions)=>{
                if(err == null){
                    let session = sessions.find(session => session.sid == sid);
                    if(session){
                        callback(null, session);
                    }
                    else{
                        callback(null, null);
                    }
                }
                else
                    callback(err, null);
            });
        }

        /**
         * 
         * @param {voidSessionCallback} callback 
         */
        set(sid, session, callback){
            // CLONE SESSION
            session = {...session};

            this.all((err, sessions)=>{
                if(err == null){
                    sessions.push({'sid': sid, 'username': session.username, 'cookie': session['cookie'], 'create_date': Date.now()});
                    fs.writeFileSync(ROOT + '/data/session.json', JSON.stringify(sessions), {'encoding': 'utf-8'});
                    callback(null);
                }
                else
                    callback(err, null);
            });
        }
        /*
        touch(sid, _session, callback){
            this.all((err, sessions)=>{
                if(err == null){
                    let session_index = sessions.findIndex(session => session.sid == sid);
                    let session = sessions[session_index];
                    if(session){
                        session = {session, ..._session};
                    }
                    else{
                        callback(null, null);
                    }
                    sessions[session_index] = session;
                    fs.writeFileSync(ROOT + '/data/session.json', JSON.stringify(sessions), {'encoding': 'utf-8'});
                    callback(null);
                }
                else
                    callback(err, null);
            });
        }
        */
    };
    return new SessionStore();
}


/**
 * List Session Function
 * @callback listSessionCallback
 * @param {*} error
 * @param {Array} sessions
*/
/**
 * Void Session Function
 * @callback voidSessionCallback
 * @param {*} error
*/
/**
 * Length Session Function
 * @callback lengthSessionCallback
 * @param {*} error
 * @param {number} len
*/
/**
 * Get Session Function
 * @callback getSessionCallback
 * @param {*} error
 * @param {Object} session
*/