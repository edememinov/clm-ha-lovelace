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
the card holds no session catalog and renders no private session names or options itself.

From 0.2.0 the embedded workspace has three tabs. **Items** lists the CLM items
your account may use and filters as you type; run an action to test it, and use
**CLM: Run CLM item** in an HA automation to run it from there. **Approvals**
lists CLM's requests to use your Home Assistant lights, buttons, sensors and
automations; allow or refuse them there. **Settings** holds the setup guide for
the integration's actions and **Check Windows workers**, which shows each PC's
online/offline status. Install the worker separately; updating HACS does not
install Windows files. Update the CLM backend, the integration (0.4.0) and this
card together.

Use HTTPS online; explicit HTTP URLs are supported on trusted local networks.
The integration's server URL can use the shared Docker network, while its web
app URLs must be reachable by your browser. The card sends the current HA
browser origin for exact approval checks. Automatic mode tries the local hostname,
its optional IP fallback and the default web URL from each browser, even when
HA uses its public hostname on the LAN. Choose
**CLM web address** in the native card editor to override this if needed.
HTTPS dashboards cannot embed HTTP workspaces; auto mode uses an HTTPS default
when available. The CLM frontend host must permit framing the
`/companions/workspace` route by each approved HA origin with CSP `frame-ancestors`.
Keep the ordinary application's existing framing policy. Configure the existing
CLM API origin normally; cross-origin API access must allow the workspace origin.
There is no dependency on third-party cookies for embedded requests.

The browser probes configured alternatives with credential-free HEAD requests.
DNS/connectivity failures try the next configured URL; if browser policy blocks
probes, the iframe handshake can still try alternatives. No credential is sent
before an exact-origin/exact-frame ready message. Account approval and embedding
use the same selected URL, validated by the integration's stored allowlist.
Update the integration and card together to 0.1.2 for IP fallback support.

Pushes to `main` automatically test/build the card, check that the committed
module matches the build and publish the version in `package.json` as a GitHub
release with `clm-card.js` attached. Card changes require a version bump;
published versions cannot be replaced. Documentation-only pushes and reruns do
not duplicate releases. A failed draft can be resumed for the same commit.
The workflow can also be started manually from GitHub Actions.

Dashboard configuration contains only `type`, `config_entry_id` and bounded
`height`, plus an optional presentation-only `workspace_mode` (local or online).
Credentials travel through authenticated HA WebSocket responses and
origin-checked postMessage, never URL parameters or browser persistent storage.
See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership and verification scope.
