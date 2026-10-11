# Card architecture

The independent card repository owns a thin Home Assistant custom element and
native graphical configuration. It owns no CLM catalog, selection, editor,
dialog, palette or business policy. Embedded content is the actual shared CLM
workspace. HA owns its form and connection selectors.

The frame URL contains no credential. An exact-origin, exact-window ready
message supplies a random nonce. Private HA WebSocket ingress issues a short
lived grant for that nonce, view and audience. The shell delivers the grant with
an exact targetOrigin. Account/config changes and detach destroy the frame;
late requests are discarded using a generation counter. No credential is placed
in localStorage, card configuration, entity attributes or events.

Local CSS only defines necessary frame width/height/border geometry. Host
surfaces and controls retain HA ownership; the embedded CLM surface retains
shared CLM ownership. There are no private theme tokens or copied controls.

The card supplies `window.location.origin` and its presentation-only
`workspace_mode` on private WebSocket requests. HA selects one of the integration's
stored local/default web URLs and validates the exact approved HA origin. The
browser never supplies an arbitrary workspace URL. Pairing and embedding share
that selection. Native `ha-form` owns the Automatic/Local/Online selector and
field help. Explicit HTTP web origins are allowed for local use, while HTTPS
dashboards cannot load an HTTP frame. Existing dashboard configurations default
to Automatic without adding new keys to their saved JSON.

Unit tests cover origin/source spoofing, lifecycle races, neutral configuration,
grant delivery and native editor events. Live browser verification is not claimed.

An authenticated frame may hand off an opaque approved binding to an existing
native automation. Only an HA administrator can use the native configuration
endpoint. The shell reads the current definition twice and compares revisions
before saving, preserves triggers/conditions/actions, rejects blueprint or
unavailable file definitions and avoids duplicate binding steps. No private
labels, command inputs or credentials are copied into that configuration.

- https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/
- https://developers.home-assistant.io/docs/frontend/data/
- CLM Front-end/ui-redesign/ARCHITECTURE.md
