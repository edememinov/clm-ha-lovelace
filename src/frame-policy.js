export function origin(value, allowHttp = false) {
  const url = new URL(value);
  if ((!['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Invalid workspace origin.');
  }
  return url.origin;
}

export function workspaceCandidates(status, browserOrigin) {
  const candidates = status.workspace_origins ?? [status.workspace_origin];
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 3) throw new Error('Invalid workspace addresses.');
  const secure = new URL(browserOrigin).protocol === 'https:';
  const allowed = [...new Set(candidates.map(value => origin(value, true)))].filter(value => !secure || value.startsWith('https:'));
  if (!allowed.length) throw new Error('HTTPS dashboards require an HTTPS CLM web address.');
  return allowed;
}

export async function reachableWorkspace(candidates, probe, timeoutMs = 2500) {
  if (!probe || candidates.length === 1) return candidates[0];
  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // This is browser-side reachability only. No cookies, credentials or grants
      // are sent; exact frame and server allowlist checks still own authorization.
      await probe(`${candidate}/companions/workspace`, {
        method: 'HEAD', mode: 'no-cors', credentials: 'omit', redirect: 'error',
        cache: 'no-store', signal: controller.signal,
      });
      return candidate;
    } catch { /* Try the next explicitly configured address. */ }
    finally { clearTimeout(timeout); }
  }
  // A connect-src policy may prohibit probes while permitting frames. Let the
  // actual frame handshake decide rather than blocking on a failed probe.
  return candidates[0];
}

export function configuration(value) {
  if (value.type !== 'custom:clm-card' || typeof value.config_entry_id !== 'string' || !value.config_entry_id || value.config_entry_id.length > 128) {
    throw new Error('Choose a CLM connection.');
  }
  const height = value.height ?? 640;
  const mode = value.workspace_mode ?? 'auto';
  if (!['auto', 'local', 'online'].includes(mode)) throw new Error('Choose automatic, local or online CLM access.');
  if (!Number.isInteger(height) || height < 320 || height > 1600) throw new Error('Choose a height from 320 to 1600.');
  // Only presentation and a neutral installation reference can enter dashboard JSON.
  return { type: 'custom:clm-card', config_entry_id: value.config_entry_id, height, ...(mode === 'auto' ? {} : { workspace_mode: mode }) };
}

export function readyMessage(event, frame, workspaceOrigin) {
  return event.origin === workspaceOrigin && event.source === frame.contentWindow &&
    event.data?.type === 'clm-companion-ready' && event.data.view === 'workspace' &&
    typeof event.data.nonce === 'string' && /^[A-Fa-f0-9-]{32,128}$/.test(event.data.nonce);
}

