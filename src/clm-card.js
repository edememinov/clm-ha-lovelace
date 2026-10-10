import { configuration, origin, readyMessage, bindingMessage, appendBinding } from './frame-policy.js';

export class ClmCard extends HTMLElement {
  static getConfigElement() { return document.createElement('clm-card-editor'); }
  static getStubConfig() { return { type: 'custom:clm-card', config_entry_id: '', height: 640 }; }
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._generation = 0;
    this._message = event => this._receive(event);
  }
  setConfig(value) {
    this._config = configuration(value);
    this._reset();
    if (this.isConnected && this._hass) this._load();
  }
  set hass(value) {
    const changed = this._actor !== value.user?.id || this._connection !== value.connection;
    this._actor = value.user?.id;
    this._connection = value.connection;
    this._hass = value;
    if (changed) {
      this._reset();
      if (this.isConnected && this._config) this._load();
    }
  }
  getCardSize() { return Math.ceil((this._config?.height ?? 640) / 50); }
  getGridOptions() { return { columns: 12, min_columns: 3, rows: Math.ceil((this._config?.height ?? 640) / 56), min_rows: 6 }; }
  connectedCallback() {
    window.addEventListener('message', this._message);
    if (this._config && this._hass) this._load();
  }
  disconnectedCallback() {
    window.removeEventListener('message', this._message);
    this._reset();
  }
  _reset() {
    this._generation++;
    this._frame?.remove();
    this._frame = null;
    this._nonce = null;
    this._requesting = false;
    this.shadowRoot.replaceChildren();
  }
  _ws(operation, extra = {}) {
    return this._hass.callWS({ type: 'clm/request', config_entry_id: this._config.config_entry_id, operation, ...extra });
  }
  _surface(text) {
    const card = document.createElement('ha-card');
    card.header = 'CLM';
    const content = document.createElement('div');
    content.className = 'card-content';
    content.setAttribute('role', 'status');
    content.setAttribute('aria-live', 'polite');
    content.textContent = text;
    card.append(content);
    this.shadowRoot.replaceChildren(card);
    return content;
  }
  _button(container, text, action) {
    const button = document.createElement('ha-button');
    button.textContent = text;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try { await action(); }
      catch { this._surface('CLM request failed. Reload the card to retry.'); }
      finally { button.disabled = false; }
    });
    container.append(button);
  }
  async _load() {
    const generation = this._generation;
    this._surface('Connecting to CLM…');
    try {
      const status = await this._ws('status');
      if (generation !== this._generation || !this.isConnected) return;
      if (status.version !== 1) throw new Error('Unsupported version.');
      this._origin = origin(status.workspace_origin);
      if (!status.linked) {
        const content = this._surface('Link your own CLM account.');
        this._button(content, 'Link account', async () => {
          // Open synchronously while the browser still has user activation.
          const popup = window.open('about:blank', '_blank');
          if (popup) popup.opener = null;
          try {
            const result = await this._ws('pair');
            if (generation !== this._generation) { popup?.close(); return; }
            const approval = new URL(result.approval_url);
            if (approval.origin !== this._origin || approval.username || approval.password || !/^\/companions\/pair\/[a-f0-9-]+\/[a-f0-9-]+$/.test(approval.pathname) || approval.search || approval.hash) throw new Error();
            if (popup) popup.location.href = approval.href;
            else {
              const link = document.createElement('a');
              link.href = approval.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Approve account link in CLM';
              content.append(link);
            }
          } catch (error) { popup?.close(); throw error; }
        });
        this._button(content, 'Finish linking', async () => {
          const result = await this._ws('exchange');
          if (generation !== this._generation) return;
          if (!result.approved) { content.firstChild.textContent = 'Approve the request in CLM, then finish linking.'; return; }
          this._reset();
          await this._load();
        });
        return;
      }
      const frame = document.createElement('iframe');
      frame.title = 'CLM workspace';
      frame.src = `${this._origin}/companions/workspace`;
      frame.referrerPolicy = 'origin';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
      frame.style.width = '100%';
      frame.style.height = `${this._config.height}px`;
      frame.style.border = '0';
      this._frame = frame;
      const surface = document.createElement('ha-card');
      surface.append(frame);
      this.shadowRoot.replaceChildren(surface);
    } catch {
      if (generation === this._generation) this._surface('CLM connection is unavailable.');
    }
  }
  async _receive(event) {
    const frame = this._frame;
    if (frame && this._nonce && bindingMessage(event, frame, this._origin, this._nonce)) {
      await this._attachBinding(event, frame);
      return;
    }
    if (!frame || !readyMessage(event, frame, this._origin) || this._requesting || this._nonce === event.data.nonce) return;
    const generation = this._generation;
    const nonce = event.data.nonce;
    this._requesting = true;
    try {
      const result = await this._ws('view', { nonce });
      if (generation !== this._generation || frame !== this._frame || !this.isConnected) return;
      if (result.nonce !== nonce || result.audience !== window.location.origin || result.view !== 'workspace') throw new Error();
      this._nonce = nonce;
      frame.contentWindow.postMessage({ type: 'clm-companion-grant', grant: result.grant, nonce, audience: result.audience, view: 'workspace' }, this._origin);
    } catch {
      if (generation === this._generation) this._surface('CLM account authorization is unavailable.');
    } finally {
      if (generation === this._generation) this._requesting = false;
    }
  }
  async _attachBinding(event, frame) {
    if(this._editing) return;
    this._editing = true;
    const generation = this._generation;
    let ok = false;
    try {
      // Use the same admin-gated configuration APIs as HA's existing editor.
      // No new automation is created and no definition is persisted in CLM.
      const live = await this._hass.callWS({type:'automation/config',entity_id:event.data.automation});
      if(!live.config?.id || live.config.use_blueprint) throw new Error();
      const path = `config/automation/config/${encodeURIComponent(live.config.id)}`;
      const current = await this._hass.callApi('GET', path);
      const updated = appendBinding(current, this._config.config_entry_id, event.data.binding);
      const latest = await this._hass.callApi('GET', path);
      if(generation !== this._generation || frame !== this._frame || JSON.stringify(current) !== JSON.stringify(latest)) throw new Error();
      await this._hass.callApi('POST', path, updated);
      ok = true;
    } catch { /* Only a neutral outcome returns to the embedded view. */ }
    finally {
      this._editing = false;
      if(generation === this._generation && frame === this._frame) frame.contentWindow.postMessage({type:'clm-companion-binding-result',nonce:this._nonce,ok},this._origin);
    }
  }
}

export class ClmCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  setConfig(value) { this._config = { type: 'custom:clm-card', config_entry_id: value.config_entry_id ?? '', height: value.height ?? 640 }; this._render(); }
  set hass(value) { this._hass = value; this._render(); }
  _render() {
    if (!this._hass || !this._config) return;
    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._config;
    form.schema = [
      { name: 'config_entry_id', required: true, selector: { config_entry: { integration: 'clm' } } },
      { name: 'height', selector: { number: { min: 320, max: 1600, step: 40, mode: 'box' } } },
    ];
    form.computeLabel = field => field.name === 'height' ? 'Workspace height' : 'CLM connection';
    form.addEventListener('value-changed', event => {
      event.stopPropagation();
      const config = configuration({ type: 'custom:clm-card', ...event.detail.value });
      this._config = config;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    });
    this.shadowRoot.replaceChildren(form);
  }
}

if (!customElements.get('clm-card')) customElements.define('clm-card', ClmCard);
if (!customElements.get('clm-card-editor')) customElements.define('clm-card-editor', ClmCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some(card => card.type === 'clm-card')) window.customCards.push({ type: 'clm-card', name: 'CLM Workspace', description: 'Your individually linked CLM workspace.', preview: false });
