let invitation_form = {};
let invitation_form_schema = [
    {
        'type': "select", 
        'name': "server", 
        'label': "Server", 
        'value': user.assigned_servers.reduce((acc, curr) => {
            if(curr.permissions.inviteOthers){
                acc.push({
                    'name': curr.server.name,
                    'value': curr.id
                });
            } return acc
        }, []),
        'attributes': {
            
        }
    },
    {'type': "text", 'name': "user", 'label': "Nutzername"},
    {'title': "Berechtigungen"},
    {'type': "checkbox", 'name': "inviteOthers", 'label': "Einladungung anderer Spieler", 'value': "true", 'attributes': {}},
    {'type': "checkbox", 'name': "start", 'label': "Start", 'value': 1, 'attributes': {}},
    {'type': "checkbox", 'name': "stop", 'label': "Stop", 'value': 1, 'attributes': {}}
];
let token_form_schema = [
    {'type': "textarea", 'label': "Einladungstoken", 'name': "token", 'value': "", 'attributes': {'readonly': ""}},
    {'title': window.userAgentMobile() ? "Möchtest du den Einladungstoken jetzt teilen?" : "Token in die Zwischenablage kopieren?"}
];

function invite(err, data){
    console.log(data);
    if(err != null){
        new Message('error', "Bei der eingabe ist etwas schief gelaufen");
        return false;
    }
    let request_body = {
        'server': [
            {
                'id': data[0].value,
                'inviteOthers': data[2].value,
                'start': data[3].value,
                'stop': data[4].value
            }
        ],
        'user': data[1].value
    };
    
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
        console.log(response);
        if(response.error == null){
            new Message('success', response.message);
            token_form_schema[0].value = response.data.hash;
            new PopUpForm('Einladung für ' + data[1].value, token_form_schema, function(){
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
        throw new Error('ID cannot be NaN');
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
            new Message('success', response.message);
            document.querySelector('ul#invitations li[data-id="' + id + '"]').remove();
        }
        else{
            new Message('error', response.error);
            console.error(response.error);
        }
    }, (error)=>{
        new Message('error', error);
    });
}

function stopServer(id){
    if(isNaN(id)){
        console.error('ID cannot be NaN');
        throw new Error('ID cannot be NaN');
    }
    new PopUpForm("Stopping the server", [{'title': "Are you sure you want to stop this server?\nOnly an empty server can be stopped."}], ()=>{
        // TRY STOPPING THE SERVER
        fetch(`/profile/my-server/${id}/stop`, {
            'method': "POST",
            'credentials': 'same-origin',
            'headers': {
                'Content-Type': "application/json; charset=utf-8",
                'CSRF-Token': token
            },
            'Accept': 'application/json'
        }).then(async (response)=>{
            response = await response.json();
            console.log(response);
            if(response.error == null){
                new Message('success', response.message);

            }
            else{
                new Message('error', response.error);
                console.error(response.error);
            }
        }, (error)=>{
            new Message('error', error);
        })
    });
}

function startServer(slot_id, server_id){
    if(isNaN(slot_id) || isNaN(server_id)){
        console.error('ID cannot be NaN');
        throw new Error('ID cannot be NaN');
    }
    new PopUpForm("Starting the server", [{'title': "Are you sure you want to start this server?"}], ()=>{
        // TRY STOPPING THE SERVER
        fetch(`/profile/my-server/${slot_id}/${server_id}/start`, {
            'method': "POST",
            'credentials': 'same-origin',
            'headers': {
                'Content-Type': "application/json; charset=utf-8",
                'CSRF-Token': token
            },
            'Accept': 'application/json'
        }).then(async (response)=>{
            response = await response.json();
            console.log(response);
            if(response.error == null){
                new Message('success', response.message);

            }
            else{
                new Message('error', response.error);
                console.error(response.error);
            }
        }, (error)=>{
            new Message('error', error);
        })
    });
}

function restartServer(slot_id, server_id){
    if(isNaN(slot_id) || isNaN(server_id)){
        console.error('ID cannot be NaN');
        throw new Error('ID cannot be NaN');
    }
    new PopUpForm("Restarting the server", [{'title': "Are you sure you want to restart this server?"}], ()=>{
        // TRY STOPPING THE SERVER
        fetch(`/profile/my-server/${slot_id}/${server_id}/restart`, {
            'method': "POST",
            'credentials': 'same-origin',
            'headers': {
                'Content-Type': "application/json; charset=utf-8",
                'CSRF-Token': token
            },
            'Accept': 'application/json'
        }).then(async (response)=>{
            response = await response.json();
            console.log(response);
            if(response.error == null){
                new Message('success', response.message);

            }
            else{
                new Message('error', response.error);
                console.error(response.error);
            }
        }, (error)=>{
            new Message('error', error);
        })
    });
}

document.addEventListener('DOMContentLoaded', function(){
    invitation_form = new PopUpForm("Invite an friend", invitation_form_schema, invite);
    invitation_form.on('beforeReady', function(){
        this.hide();
    });
});
