import test from 'node:test';
import assert from 'node:assert/strict';

class Element extends EventTarget {
  constructor(tag = '') { super(); this.tagName = tag; this.children = []; this.style = {}; this.isConnected = false; this.contentWindow = { sent: [], postMessage(value, origin) { this.sent.push({value,origin}); } }; }
  attachShadow() { this.shadowRoot = new Element('shadow'); return this.shadowRoot; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name,value) { this[name] = value; }
  remove() { this.removed = true; }
}
globalThis.HTMLElement = Element;
const definitions = new Map();
globalThis.customElements = {get:name=>definitions.get(name),define:(name,value)=>definitions.set(name,value)};
globalThis.document = {createElement:tag=>new Element(tag)};
const listeners = new Map();
globalThis.window = {location:{origin:'https://hub.example'},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
const {ClmCard,ClmCardEditor} = await import('../src/clm-card.js');
const config = {type:'custom:clm-card',config_entry_id:'connection'};
const status = {linked:true,workspace_origin:'https://workspace.example',version:1};
const flush = () => new Promise(resolve=>setImmediate(resolve));

function setup(callWS) {
  const card = new ClmCard();
  card.setConfig(config);
  card.hass = {user:{id:'first'},connection:{},callWS};
  card.isConnected = true;
  card.connectedCallback();
  return card;
}
test('late view grants cannot hydrate a frame after an account change',async()=>{
  let finish;
  const card=setup(async message=>message.operation==='status' ? status : new Promise(resolve=>{finish=resolve;}));
  await flush();
  const frame=card._frame;
  const nonce='a'.repeat(64);
  const receiving=card._receive({origin:'https://workspace.example',source:frame.contentWindow,data:{type:'clm-companion-ready',view:'workspace',nonce}});
  card.hass={user:{id:'second'},connection:{},callWS:async()=>status};
  finish({grant:'secret',audience:'https://hub.example',nonce,view:'workspace'});
  await receiving;await flush();
  assert.equal(frame.removed,true);
  assert.deepEqual(frame.contentWindow.sent,[]);
  assert.notEqual(card._frame,frame);
  card.disconnectedCallback();
});
test('detach unregisters messages and prevents a pending grant from returning',async()=>{
  let finish;
  const card=setup(async message=>message.operation==='status' ? status : new Promise(resolve=>{finish=resolve;}));
  await flush();
  const frame=card._frame; const nonce='b'.repeat(64);
  const receiving=card._receive({origin:'https://workspace.example',source:frame.contentWindow,data:{type:'clm-companion-ready',view:'workspace',nonce}});
  card.isConnected=false;card.disconnectedCallback();
  finish({grant:'secret',audience:'https://hub.example',nonce,view:'workspace'});
  await receiving;
  assert.equal(listeners.has('message'),false);
  assert.deepEqual(frame.contentWindow.sent,[]);
  assert.equal(card._frame,null);
});
test('an account changed in place still destroys the previous frame',async()=>{
  const card=setup(async()=>status);await flush();
  const frame=card._frame;
  const sameObject=card._hass;sameObject.user.id='second';card.hass=sameObject;
  await flush();
  assert.equal(frame.removed,true);assert.notEqual(card._frame,frame);
  card.disconnectedCallback();
});
test('valid grants use an exact target origin and never the iframe URL',async()=>{
  const calls=[];
  const card=setup(async message=>{calls.push(message);return message.operation==='status' ? status : {grant:'secret',audience:'https://hub.example',nonce:message.nonce,view:'workspace'};});
  await flush();
  const frame=card._frame;const nonce='c'.repeat(64);
  await card._receive({origin:'https://workspace.example',source:frame.contentWindow,data:{type:'clm-companion-ready',view:'workspace',nonce}});
  assert.equal(frame.src,'https://workspace.example/companions/workspace');
  assert.equal(frame.contentWindow.sent[0].origin,'https://workspace.example');
  assert.equal(frame.contentWindow.sent[0].value.grant,'secret');
  assert.equal(calls[1].user_id,undefined);
  assert.equal(calls[0].audience,'https://hub.example');
  assert.equal(calls[1].audience,'https://hub.example');
  assert.equal(calls[0].workspace_mode,'auto');
  card.disconnectedCallback();
});
test('configuration editor uses HA form and emits neutral configuration',()=>{
  const editor=new ClmCardEditor();editor.setConfig(config);editor.hass={};
  const form=editor.shadowRoot.children[0];
  assert.equal(form.tagName,'ha-form');
  let result;editor.addEventListener('config-changed',event=>result=event.detail.config);
  form.dispatchEvent(new CustomEvent('value-changed',{detail:{value:{config_entry_id:'connection',height:400,credential:'secret'}}}));
  assert.deepEqual(result,{type:'custom:clm-card',config_entry_id:'connection',height:400});
  assert.match(form.computeHelper({name:'workspace_mode'}),/reachable by your browser/);
});

test('local override uses the configured local frame and the current browser audience',async()=>{
  const calls=[];
  const previous=window.location;
  window.location={origin:'http://192.168.1.10:8123',protocol:'http:'};
  const card=setup(async message=>{calls.push(message);return {...status,workspace_origin:'http://192.168.1.20:4200'};});
  card.setConfig({...config,workspace_mode:'local'});
  await flush();
  assert.equal(card._frame.src,'http://192.168.1.20:4200/companions/workspace');
  assert.equal(calls.at(-1).workspace_mode,'local');
  assert.equal(calls.at(-1).audience,'http://192.168.1.10:8123');
  card.disconnectedCallback();window.location=previous;
});
