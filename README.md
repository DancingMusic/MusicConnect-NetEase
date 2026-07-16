# MusicConnect-NetEase

网易云音乐的 DancingMusic **匿名连接器实现**。

- 实现 ID：`netease-cloud-music`
- 家族 ID：`netease-cloud-music`
- 变体：`anonymous`
- 登录要求：`none`
- 能力：搜索、歌曲信息、可用时的播放地址、歌词、歌单
- 主机：Web、Desktop

## 为什么不内置公共代理

社区项目 [Binaryify/NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 已停止维护，公共部署也不属于 DancingMusic，无法承诺稳定性、隐私或服务条款。因此 v0.5.2 起必须显式配置自己信任的兼容 HTTPS 网关，不再默认连接第三方 Vercel 实例。

```json
{
  "apiBaseUrl": "https://your-netease-gateway.example.com"
}
```

本地开发允许 `http://localhost` 或 `http://127.0.0.1`。匿名仓库不接受、保存或转发 `MUSIC_U`、Cookie、Token 和密码。

## 网关端点

- `GET /cloudsearch`
- `GET /song/detail`
- `GET /song/url/v1`
- `GET /lyric`
- `GET /top/playlist`
- `GET /playlist/track/all`

播放地址受版权、地区和上游实现限制，允许返回空值。

## 账号版边界

如需账号歌单、收藏或会员能力，将建立独立仓库和实现 ID（建议 `netease-cloud-music-account`），由主仓凭据代理管理会话。匿名连接器不会重新加入登录代码。

## 开发与发布

```bash
npm install
npm test
npm run build
```

针对已打包桌面 Release 调试时，先运行 `dancingmusic dev --watch --build`，再以
`--enable-local-dev-bridge` 启动具体 `.app`。CLI `/health` 中必须看到宿主连接和制品
读取，应用中必须显示“测试”标识；未配置 `apiBaseUrl` 时空列表是预期行为，不代表网关
联通成功。

生产环境请固定不可变版本：

```text
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-NetEase@v0.5.3/dist/index.js
```

统一文档：[DancingMusic Docs](https://dancingmusic.github.io/docs/)
