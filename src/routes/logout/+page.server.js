import {redirect} from '@sveltejs/kit'

export const actions = {
    default:  async ({locals}) => {
        //clear the auth store 
        locals.pb.authStore.clear()
        //redirect to login 
        throw redirect(303, '/login')
            
    }
}