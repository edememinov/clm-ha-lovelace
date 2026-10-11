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

Use HTTPS for all three origins. The CLM frontend host must permit framing the
`/companions/workspace` route by the approved HA origin with CSP `frame-ancestors`.
Keep the ordinary application's existing framing policy. Configure the existing
CLM API origin normally; cross-origin API access must allow the workspace origin.
There is no dependency on third-party cookies for embedded requests.

Dashboard configuration contains only `type`, `config_entry_id` and bounded
`height`. Credentials travel through authenticated HA WebSocket responses and
origin-checked postMessage, never URL parameters or browser persistent storage.
See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and verification scope.
