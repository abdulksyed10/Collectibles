import type { Action } from './validation.ts';
export interface Session { query<T extends Record<string,unknown> = Record<string,unknown>>(sql:string,params?:unknown[]):Promise<T[]> }
export interface Database extends Session { transaction<T>(run:(tx:Session)=>Promise<T>):Promise<T> }
export interface ObjectStore { put(key:string,bytes:Uint8Array):Promise<void>; remove(keys:string[]):Promise<void>; sign(key:string):Promise<string> }
export function createMediaService(_db:Database,_store:ObjectStore,_deleteUser:(owner:string)=>Promise<void>) {
  return {async handle(_owner:string,_action:Action):Promise<unknown> { return {}; }};
}
