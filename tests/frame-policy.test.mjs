import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration, origin, readyMessage, workspaceCandidates, reachableWorkspace } from '../src/frame-policy.js';

test('configuration retains presentation and connection reference only', () => {
  assert.deepEqual(configuration({type:'custom:clm-card', config_entry_id:'connection', pin:'1234', credential:'secret', height:400}),
    {type:'custom:clm-card', config_entry_id:'connection', height:400});
  for (const height of [0, 319, 1601, 640.5]) assert.throws(() => configuration({type:'custom:clm-card', config_entry_id:'connection', height}));
});
test('workspace origin cannot carry credentials, paths or weaker transport', () => {
  assert.equal(origin('https://workspace.example/'), 'https://workspace.example');
  for (const value of ['http://workspace.example', 'https://user:secret@workspace.example', 'https://workspace.example/path', 'https://workspace.example/?token=secret']) assert.throws(() => origin(value));
});

test('configured local HTTP workspace is accepted explicitly, with web-only origins', () => {
  assert.equal(origin('http://192.168.1.20:4200/', true), 'http://192.168.1.20:4200');
  for (const value of ['ftp://server', 'http://user:secret@server', 'http://server/path']) assert.throws(() => origin(value, true));
  assert.equal(configuration({type:'custom:clm-card',config_entry_id:'entry',workspace_mode:'local'}).workspace_mode, 'local');
  assert.throws(() => configuration({type:'custom:clm-card',config_entry_id:'entry',workspace_mode:'arbitrary'}));
});
test('ready messages require exact source, origin, view and bounded nonce', () => {
  const frame = {contentWindow:{}};
  const event = {origin:'https://workspace.example', source:frame.contentWindow, data:{type:'clm-companion-ready', view:'workspace', nonce:'a'.repeat(64)}};
  assert.equal(readyMessage(event, frame, event.origin), true);
  assert.equal(readyMessage({...event,source:{}}, frame, event.origin), false);
  assert.equal(readyMessage({...event,origin:'https://other.example'}, frame, event.origin), false);
  assert.equal(readyMessage({...event,data:{...event.data,nonce:'x'.repeat(1000)}}, frame, event.origin), false);
});

test('DNS failure uses the configured IP address without sending browser credentials', async()=>{
  const calls=[];
  const candidates=['https://clm.local','https://192.168.1.20:8443','https://clm.example'];
  const chosen=await reachableWorkspace(candidates,async(url,options)=>{
    calls.push({url,options});
    if(url.startsWith(candidates[0]))throw new Error('DNS failure');
    return {};
  });
  assert.equal(chosen,candidates[1]);
  assert.equal(calls.length,2);
  for(const {options} of calls){assert.equal(options.credentials,'omit');assert.equal(options.method,'HEAD');assert.equal(options.headers,undefined);assert.equal(options.redirect,'error');}
});

test('failed probes do not prevent frame checks, and HTTPS filters HTTP fallback', async()=>{
  const status={workspace_origin:'https://clm.example',workspace_origins:['https://clm.local','http://192.168.1.20:4200','https://clm.example']};
  assert.deepEqual(workspaceCandidates(status,'https://ha.example'),['https://clm.local','https://clm.example']);
  assert.equal(await reachableWorkspace(['https://clm.local','https://clm.example'],async()=>{throw new Error('CSP blocked');}),'https://clm.local');
  assert.throws(()=>workspaceCandidates({workspace_origin:'http://clm.local'},'https://ha.example'));
});
