import { configuration, workspaceCandidates, reachableWorkspace, readyMessage, bindingMessage, appendBinding } from './frame-policy.js';

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
    if (!changed) this._refreshActionsGuide();
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
    clearTimeout(this._readyTimeout);
    this._frame?.remove();
    this._frame = null;
    this._nonce = null;
    this._requesting = false;
    this._guideBody = null;
    this._guideSignature = null;
    this._linked = false;
    this.shadowRoot.replaceChildren();
  }
  _ws(operation, extra = {}) {
    return this._hass.callWS({ type: 'clm/request', config_entry_id: this._config.config_entry_id,
      audience: window.location.origin, workspace_mode: this._config.workspace_mode ?? 'auto',
      ...(operation !== 'status' && this._canSelectWorkspace && this._origin ? {workspace_origin:this._origin} : {}), operation, ...extra });
  }
  _surface(text) {
    clearTimeout(this._readyTimeout);
    this._frame?.remove();
    this._frame = null;
    this._nonce = null;
    this._requesting = false;
    const card = document.createElement('ha-card');
    card.header = 'CLM';
    const content = document.createElement('div');
    content.className = 'card-content';
    content.setAttribute('role', 'status');
    content.setAttribute('aria-live', 'polite');
    content.textContent = text;
    card.append(content);
    this._addActionsGuide(card);
    this.shadowRoot.replaceChildren(card);
    return content;
  }
  _addActionsGuide(card) {
    const content = document.createElement('div');
    content.className = 'card-content';
    const disclosure = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'HA automation actions and setup';
    this._guideBody = document.createElement('div');
    this._guideSignature = null;
    disclosure.append(summary, this._guideBody);
    content.append(disclosure);
    card.append(content);
    this._refreshActionsGuide();
  }
  _refreshActionsGuide() {
    if (!this._guideBody) return;
    const actions = [
      ['start_session', 'Start session and open Selkies', 'device, PIN, exact preset name, incognito'],
      ['open_selkies', 'Open matching Selkies viewers', 'device, PIN, session name contains, all/latest, incognito'],
      ['open_clm', 'Open CLM window', 'device, PIN, incognito'],
      ['list_devices', 'List CLM Windows workers', 'shared device names, IDs, online/offline status and worker version'],
    ];
    const availability = actions.map(([id]) => Boolean(this._hass?.services?.clm?.[id]));
    const signature = JSON.stringify([availability, this._linked, this._origin, this._config?.config_entry_id]);
    if (signature === this._guideSignature) return;
    this._guideSignature = signature;
    const paragraph = text => { const node = document.createElement('p'); node.textContent = text; return node; };
    const list = document.createElement('ul');
    actions.forEach(([id, label, inputs], index) => {
      const row = document.createElement('li');
      row.textContent = `${label} (clm.${id}): ${availability[index] ? 'Registered in HA' : 'Not registered — update the CLM integration and restart HA'}. ${inputs}.`;
      list.append(row);
    });
    const guide = document.createElement('a');
    guide.href = 'https://github.com/edememinov/clm-ha-component/blob/main/docs/native-actions.md';
    guide.target = '_blank'; guide.rel = 'noopener noreferrer';
    guide.textContent = 'Step-by-step setup in the HA automation builder';
    const nodes = [
      paragraph('HA owns the trigger. In your HA automation, choose Then do > Add action and search CLM. These are actions, not MQTT entities. The card can stay outside Personal Mode.'),
      paragraph(this._linked ? 'Your account is linked. Actions use its CLM permissions; each launch supplies the current PIN.' : 'Link your own CLM account above before running actions.'),
      list,
      paragraph('In the action editor, select your CLM connection, enter the device name and PIN, enter the preset or session name, and set the Incognito window toggle. Save the automation. No YAML editing is required.'),
      paragraph('Install the Windows worker separately: import its UI package into CLM, open Plugin tools > Window visibility > Windows setup, download setup and run it as the Windows user who opens the browser. HACS does not install files on the PC. The Windows user must be logged in.'),
      paragraph('Choose the same name shown in CLM Devices. Run List CLM Windows workers in HA to check online/offline status; registration above does not confirm worker connectivity. Hide/show enable switches do not control these launch actions.'),
      paragraph('Start session takes the exact preset name and opens Selkies directly. Open matching Selkies viewers uses existing sessions: latest chooses the newest match, all opens every match. Incognito false opens normal windows; true opens private windows. Supply the PIN in the HA action; it is never sent to Windows. HA traces can contain it.'),
      guide,
    ];
    const workers = document.createElement('div');
    const outcome = paragraph(this._linked ? 'Check your workers to see which PCs are online.' : 'Link your account before checking workers.');
    outcome.setAttribute('role', 'status'); outcome.setAttribute('aria-live', 'polite');
    const generation = this._generation;
    this._button(workers, 'Check Windows workers', async () => {
      outcome.textContent = 'Checking Windows workers…';
      try {
        const result = await this._hass.callWS({type:'call_service',domain:'clm',service:'list_devices',
          service_data:{config_entry_id:this._config.config_entry_id},return_response:true});
        if (generation !== this._generation || !this.isConnected) return;
        const rows = result?.response?.devices;
        if (!Array.isArray(rows)) throw new Error();
        outcome.textContent = rows.length ? rows.map(row => `${row.name}: ${row.online ? 'online' : 'offline'} (worker ${row.version || 'unknown version'})`).join('; ')
          : 'No Windows workers have reported yet. Download and run Windows setup on the PC.';
      } catch {
        if (generation === this._generation) outcome.textContent = 'Could not check workers. Verify your account link, CLM permissions and updated backend.';
      }
    });
    workers.children[0].disabled = !this._linked || !availability[3];
    workers.append(outcome); nodes.splice(3,0,workers);
    if (this._origin) {
      const setup = document.createElement('a');
      setup.href = `${this._origin}/tools/plugins/window-visibility/settings`;
      setup.target = '_blank'; setup.rel = 'noopener noreferrer';
      setup.textContent = 'Open Windows worker setup in CLM';
      const wrapper = document.createElement('p'); wrapper.append(setup); nodes.push(wrapper);
    }
    this._guideBody.replaceChildren(...nodes);
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
      this._linked = Boolean(status.linked);
      this._candidates = workspaceCandidates(status, window.location.origin);
      this._canSelectWorkspace = Array.isArray(status.workspace_origins);
      const selected = await reachableWorkspace(this._candidates, window.fetch?.bind(window));
      if (generation !== this._generation || !this.isConnected) return;
      this._origin = selected;
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
      this._mountFrame(generation);
    } catch (error) {
      if (generation === this._generation) this._surface(error?.code === 'invalid_browser_address'
        ? 'This Home Assistant address is not approved or the CLM web address cannot be embedded. Reconfigure the CLM integration or choose another web address in the card editor.'
        : 'CLM connection is unavailable.');
    }
  }
  _mountFrame(generation) {
    clearTimeout(this._readyTimeout);
    this._frame?.remove();
    this._nonce = null;
    this._requesting = false;
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
    this._addActionsGuide(surface);
    surface.append(frame);
    this.shadowRoot.replaceChildren(surface);
    const remaining = this._candidates.filter(value => value !== this._origin);
    this._readyTimeout = setTimeout(() => {
      if (generation !== this._generation || frame !== this._frame || !this.isConnected) return;
      if (remaining.length && this._canSelectWorkspace) {
        this._candidates = remaining;
        this._origin = remaining[0];
        this._mountFrame(generation);
      } else {
        this._surface('The CLM web app did not respond. Check its browser URLs in the integration, or choose another address in the card editor.');
      }
    }, 10000);
  }
  async _receive(event) {
    const frame = this._frame;
    if (frame && this._nonce && bindingMessage(event, frame, this._origin, this._nonce)) {
      await this._attachBinding(event, frame);
      return;
    }
    if (!frame || !readyMessage(event, frame, this._origin) || this._requesting || this._nonce === event.data.nonce) return;
    clearTimeout(this._readyTimeout);
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
      if (generation === this._generation && frame === this._frame) this._requesting = false;
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
  setConfig(value) { this._config = { type: 'custom:clm-card', config_entry_id: value.config_entry_id ?? '', height: value.height ?? 640, workspace_mode: value.workspace_mode ?? 'auto' }; this._render(); }
  set hass(value) { this._hass = value; this._render(); }
  _render() {
    if (!this._hass || !this._config) return;
    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._config;
    form.schema = [
      { name: 'config_entry_id', required: true, selector: { config_entry: { integration: 'clm' } } },
      { name: 'height', selector: { number: { min: 320, max: 1600, step: 40, mode: 'box' } } },
      { name: 'workspace_mode', selector: { select: { mode: 'dropdown', options: [
        { value: 'auto', label: 'Automatic' }, { value: 'local', label: 'Local' }, { value: 'online', label: 'Online / default' },
      ] } } },
    ];
    form.computeLabel = field => ({ height: 'Workspace height', config_entry_id: 'CLM connection', workspace_mode: 'CLM web address' })[field.name];
    form.computeHelper = field => ({
      config_entry_id: 'The integration connection used to link your own CLM account and send actions.',
      height: 'The height of the embedded CLM workspace, in pixels.',
      workspace_mode: 'Automatic tries the local hostname, its IP fallback, then the default URL from this browser. Local tries only the local addresses. Online uses the default URL. Addresses must be reachable by your browser; HTTPS dashboards require HTTPS web addresses.',
    })[field.name];
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
