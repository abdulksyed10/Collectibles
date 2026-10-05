import { createSafetyHandler } from './http.ts';
function required(name:string) { const v=Deno.env.get(name)?.trim(); if(!v) throw new Error(`Missing ${name}`); return v; }
const origins=required('MEDIA_ALLOWED_ORIGINS').split(',').map(v=>v.trim()).filter(Boolean);
Deno.serve(createSafetyHandler({origins}));
