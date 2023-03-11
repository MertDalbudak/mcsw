const RestApi = require("../lib/RestApi");
const MojangAPI = {};


MojangAPI.getIdByName = async (name) =>{
    const query = new RestApi("mojang", "getIdByName", {'params': {'name': name}});
    try{
        let response = await query.req();
        return response.id
    }
    catch(error){
        if(isNaN(error)){
            console.error(error);
            throw("An error occured reaching the Mojang Servers");
        }
        else{
            const statusCode = error;
            if(statusCode == 204){
                throw("Given username is not linked to a Mojang account");
            }
        }
    }
};


module.exports = MojangAPI;