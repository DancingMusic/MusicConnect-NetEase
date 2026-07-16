# OpenSpec: NetEase Anonymous Connector

- Spec-ID: `netease-anonymous-connector`
- Version: `1.0.0`
- Status: `Active`
- Last-Updated: `2026-07-16`

## Release integration testing

This implementation is tested against a packaged DancingMusic desktop Release
through the loopback CLI Dev Bridge. The repository MUST carry a valid
`dancingmusic.json`, build `dist/index.js`, appear as a session-only testing
connector, hot reload after a successful rebuild, and disappear after the
Release restarts without developer mode.

Connectivity requires an explicitly configured compatible gateway. Production
gateways use HTTPS; loopback HTTP is allowed only for local contract fixtures.
An unconfigured empty catalog is expected behavior and is not proof of
connectivity. Functional acceptance covers search, playlists, playlist tracks,
lyrics, real playback when the provider returns a stream, locked-track handling
and provider artwork.

Track and playlist artwork remains the provider's real `coverUrl`. MusicStore
reviews the expected HTTPS artwork origins separately; the connector does not
replace provider covers with a host default or put credentials in artwork URLs.
