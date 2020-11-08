const cryptoRandomString = require('crypto-random-string');

class Session{
    constructor(name, value, age = false){
        this.name = name;
        this.value = value;
        this.age = age;
        this.createKey();
    }
    createKey(){
        if(this.key == undefined){
            do {
                this.key = cryptoRandomString({'length': 32});
            }while(Session.instances.hasOwnProperty(this.key));
            Session.instances[this.key] = this;
        }
        else{
            console.error("Key already exists");
        }
    }
    remove(){
        delete Session.instances[this.key];
    }
    get cookieString(){
        return this.name + "=ngiNSession:" + this.key + ";" + (this.age !== false ? ("max-age=" + this.age) : "");
    }
    static find(key){
        return Session.instances[key];
    }
    static findByNameValue(name, value){
        for(let instance in Session.instances){
            if(name == instance.name && value == instance.value)
                return instance;
        }
    }
}
Session.instances = {};
module.exports = Session;