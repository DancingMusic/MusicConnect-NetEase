# @dancingmusic/music-connect-netease

NetEase Cloud Music (网易云音乐) connector for [DancingMusic](https://github.com/DancingMusic/DancingMusic).

🔗 **Live demo:** [https://dancingmusic.github.io/MusicConnect-NetEase/](https://dancingmusic.github.io/MusicConnect-NetEase/) — search + play table built from this connector's own `dist/index.js`.

Backed by [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi). Defaults to the public deployment at `https://netease-cloud-music-api-theta-ten.vercel.app` — pass your own via the `apiBaseUrl` config field for higher quotas / unlocked tracks.

## Use in DancingMusic

This connector is auto-loaded as the default data source. To add an extra instance pointing at your own proxy:

1. Open the music store → connector switcher (top-right) → **添加连接器** → **GitHub** tab → paste:
   ```
   https://github.com/DancingMusic/MusicConnect-NetEase
   ```
2. After it loads, click the gear icon on the new connector to set `apiBaseUrl`.

## Track ID format

`netease:<numeric-id>` — e.g. `netease:33894312`

## Stream URL fallback

NetEase locks most paid tracks behind login cookies. When the proxy can't return a playable URL, the host's `resolvePlayableUrl` falls back to the public outer-url endpoint (`music.163.com/song/media/outer/url?id=X.mp3`) which works for free songs + 30-second previews of paid songs.

## API endpoints used

- `GET /cloudsearch` — search
- `GET /song/detail` — track detail
- `GET /song/url/v1` — stream URL
- `GET /lyric` — lyrics

## License

MIT

## Versioned releases

This repo uses an auto-release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) that creates a `v<package.json version>` tag + GitHub Release on every push to `main` whose version field has changed. Each release attaches the freshly-built `dist/index.js`.

**Pin to a specific version** (recommended for production):
```
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-NetEase@v0.1.1/dist/index.js
```

**Always-latest** (handy for dev, but jsdelivr caches `@main` for up to a week):
```
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-NetEase@main/dist/index.js
```

### Releasing a new version

1. Edit code under `src/`
2. `npm version patch` (or `minor` / `major`) — bumps `package.json`
3. `npm run build` — refreshes `dist/index.js`
4. Commit (including `dist/`) + push to `main`
5. The workflow detects the new version, creates the tag, and publishes the GitHub Release automatically
