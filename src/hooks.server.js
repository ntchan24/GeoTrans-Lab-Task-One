//this is the middleware
//we can implement pocketbase here 

import PocketBase from 'pocketbase'

//a token is a string that proves this request is from an authenticated user. 
//is a json web token w a signature. 

//cookie is a bit of data that the browser stores. 

export const handle = async ({event,resolve}) => {
    //to verify if the hook is running for every request we can log 
    console.log('hook running for' , event.url.pathname)
    
    //handle is a sveltekit hook 
    //a hook is a function that is autocalled on every request before the request gets to the route handler 
    //aka middleware
    //event is the incoming request. contains url headers cookies 
    //resolve is a function - does the work of running load fxns from page.server.js


    event.locals.pb = new PocketBase('http://127.0.0.1:8090')
// load the auth store from the cookie
    event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '' )
    //the browser sent cookies  in a long string and it needs to be parsed 


    try {
        // refresh if the token is still valid
        event.locals.pb.authStore.isValid && await event.locals.pb.collection('users').authRefresh()
        //get a fresh token 
    } catch(_) { //catching the error but dont need to use it _
        event.locals.pb.authStore.clear() //then ur logged out 
    }
    //check if the session is still good 

    event.locals.user = event.locals.pb.authStore.record //this stores the login status: has user record for logged in and null for not logged in 

    const response = await resolve(event)
    //run the rest of the request 

    //send the updatedcookie back
    response.headers.set(
        'set-cookie', //update the browser cookie 
        event.locals.pb.authStore.exportToCookie({secure:false})
    )

    return response
}

//ead the cookie → reconstruct who the user is → let the route do its thing → write the (possibly updated) cookie back. 
