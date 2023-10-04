/**
     * 
     * @callback PopUpFormCallback
     * @param {String} error 
     * @param {{}} data 
     */

class PopUpForm {
    /**
     * 
     * @param {String} title 
     * @param {{}} form_schema 
     * @param {PopUpFormCallback} callback 
     */
    constructor(title, form_schema = {}, callback = null){
        this.title = title;
        this.form_schema = form_schema;
        this.data = null;
        this.callback = callback;
        this.event = new Array();
        this.eventListener = new Array();
        if((this.valid = this.validate()) === true)
            this.init();
        else
            console.error(this.valid);
        this.on('ready', ()=>{
            if(window.jQuery){
                // JS on ready
                if($(this.element).find('.js-example-basic-multiple') && $().select2 != undefined)
                    $(this.element).find('.js-example-basic-multiple').select2();
                if($(this.element).find('.summernote') && $.summernote != undefined)
                    $(this.element).find('.summernote').summernote({
                        toolbar: [
                            ['style', ['bold', 'italic', 'underline', 'clear']],
                            ['font', ['strikethrough', 'superscript', 'subscript']],
                            ['fontsize', ['fontsize']],
                            ['color', ['color']],
                            ['para', ['ul', 'ol', 'paragraph']],
                            ['height', ['height']]
                        ]
                    });
            }
        });
    }
    on(type, callback, options = {}){
        let listener = ()=>{
            let return_value = {
                'preventDefault': false
            };
            let event = {
                'preventDefault': ()=>{
                    return_value.preventDefault = true;
                }
            };
            callback.bind(this)(event);
            return return_value;
        };
        let event = true;
        this.event.forEach(element => {
            if(element == type){
                listener();
                event = false;
            }
        });
        if(event)
            this.eventListener.push({'type': type, 'listener': listener, 'options': options});
    }
    addEvent(type, register = false){
        if(register)
            this.event.push(type);
        let eventListener = {
            preventDefault: false
        };
        this.eventListener.forEach(element => {
            if(element.type == type){
                eventListener = element.listener();
            }
        });
        return eventListener;
    }
    validate(){ // BOOLEAN
        if(Array.isArray(this.form_schema)) // form_schema MUST BE AN ARRAY
            for(let i = 0; i < this.form_schema.length; i++){
                if(typeof this.form_schema[i] == "object")  // INSTANCES MUST BE AN OBJECT
                    if(this.form_schema[i].hasOwnProperty('type') && typeof this.form_schema[i]['type'] == "string"){ 
                        if(typeof this.form_schema[i]['name'] == "undefined" || (this.form_schema[i].hasOwnProperty('name') && typeof this.form_schema[i]['name'] == "string"))
                            if(typeof this.form_schema[i]['value'] == "undefined" || (this.form_schema[i].hasOwnProperty('value') && ["string", 'number'].indexOf(typeof this.form_schema[i]['value']) > -1) || (this.form_schema[i]['type'] == "select" && Array.isArray(this.form_schema[i]['value'])))
                                if((this.form_schema[i].hasOwnProperty('label') && typeof this.form_schema[i]['label'] == "string"))
                                    continue;
                    }
                    else if(this.form_schema[i].hasOwnProperty('title') && typeof this.form_schema[i]['title'] == "string")
                        continue;
                return "Validation schlug fehl.";
            }
        else
            return "Second Parameter has to be a array. " + typeof this.form_schema + " given.";
        return true;
    }
    hide(restore = true){
        if(restore && this.data != null){
            let skip = 0;
            for(let i = 0; i < this.form_element.length; i++){
                if(this.form_element[i].classList.contains('discard') == false){
                    let input_element = this.form_element[i].childNodes[1];
                    if(this.form_schema[i]['type'] == "checkbox")
                        input_element.checked = this.data[i - skip].value == 1;
                    if(this.form_schema[i]['type'] == "textarea")
                        input_element.innerText = this.data != null ? this.data[i - skip].value : this.form_schema[i].value;
                    else
                        input_element.value = this.data != null ? this.data[i - skip].value : this.form_schema[i].value;
                }
                else
                    skip++;
            }
        }
        this.element.classList.add('hidden');
    }
    confirm(){
        this.data = new Array();
        for(let i = 0; i < this.form_element.length; i++){
            if(this.form_element[i].classList.contains('discard') == false){
                let input_element;
                let value;
                if(this.form_schema[i]['type'] == "select"){
                    input_element = this.form_element[i].querySelector('select');
                    if(this.form_element[i].querySelector('select').hasAttribute('multiple')){
                        value = [];
                        this.form_element[i].querySelectorAll('select option').forEach((e) => {
                            if(e.selected){
                                value.push(e.getAttribute('value'));
                            }
                        });
                    }
                    else{
                        value = input_element.value;
                    }
                }
                else{
                    if(this.form_schema[i]['type'] == "textarea"){
                        input_element = this.form_element[i].querySelector('textarea');
                        value = input_element.value;
                    }
                    else {
                        input_element = this.form_element[i].querySelector('input');
                        if(input_element.getAttribute('type') == 'checkbox')
                            value = input_element.checked ? input_element.value : 0;
                        else
                            value = input_element.value;
                    }
                }
                this.data.push({
                    'name': input_element.getAttribute('name'),
                    'value': value
                });
            }
        }
        if(this.addEvent('confirm').preventDefault == true){
            this.data = null;
            return false;
        }
        this.callback(null, this.data);
        this.hide(false);
        this.addEvent('confirmed');
    }
    init(){
        // BUILD THE FORM
        this.form_element = new Array();
        for(let i = 0; i < this.form_schema.length; i++){
            let element;
            if(this.form_schema[i].hasOwnProperty('title')){
                element = document.createElement('h4');
                element.innerText = this.form_schema[i]['title'];
                // SET ATTRIBUTES
                if(this.form_schema[i].hasOwnProperty('attributes') && Object.keys(this.form_schema[i]['attributes']).length > 0){    // ADD ATTRIBUTES
                    for(let key in this.form_schema[i]['attributes'])
                        element.setAttribute(key, this.form_schema[i]['attributes'][key]);
                }
                this.form_element.push(element);
                element.classList.add('discard');
                continue;
            }
            switch(this.form_schema[i]['type']){
                case "select":
                    element = document.createElement('select');
                    element.innerHTML = this.form_schema[i].hasOwnProperty('default_value') ? "<option value=\"" + this.form_schema[i]['default_value'] + "\">Auswählen</option>" : "<option disabled=\"disabled\" selected=\"selected\" value=\"\">Auswählen</option>";
                    for(let j = 0; j < this.form_schema[i]['value'].length; j++){
                        if(typeof this.form_schema[i]['value'][j] == "object"){
                            if(this.form_schema[i].hasOwnProperty('selected'))
                                element.innerHTML += "<option value=\"" + this.form_schema[i]['value'][j]['value'] + "\"" + (this.form_schema[i]['selected'] == this.form_schema[i]['value'][j]['value'] ? " selected=\"selected\"" : "") + ">" + (this.form_schema[i]['value'][j]['name']) + "</option>";
                            else
                                element.innerHTML += "<option value=\"" + this.form_schema[i]['value'][j]['value'] + "\">" + this.form_schema[i]['value'][j]['name'] + "</option>";
                        }
                        else{
                            this.callback("Typ select has no valid object values.", null);
                            return;
                        }
                    }                 
                    break;  
                case "text":
                case "password":
                case "hidden":
                case "number":
                case "checkbox":
                    element = document.createElement('input');
                    element.setAttribute('type', this.form_schema[i]['type']);
                    if(this.form_schema[i].hasOwnProperty('value'))
                        element.setAttribute('value', this.form_schema[i]['value']);
                    break;
                case "textarea":
                    element = document.createElement('textarea');
                    element.classList.add("card");
                    element.style.width = "-webkit-fill-available";
                    if(this.form_schema[i].hasOwnProperty('value'))
                        element.innerText = this.form_schema[i]['value'];
                    break;
                default: 
                    this.callback("Type: " + this.form_schema[i]['type'] + " is not supported.", null);
                    return;
            }
            let form_container = document.createElement('div'),
                label = document.createElement('label'),
                name = "popUpForm_" + (PopUpForm.input_counter++) + (this.form_schema[i]['name'] || "");
            form_container.classList.add('input', this.form_schema[i]['type']);
            if(typeof this.form_schema[i]['name'] == "undefined")
                form_container.classList.add('discard');
            else
                element.setAttribute('name', this.form_schema[i]['name']);
            
            label.setAttribute('for', name);
            label.innerText = typeof this.form_schema[i]['label'] == "string" ? this.form_schema[i]['label'] : this.form_schema[i]['name'];
            element.setAttribute('id', name);
            // SET ATTRIBUTES
            if(this.form_schema[i].hasOwnProperty('attributes') && Object.keys(this.form_schema[i]['attributes']).length > 0){    // ADD ATTRIBUTES
                for(let key in this.form_schema[i]['attributes'])
                    element.setAttribute(key, this.form_schema[i]['attributes'][key]);
            }
            // SET EVENTLISTENERS
            if(this.form_schema[i].hasOwnProperty('eventListener') && Object.keys(this.form_schema[i]['eventListener']).length > 0){    // ADD EVENT LISTENERS
                for(let key in this.form_schema[i]['eventListener'])
                    element.addEventListener(key, this.form_schema[i]['eventListener'][key]);
            }
            // APPEND
            form_container.appendChild(label);
            form_container.appendChild(element);
            this.form_element.push(form_container);
        }
        this.element = document.createElement('li');
        this.popUp_header_title_h2 = document.createElement('h2');
        let container = document.getElementById("popup_container"),
            popUp_div = document.createElement('div'),
            popUp_header_div = document.createElement('div'),
            popUp_body_div = document.createElement('div'),
            popUp_body_content_div = document.createElement('div'),
            popUp_body_dialog_div = document.createElement('div'),
            popUp_body_dialog_confirm_div = document.createElement('button'),
            popUp_body_dialog_cancel_div = document.createElement('button');
        popUp_div.classList.add("popup");
        popUp_header_div.classList.add("popup_header");
        this.popUp_header_title_h2.innerText = this.title;
        popUp_body_div.classList.add("popup_body");
        popUp_body_content_div.classList.add("popup_content");
        for(let i = 0; i < this.form_element.length; i++)
            popUp_body_content_div.appendChild(this.form_element[i]);
        popUp_body_dialog_div.classList.add("popup_dialog");
        popUp_body_dialog_confirm_div.classList.add("confirm");
        popUp_body_dialog_confirm_div.innerText = "Bestätigen";
        popUp_body_dialog_confirm_div.addEventListener('click', ()=>{
            this.confirm();
        });
        popUp_body_dialog_cancel_div.classList.add("cancel");
        popUp_body_dialog_cancel_div.innerText = "Abbrechen";
        popUp_body_dialog_cancel_div.addEventListener('click', ()=>{
            this.hide();
        });
        // APPEND
        popUp_body_div.appendChild(popUp_body_content_div);
        popUp_body_dialog_div.appendChild(popUp_body_dialog_confirm_div);
        popUp_body_dialog_div.appendChild(popUp_body_dialog_cancel_div);
        popUp_body_div.appendChild(popUp_body_dialog_div);
        popUp_header_div.appendChild(this.popUp_header_title_h2);
        popUp_div.appendChild(popUp_header_div);
        popUp_div.appendChild(popUp_body_div);
        this.element.appendChild(popUp_div);
        this.addEvent('beforeReady', true);
        container.appendChild(this.element);
        this.addEvent('ready', true);
    }
    show(){
        this.element.classList.remove('hidden');
    }
    set setTitle(text){
        this.title = text.toString();
        this.popUp_header_title_h2.innerText = this.title;
    }
}

PopUpForm.input_counter = 0;