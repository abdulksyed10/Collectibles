import { requireClient } from '../lib/supabase';
export async function registerAppleGrant(input:{code?:string;refreshToken?:string;clientId:string}) {
  const {error}=await requireClient().functions.invoke('provider-grants',{body:input});
  if(error) throw new Error('Apple sign-in could not be completed. Please try again.');
}
