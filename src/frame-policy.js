export function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid workspace origin.');
  }
  return url.origin;
}

export function configuration(value) {
  if (value.type !== 'custom:clm-card' || typeof value.config_entry_id !== 'string' || !value.config_entry_id || value.config_entry_id.length > 128) {
    throw new Error('Choose a CLM connection.');
  }
  const height = value.height ?? 640;
  if (!Number.isInteger(height) || height < 320 || height > 1600) throw new Error('Choose a height from 320 to 1600.');
  // Only presentation and a neutral installation reference can enter dashboard JSON.
  return { type: 'custom:clm-card', config_entry_id: value.config_entry_id, height };
}

export function readyMessage(event, frame, workspaceOrigin) {
  return event.origin === workspaceOrigin && event.source === frame.contentWindow &&
    event.data?.type === 'clm-companion-ready' && event.data.view === 'workspace' &&
    typeof event.data.nonce === 'string' && /^[A-Fa-f0-9-]{32,128}$/.test(event.data.nonce);
}

export function bindingMessage(event, frame, workspaceOrigin, nonce) {
  return event.origin === workspaceOrigin && event.source === frame.contentWindow && event.data?.type === 'clm-companion-binding'
    && event.data.nonce === nonce && /^[a-f0-9-]{36}$/i.test(event.data.binding ?? '')
    && /^automation\.[a-z0-9_]+$/.test(event.data.automation ?? '');
}

export function appendBinding(config, entry, binding) {
  if (!config.id || config.use_blueprint) throw new Error('Choose an existing editable automation.');
  const result = structuredClone(config);
  const key = Object.hasOwn(result, 'actions') ? 'actions' : 'action';
  const actions = result[key] == null ? [] : Array.isArray(result[key]) ? result[key] : [result[key]];
  if (!actions.some(action => (action.action ?? action.service) === 'clm.invoke' && action.data?.config_entry_id === entry && action.data?.binding === binding)) {
    actions.push({ alias: 'CLM approved action', action: 'clm.invoke', data: { config_entry_id: entry, binding } });
  }
  result[key] = actions;
  return result;
}
