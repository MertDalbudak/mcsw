document.addEventListener('DOMContentLoaded', ()=>{
    const settings_menu_link = document.querySelectorAll('li.settings_menu_link')
    const settings_content = document.querySelector('div#settings')
    const settings_content_section = document.querySelectorAll('li.settings_content_section')
    const settings_show_menu = document.querySelector('button#settings_show_menu');
    settings_menu_link.forEach((e, index)=>{
        e.addEventListener('click', () => {
            settings_menu_link.forEach(e => e.classList.remove('selected'));
            settings_content_section.forEach(e => e.classList.remove('selected'));
            settings_content_section[index].classList.add('selected');
            e.classList.add('selected');

            settings_content.classList.add('show_content');
        });
    });
    settings_show_menu.addEventListener('click', ()=>{
        settings_content.classList.remove('show_content');
    });

    function updatePassword(){
        const section = settings_content_section[1];
        const current_password = section.querySelector('input#password');
        const new_password = section.querySelector('input#new_password');
        const password_repeat = section.querySelector('input#password_repeat');
        const button = section.querySelector('button#changePasswordButton')
        if(current_password.value.length >= 6 && new_password.value.length >= 6 && new_password.value == password_repeat.value){
            button.classList.remove('disabled');
        }
        else{
            button.classList.add('disabled');
        }
    }

    document.querySelector('input#password').addEventListener('input', updatePassword);
    document.querySelector('input#new_password').addEventListener('input', updatePassword);
    document.querySelector('input#password_repeat').addEventListener('input', updatePassword);

    document.querySelector('input#deleteProfilePassword').addEventListener('input', (event)=>{
        const element = event.target;
        const section = settings_content_section[3];
        if(element.value.length >= 6){
            section.querySelector('button').classList.remove('disabled');
        }
        else{
            section.querySelector('button').classList.add('disabled');
        }
    });
    
    /* DELETE PROFILE */
    document.querySelector('button#deleteProfileButton').addEventListener('click', ()=>{
        new PopUpForm('Delete Profile permanently', [{'title': "You are about to delete your account permanently. Are you really sure?"}], (error, data)=>{
            if(error == null){
                settings_content_section[3].querySelector('form').submit();
            }
        });
    });
});