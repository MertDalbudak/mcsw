let invitation_form = {};
let invitation_form_schema = [
    {
        'type': "select", 'name': "server", 'label': "Server", 'selected': user.assigned_server[0].name, 'value': user.assigned_server.map(server => ({'name': server.name, 'value': server.name})), 'attributes': {'multiple': ""}
    },
    {'type': "text", 'name': "user", 'label': "Nutzername"}
];
let token_form_schema = [
    {'type': "textarea", 'label': "Token", 'name': "token", 'value': ""},
    {'title': window.userAgentMobile() ? "Möchtest du den Einladungstoken jetzt teilen?" : "Token in die Zwischenablage kopieren?"}
];

function invite(err, data){
    console.log(data);
    if(err != null){
        new Message('error', "Bei der eingabe ist etwas schief gelaufen");
        return false;
    }
    let request_body = {};
    data.forEach(function(element){
        request_body[element.name] = element.value;
    });
    fetch('/profile/invite', {
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
            new Message('success', response.data.message);
            token_form_schema[0].value = response.data.hash;
            new PopUpForm('Einladungstoken für ' + data[1].value, token_form_schema, function(){
                if (navigator.share && window.userAgentMobile()) {
                    navigator.share({
                        title: 'Einladungstoken für mc.daludak.de',
                        text: `Hey ${data[1].value}, hier ist dein persönlicher Einlungstoken. Registriere dich einfach mit deinem Benutzernamen (${data[1].value}) und dem unten stehenden Token bei:\r\nhttps://mc.dalbudak.de\r\n\r\nDein Einladungstoken: ${response.data.hash}`
                    }).then(() => {
                        console.log('Thanks for sharing!');
                    }).catch((error) =>{
                        new Message('warn', "Du kannst jederzeit ein neuen Einlungstoken für deine Freunde erstellen.")
                    });
                } else {
                    navigator.clipboard.writeText(response.data.hash).then(function() {
                        new Message('success', "Der Einladungstoken wurde in deine Zwischenablage gespeichert")
                    }, function(error){
                        new Message('error', "Der Einladungstoken konnte leider nicht in die Zwischenablage abgelegt werden.")
                        console.error(error);
                    });
                  }
                this.hide();
            });
        }
        else{
            new Message('error', response.error);
            console.error(response.error);
        }
    }, (error)=>{
        new Message('error', error);
    });
}

function removeInvite(id){
    if(isNaN(id)){
        console.error('ID cannot be NaN');
        return false;
    }
    fetch('/profile/invites/delete/' + id, {
        'method': "DELETE",
        'credentials': 'same-origin',
        'headers': {
            'Content-Type': "application/json; charset=utf-8",
            'CSRF-Token': token
        },
        'Accept': 'application/json'
    })
    .then(async (response) => {
        response = await response.json();
        console.log(response);
        if(response.error == null){
            new Message('success', response.data.message);
            document.querySelector('ul#invitations li[data-id=' + id + ']').remove();
        }
        else{
            new Message('error', response.error);
            console.error(response.error);
        }
    }, (error)=>{
        new Message('error', error);
    });
}


document.addEventListener('DOMContentLoaded', function(){
    invitation_form = new PopUpForm("Einen Freund einladen", invitation_form_schema, invite);
    invitation_form.on('beforeReady', function(){
        this.hide();
    });
});
