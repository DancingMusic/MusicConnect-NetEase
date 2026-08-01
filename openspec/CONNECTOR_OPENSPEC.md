# OpenSpec: NetEase Anonymous Connector

- Spec-ID: `netease-cloud-music-anonymous-connector`
- Version: `1.0.0`
- Status: `Active`
- Last-Updated: `2026-08-01`

## Artwork

The connector MUST preserve the provider's real track and playlist artwork in
MusicConnect `coverUrl`. HTTP URLs on the reviewed NetEase image hosts
`p1.music.126.net` through `p4.music.126.net` MUST be upgraded to HTTPS before
they leave the connector. Other hosts MUST NOT be rewritten or promoted into a
trusted artwork origin.

MusicStore reviews those four exact HTTPS origins independently from the
anonymous catalog gateway. Artwork permission authorizes only the host-owned
cover resolver and MUST NOT expand connector network access or carry Cookie,
token, password, or other account credentials.

## Verification

Contract tests MUST cover HTTP-to-HTTPS normalization for both track and
playlist covers. Run `npm test` and `npm run build` before release.
