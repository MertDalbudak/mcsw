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
    })
});