# 必办时间表 · 企业微信应用

把「日后要催我的名单」放进企业微信自建应用。到点用**应用消息**推给你，间隔自己定。

密钥全部走环境变量，仓库里是空的。部署到 Vercel 后再填，填完才能过 URL 验证。

## 企业微信要验证的其实是两件事

很多人卡在「验证 URL」，后台其实有两类：

| 位置 | 填什么 | 本项目对应 |
| --- | --- | --- |
| 应用主页 | `https://你的项目.vercel.app` | 根路径页面（时间表） |
| 网页授权及 JS-SDK → 可信域名 | 只填主机名 `你的项目.vercel.app`（不要 `https://`） | 根目录 `WW_verify_xxxx.txt` |
| 接收消息 → URL | `https://你的项目.vercel.app/api/wecom/callback` | GET 解密 `echostr` 并原样返回明文 |

### 1）可信域名（WW_verify 文件）

1. 企业微信后台 → 应用 → 网页授权及 JS-SDK → 申请校验域名
2. 下载 `WW_verify_xxxxxxxx.txt`，用记事本打开，里面通常就一行字符串
3. 在 Vercel 环境变量填：

```
WECOM_VERIFY_FILENAME=WW_verify_xxxxxxxx.txt
WECOM_VERIFY_CONTENT=文件里的那一行
```

4. Redeploy 一次
5. 浏览器打开 `https://你的项目.vercel.app/WW_verify_xxxxxxxx.txt`，能看到那一行再回企业微信点确定

### 2）接收消息 URL（echostr）

后台「接收消息」里：

- URL：`https://你的项目.vercel.app/api/wecom/callback`
- Token：自己编一串，和 `WECOM_TOKEN` **完全一致**
- EncodingAESKey：点随机生成，和 `WECOM_ENCODING_AES_KEY` **完全一致**（43 位）

点保存时，企业微信会 **GET** 这个 URL，带 `msg_signature/timestamp/nonce/echostr`。服务端必须在 1 秒内返回**解密后的明文**，不能加引号、不能换行。

**顺序一定是：Vercel 环境变量先填齐并部署成功 → 再点企业微信保存。** 反过来会验证失败。

## Vercel 怎么配

1. 把本目录推到 GitHub，Vercel Import
2. Root Directory 选 `mustdo-wecom`（如果整个自制项目是一个仓库，在 Vercel 里设 Root Directory）
3. Settings → Environment Variables，对照 `.env.example` 填（本地不要提交 `.env.local`）
4. Storage → 创建 KV（Upstash Redis），会自动带上 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
5. Deploy

Hobby 套餐的 Vercel Cron 只能每天一次，仓库里已写成 `0 8 * * *`（UTC 8:00）。  
要按你设的 15 分钟 / 每小时催，用 [cron-job.org](https://cron-job.org) 每 5 分钟 GET：

`https://你的项目.vercel.app/api/tick?secret=你的CRON_SECRET`

`CRON_SECRET` 建议填上，避免别人乱打 tick。

## 企业微信应用里还要填

- **AgentId / Secret / CorpId** → `WECOM_AGENT_ID` `WECOM_SECRET` `WECOM_CORP_ID`
- **应用主页** → `APP_BASE_URL` 相同地址
- 可见范围包含你自己
- 打开应用后走一次 OAuth，名单才会记到你的 userid 上

本地调试：复制 `.env.example` 为 `.env.local`，可只填 `WECOM_DEFAULT_USERID=你的账号`，然后：

```
npm install
npm run dev
```

打开 http://localhost:3000

## 间隔

写入名单时选：只一次 / 15 分钟 / 小时 / 每天 / 每周 / 自定义分钟。  
到点发企业微信 **textcard** 应用消息，点进去还是这张表。
