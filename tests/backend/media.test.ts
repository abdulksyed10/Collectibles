import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { readBoundedJson, validateAction, validateJpegBase64 } from '../../supabase/functions/media/validation.ts';

const id = '00000000-0000-4000-8000-000000000001';
const pixel = () => jpeg.encode({ width: 1, height: 1, data: Buffer.from([255, 0, 0, 255]) }, 80).data;

test('JPEG validation decodes real images and rejects disguised, truncated, excessive and invalid base64 content', () => {
  const valid = pixel();
  assert.equal(validateJpegBase64(valid.toString('base64'), false).length, valid.length);
  assert.throws(() => validateJpegBase64(Buffer.from('not a jpeg').toString('base64'), false), /JPEG/);
  assert.throws(() => validateJpegBase64(Buffer.from([255,216,255,217]).toString('base64'), false), /JPEG/);
  assert.throws(() => validateJpegBase64(valid.subarray(0,valid.length-2).toString('base64'), false), /JPEG/);
  assert.throws(() => validateJpegBase64('###', false), /base64/);
  assert.throws(() => validateJpegBase64('A'.repeat(2796208), false), /large/);
  assert.throws(() => validateJpegBase64('A'.repeat(273068), true), /large/);
});

test('decoded dimensions are limited before allocating excessive pixels', () => {
  const valid = Buffer.from(pixel());
  const sof = valid.indexOf(Buffer.from([255,192]));
  assert.ok(sof > 0);
  valid.writeUInt16BE(16000, sof+5);
  valid.writeUInt16BE(16000, sof+7);
  assert.throws(() => validateJpegBase64(valid.toString('base64'), false), /dimensions|JPEG/);
});

test('bounded JSON reader rejects declared and streamed excess, invalid JSON and unsupported content types', async () => {
  await assert.rejects(readBoundedJson(new Request('https://local', { method:'POST', headers:{'content-type':'application/json','content-length':'4000000'}, body:'{}' })), /large/);
  const chunks = [new Uint8Array(2000000),new Uint8Array(2000000)];
  let cancelled = false;
  const stream = new ReadableStream({ pull(c) { const next=chunks.shift(); if(next)c.enqueue(next); else c.close(); }, cancel(){cancelled=true;} });
  await assert.rejects(readBoundedJson(new Request('https://local', { method:'POST', headers:{'content-type':'application/json'},body:stream,duplex:'half' } as RequestInit)), /large/);
  assert.equal(cancelled,true);
  await assert.rejects(readBoundedJson(new Request('https://local',{method:'POST',body:'{}'})), /content type/);
  await assert.rejects(readBoundedJson(new Request('https://local',{method:'POST',headers:{'content-type':'application/json'},body:'{'})), /JSON/);
  assert.deepEqual(await readBoundedJson(new Request('https://local',{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"delete-account"}'})), {action:'delete-account'});
});

test('media action validation never accepts arbitrary keys or unbounded read batches', () => {
  assert.deepEqual(validateAction({action:'read',pinIds:[id,id]}), {action:'read',pinIds:[id]});
  assert.throws(() => validateAction({action:'read',pinIds:Array(101).fill(id)}), /100/);
  assert.throws(() => validateAction({action:'read',pinIds:['../other-user']}), /UUID/);
  assert.throws(() => validateAction({action:'delete-pin',pinId:id,full_key:'other/key'}), /Unexpected/);
  assert.throws(() => validateAction({action:'upload',pinId:id,imageBase64:'',thumbnailBase64:''}), /image/);
  assert.throws(() => validateAction({action:'unknown'}), /action/);
});
