export const load = ({locals}) => {
    //return an object with user set to the logged in record 
    return {user:locals.user}
}

//this allows us to get the user with data.user without loading it on every page
//only for the client  .svelte components
//doesnt work for the server. use locals.user instead 
//**VERY IMPORTANT */