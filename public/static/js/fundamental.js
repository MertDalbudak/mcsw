const token = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

function toggleMenu(){
    if(userAgentMobile()){
        window.scrollTo({'top': 0});
    }
    document.body.classList.toggle('menu-active');
    localStorage.setItem('menu-active', document.body.classList.contains('menu-active'));
}



function addToClipboard(content){
    try{
        navigator.clipboard.writeText(content.toString()).then(function() {
            new Message('success', "Copied!")
        });
    }
    catch(error){
        new Message('error', "An error occured trying to copy the value to the clipboard");
        console.error(error);
    }
}


document.addEventListener('DOMContentLoaded', function(){
    // SHOW MENU WHEN LOCAL STORAGE TRUE
    if(localStorage.getItem('menu-active') == "true" && !userAgentMobile()){
        document.body.classList.add('menu-active');
    }
});