const register_form_schema = [
    {'type': "text", 'name': "user", 'label': "Minecraft Name", 'attributes': {'autocomplete': "off"}},
    {'type': "textarea", 'name': "invitation_code", 'label': "Einladungs Token", 'attributes': {'autocomplete': "off"}},
    {'type': "password", 'name': "password", 'label': "Passwort (min. 6 Zeichen)"},
    {'type': "password", 'name': "password_repeat", 'label': "Passwort wiederholen"},
    {'title': "Achtung - Caution - Attention - Precaución", 'attributes': {'style': "color: #e81123 !important; font-weight: 600 !important"}},
    {'title': "Nutze nicht dein Mojang Passwort"},
    {'title': "Do not use your Mojang password"},
    {'title': "N'utilisez pas votre mot de passe Mojang"},
    {'title': "No use su contraseña de Mojang"}
];
const login_form_schema = [
    {'type': "text", 'name': "user", 'label': "Minecraft Name"},
    {'type': "password", 'name': "password", 'label': "Passwort"}
];

// POPUP FORM
let register_form, login_form;

// REGISTER FORM SUBMIT
function register(err, data){
    if(err != null){
        alert("Bei der eingabe ist etwas schief gelaufen");
        return false;
    }
    let request_body = {};
    data.forEach(function(element){
        request_body[element.name] = element.value;
    });
    fetch('/register', {
        'method': "POST",
        'headers': {
            'Content-Type': 'application/json',
        },
        'body': JSON.stringify(request_body)
    })
    .then(response => response.json())
    .then((data) => { 
        if(data.error == null){
            alert(data.data);
            login_form.show();
        }
        else{
            alert(data.error);
            console.error(data.error);
        }
    });
}

// LOGIN FORM SUBMIT
function login(err, data){
    if(err != null){
        alert("Bei der eingabe ist etwas schief gelaufen");
        return false;
    }
    let request_body = {};
    data.forEach(function(element){
        request_body[element.name] = element.value;
    });
    fetch('/login', {
        'method': "POST",
        'headers': {
            'Content-Type': 'application/json',
        },
        'body': JSON.stringify(request_body)
    })
    .then(response => response.json())
    .then((data) => {
        if(data.error == null){
            window.location.href = "/";
        }
        else{
            alert(data.error);
            console.error(data.error);
        }
    });
}

document.addEventListener('DOMContentLoaded', function(){
    register_form = new PopUpForm("Registrieren", register_form_schema, register);
    register_form.on('beforeReady', function(){
        this.hide();
    });
    register_form.on('confirm', function(event){
        for(let i = 0; i < this.data.length; i++){
            if(this.data[i].value.length == 0){
                alert("Fülle alle Felder aus");
                event.preventDefault();
                return;
            }
        }
        if(this.data[2].value.length < 6){
            event.preventDefault();
            alert("Passwort ist zu kurz, wähl ein längeres Passwort");
        }
            
        if(this.data[2].value != this.data[3].value){
            event.preventDefault();
            alert("Passwörter stimmen nicht überein");
        }
    });
    login_form = new PopUpForm("Anmelden", login_form_schema, login);
    login_form.on('beforeReady', function(){
        this.hide();
    });
});