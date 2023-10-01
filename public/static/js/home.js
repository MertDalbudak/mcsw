function home(){
    const header_banner = document.querySelector('div#header_banner');
    const header_banner_bg = ['bg1', 'bg2', 'bg3', 'bg4'];
    header_banner.classList.add(`bg${Math.floor(Math.random() * header_banner_bg.length) + 1}`);
    setInterval(()=>{
        for(let i = 0; i < header_banner_bg.length; i++){
            if(header_banner.classList.contains(header_banner_bg[i])){
                header_banner.classList.remove(header_banner_bg[i]);
                if(i + 1 < header_banner_bg.length){
                    header_banner.classList.add(header_banner_bg[i+1]);
                }
                else{
                    header_banner.classList.add(header_banner_bg[0]);
                }
                break;
            }
        }
    }, 8000)
}



document.addEventListener('DOMContentLoaded', home);