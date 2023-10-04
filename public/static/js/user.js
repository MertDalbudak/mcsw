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