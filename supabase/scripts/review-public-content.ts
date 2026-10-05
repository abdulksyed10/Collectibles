import { connectDatabase } from '../functions/media/database.ts';
import { createR2Store } from '../functions/media/r2.ts';
function required(name:string) { const v=Deno.env.get(name); if(!v) throw new Error(`Missing ${name}`);return v; }
const [action='queue',id,revisionArg,reason='']=Deno.args;
const {db,close}=connectDatabase(required('MEDIA_DATABASE_URL'));
const uuid=(value:string|undefined)=>Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
const escape=(v:string)=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
try {
  if(action==='queue') {
    const rows=await db.query("SELECT p.item_id,p.revision,p.submitted_at FROM private.item_publication p JOIN public.items i ON i.id=p.item_id AND i.visibility='public' WHERE p.status='pending' ORDER BY p.submitted_at LIMIT 50");
    console.table(rows);
  } else if(action==='view' && uuid(id)) {
    const [row]=await db.query<{item_id:string;revision:number;title:string;name:string;full_key:string|null;thumb_key:string|null}>("SELECT p.item_id,p.revision,i.title,c.name,img.full_key,img.thumb_key FROM private.item_publication p JOIN public.items i ON i.id=p.item_id AND i.visibility='public' JOIN public.collections c ON c.id=i.collection_id LEFT JOIN public.item_images img ON img.item_id=i.id WHERE p.item_id=$1",[id]);
    if(!row)throw new Error('Entry unavailable');
    const store=createR2Store({accountId:required('R2_ACCOUNT_ID'),bucket:required('R2_BUCKET_NAME'),accessKeyId:required('R2_ACCESS_KEY_ID'),secretAccessKey:required('R2_SECRET_ACCESS_KEY')});
    const pictures=[];
    for(const [label,key] of [['Full image',row.full_key],['Thumbnail',row.thumb_key]]) if(key) pictures.push(`<h2>${label}</h2><img style="max-width:100%" referrerpolicy="no-referrer" src="${escape(await store.sign(key))}">`);
    await Deno.mkdir('.tmp',{recursive:true});
    await Deno.writeTextFile('.tmp/moderation-preview.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'"><title>Local publication review</title></head><body><h1>${escape(row.title)}</h1><p>${escape(row.name)}</p><p>Entry ${escape(row.item_id)} · revision ${row.revision}</p>${pictures.join('') || '<p>No photo</p>'}</body></html>`);
    console.log(`Review .tmp/moderation-preview.html. Approve only revision ${row.revision} after inspecting both images and text. Image links expire in five minutes.`);
  } else if(['approve','reject','remove'].includes(action) && uuid(id) && /^\d+$/.test(revisionArg??'') && Number(revisionArg)>0 && reason.length<=280) {
    await db.query('SELECT private.review_publication($1,$2,$3,$4)',[id,Number(revisionArg),{approve:'approved',reject:'rejected',remove:'removed'}[action],reason]);
    console.log('Review saved for that revision.');
  } else if(action==='reports') {
    // Free text is opened separately, not emitted into ordinary terminal logs.
    console.table(await db.query("SELECT id,item_id,collection_id,reason,created_at FROM private.public_content_reports WHERE status='open' ORDER BY created_at LIMIT 50"));
  } else if(action==='report' && /^\d+$/.test(id??'')) {
    const [row]=await db.query<{reason:string;details:string}>('SELECT reason,details FROM private.public_content_reports WHERE id=$1',[id]);
    if(!row) throw new Error('Report unavailable');
    await Deno.mkdir('.tmp',{recursive:true});
    await Deno.writeTextFile('.tmp/report-preview.txt',`Reason: ${row.reason}\n\n${row.details}`);
    console.log('Report details saved to ignored .tmp/report-preview.txt.');
  } else if(action==='resolve' && /^\d+$/.test(id??'') && ['resolved','dismissed'].includes(revisionArg??'') && reason.length<=500) {
    await db.query("UPDATE private.public_content_reports SET status=$2,reviewed_at=now(),reviewer_note=$3 WHERE id=$1",[id,revisionArg,reason]);
    console.log('Report resolution saved. Remove inappropriate entries separately before resolving.');
  } else if(action==='suspend' && uuid(id)) {
    // ID is a public publisher ID, not a submitted Auth owner ID.
    await db.query('INSERT INTO private.publisher_restrictions(owner_id,publishing_suspended) SELECT owner_id,true FROM private.public_publishers WHERE public_id=$1 ON CONFLICT(owner_id) DO UPDATE SET publishing_suspended=true,updated_at=now()',[id]);
    console.log('Publisher public visibility suspended.');
  } else throw new Error('Invalid command');
} catch {
  console.error('Review action failed. Check arguments/configuration and refresh the queue if the revision changed. No provider details logged.'); Deno.exitCode=1;
}finally{await close();}
