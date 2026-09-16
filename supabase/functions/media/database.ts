import postgres from 'postgres';
import type { Database,Session } from './service.ts';

export function connectDatabase(connectionString:string,allowLocal=false) {
  const parsed=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('Invalid database connection.');
  const local=['localhost','127.0.0.1','[::1]','db'].includes(parsed.hostname);
  if(local && !allowLocal)throw new Error('Local database access is disabled.');
  const client=postgres(connectionString,{
    max:1,prepare:false,connect_timeout:10,idle_timeout:20,
    ssl:local?false:{rejectUnauthorized:true},
    connection:{application_name:'collectibles-media',statement_timeout:30000,idle_in_transaction_session_timeout:120000},
  });
  const session=(sql:postgres.Sql|postgres.TransactionSql):Session=>({
    async query<T extends Record<string,unknown>>(query:string,params:unknown[]=[]) {
      return await sql.unsafe(query,params as never[]) as unknown as T[];
    },
  });
  const db:Database={...session(client),transaction:async run=>await client.begin(tx=>run(session(tx))) as Awaited<ReturnType<typeof run>>};
  return {db,close:()=>client.end({timeout:5})};
}
