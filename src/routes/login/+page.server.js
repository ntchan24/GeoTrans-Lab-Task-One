import {redirect, fail} from '@sveltejs/kit'
//redirect to another url 

//sveltekit form actions pattern 
//anything exported as actions from a page.server.js 
//becomes a handler for form POSTs to that route
// {actionName : handler}
//can have multiple named actions on one page 

export const actions ={
    //explaining default:
    //the default form action on theis page is an asunc function that receives the request event, but i only care about the request and locals properties of it 
    default: async ({request, locals}) =>{
        const data = await request.formData()// parse the POST body as form data 
        //returns a formdata object which is a key val map of the form fields
        const email = data.get('email')
        const password = data.get('password')


        //this is the actual login 
        try {
            await locals.pb.collection('users').authWithPassword(email, password)
            //locals.pb is the pocketbase clie3nt. 
            //authwithpassword sends email and password to pocketbase, and if they match then pb returns a user record and a token 
            //also stores it in pb.authstore

            //the token is exported to a cookie and sent back to the browser 

        } catch (err) {
            return fail(400, {error: 'Invalid credentials'})
        }

        throw redirect(303, '/')
    }
}
