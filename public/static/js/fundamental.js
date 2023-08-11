const token = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
const register_form_schema = [
    {'type': "text", 'name': "user", 'label': "Minecraft Name", 'attributes': {'autocomplete': "off"}},
    {'type': "textarea", 'name': "invitation_code", 'label': "Einladungs Token", 'attributes': {'autocomplete': "off"}},
    {'type': "password", 'name': "password", 'label': "Passwort (min. 6 Zeichen)"},
    {'type': "password", 'name': "password_repeat", 'label': "Passwort wiederholen"},
];
const login_form_schema = [
    {'type': "text", 'name': "user", 'label': "Minecraft Name"},
    {'type': "password", 'name': "password", 'label': "Passwort"}
];

function toggleMenu(){
    if(userAgentMobile()){
        window.scrollTo({'top': 0});
    }
    document.body.classList.toggle('menu-active');
    localStorage.setItem('menu-active', document.body.classList.contains('menu-active'));
}

// POPUP FORM
let register_form, login_form;

// REGISTER FORM SUBMIT
function register(err, data){
    if(err != null){
        new Message('error', "Bei der eingabe ist etwas schief gelaufen");
        return false;
    }
    let request_body = {};
    data.forEach(function(element){
        request_body[element.name] = element.value;
    });
    fetch('/signup', {
        'method': "POST",
        'credentials': 'same-origin', // <-- includes cookies in the request
        'headers': {
            'Content-Type': "application/json; charset=utf-8",
            'CSRF-Token': token // <-- is the csrf token as a header
        },
        'Accept': 'application/json',
        'body': JSON.stringify(request_body)
    })
    .then(async (response) => { 
        response = await response.json();
        if(response.error == null){
            new Message('success', response.data);
            login_form.show();
        }
        else{
            register_form.show();
            new Message('error', response.error);
            console.error(response.error);
        }
    });
}

// LOGIN FORM SUBMIT
function login(err, data){
    if(err != null){
        new Message('error', "Bei der eingabe ist etwas schief gelaufen");
        return false;
    }
    let request_body = {};
    data.forEach(function(element){
        request_body[element.name] = element.value;
    });
    fetch('/signin', {
        'method': "POST",
        'credentials': 'same-origin',
        'headers': {
            'Content-Type': "application/json; charset=utf-8",
            'CSRF-Token': token
        },
        'Accept': 'application/json',
        'body': JSON.stringify(request_body)
    })
    .then(async (response) => {
        response = await response.json();
        console.log(data);
        if(response.error == null){
            new Message('success', response.data);
            setTimeout(()=>{
                window.location.href = "/";
            }, 2000)
        }
        else{
            login_form.show();
            new Message('error', response.error);
            console.error(response.error);
        }
    }, (error)=>{
        new Message('error', error);
    });
}

document.addEventListener('DOMContentLoaded', function(){
    // SHOW MENU WHEN LOCAL STORAGE TRUE
    if(localStorage.getItem('menu-active') == "true" && !userAgentMobile()){
        
        document.body.classList.add('menu-active');
    }

    register_form = new PopUpForm("Registrieren", register_form_schema, register);
    register_form.on('beforeReady', function(){
        this.hide();
    });
    register_form.on('confirm', function(event){
        for(let i = 0; i < this.data.length; i++){
            if(this.data[i].value.length == 0){
                new Message('warn', "Fülle alle Felder aus");
                event.preventDefault();
                return;
            }
        }
        if(this.data[2].value.length < 6){
            event.preventDefault();
            new Message('error', "Passwort ist zu kurz, wähl ein längeres Passwort");
        }
            
        if(this.data[2].value != this.data[3].value){
            event.preventDefault();
            new Message('error', "Passwörter stimmen nicht überein");
        }
    });
    login_form = new PopUpForm("Anmelden", login_form_schema, login);
    login_form.on('beforeReady', function(){
        this.hide();
    });
});