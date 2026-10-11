# CLM Workspace Card

Independent thin Lovelace card for the
[CLM Companion integration](https://github.com/edememinov/clm-ha-component).
For HACS, add this repository as a custom **Dashboard** repository, then download
the card. Its JavaScript module resource is
`/hacsfiles/clm-ha-lovelace/clm-card.js` (HACS normally registers it automatically).

For manual installation, copy `dist/clm-card.js` to the HA `www`
directory and add `/local/clm-card.js` as a JavaScript module resource in
dashboard settings. Add **CLM Workspace** from the card picker and choose a CLM
connection with its native graphical editor.

For development, run `npm test` and `npm run build`. Commit the rebuilt
`dist/clm-card.js` alongside source changes: HACS downloads this file directly
and does not build the source. The `filename` in `hacs.json` must match it.

Link your own account, approve the request in signed-in CLM, then finish linking.
Each browser/card starts locked. The workspace uses actual shared CLM components;
the card holds no catalog and renders no private names or options itself.

Use HTTPS online; explicit HTTP URLs are supported on trusted local networks.
The integration's server URL can use the shared Docker network, while its web
app URLs must be reachable by your browser. The card sends the current HA
browser origin for exact approval checks. Automatic mode selects the local CLM
web URL at HA's internal address and the online/default URL otherwise. Choose
**CLM web address** in the native card editor to override this if needed.
HTTPS dashboards cannot embed HTTP workspaces; auto mode uses an HTTPS default
when available. The CLM frontend host must permit framing the
`/companions/workspace` route by each approved HA origin with CSP `frame-ancestors`.
Keep the ordinary application's existing framing policy. Configure the existing
CLM API origin normally; cross-origin API access must allow the workspace origin.
There is no dependency on third-party cookies for embedded requests.

Dashboard configuration contains only `type`, `config_entry_id` and bounded
`height`, plus an optional presentation-only `workspace_mode` (local or online).
Credentials travel through authenticated HA WebSocket responses and
origin-checked postMessage, never URL parameters or browser persistent storage.
See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and verification scope.
