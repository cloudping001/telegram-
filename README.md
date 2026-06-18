# Telegram Support Bridge

Cloudflare 全托管的 Telegram 双向客服中转系统。项目包含一个 React 管理后台和一个 Cloudflare Worker API，不需要自建服务器。

## 功能

- 多用户后台：平台管理员可管理注册用户，注册用户管理自己的机器人。
- 机器人配置：每个机器人独立保存 Bot Token、Webhook 路径、启用状态。
- 客服绑定：一个机器人可绑定多个个人 Telegram 客服号，并按权重分流新会话。
- 消息模板：支持欢迎语、离线回复、图片外链、文本、内联按钮。
- 双向消息：客户消息转发给个人客服号，客服回复 bot 消息后转发给客户。
- 消息记录：后台查看客户消息、客服回复、系统发送和失败记录。
- 客户列表：记录已与机器人互动过的客户，可用于自定义群发。
- Cloudflare 部署：Workers、Pages、D1、KV、R2、Durable Objects。

## 技术栈

- `admin/`: React, Vite, Ant Design, TypeScript
- `worker/`: Cloudflare Workers, Hono, D1, KV, R2, Durable Objects

## 目录

```text
admin/                  管理后台
worker/                 Cloudflare Worker API
worker/migrations/      D1 数据库迁移
worker/.dev.vars.example 本地环境变量示例
worker/wrangler.example.jsonc Cloudflare 绑定示例
```

## 本地开发

安装依赖：

```bash
npm install
```

复制本地环境变量示例：

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

按需修改 `worker/.dev.vars`。不要提交 `.dev.vars` 或 `.prod.vars`。

启动本地开发：

```bash
npm run dev
```

默认地址：

- Admin: `http://127.0.0.1:5173`
- Worker: `http://127.0.0.1:8787`

## Cloudflare 资源准备

登录 Cloudflare：

```bash
npx wrangler login
```

创建 KV：

```bash
npx wrangler kv namespace create CACHE
```

创建 D1：

```bash
npx wrangler d1 create telegram-support
```

创建 R2：

```bash
npx wrangler r2 bucket create telegram-support-media
```

复制 Wrangler 示例配置：

```bash
cp worker/wrangler.example.jsonc worker/wrangler.jsonc
```

把 Cloudflare 返回的 KV namespace ID、D1 database ID 填入 `worker/wrangler.jsonc`。

## Worker 密钥

生产环境使用 Wrangler Secret，不要把真实值写进仓库。

```bash
cd worker
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

说明：

- `TELEGRAM_WEBHOOK_SECRET`: Worker 和 Telegram webhook 之间的校验密钥。
- `ADMIN_USERNAME`: 平台管理员登录账号。
- `ADMIN_PASSWORD`: 平台管理员登录密码。

机器人 Bot Token 不需要写到 Worker Secret。用户在后台创建机器人时填写 Token，系统会保存到 D1，并自动调用 Telegram `setWebhook`。

## D1 迁移

```bash
cd worker
npx wrangler d1 migrations apply telegram-support --remote
```

本地 D1 可去掉 `--remote`。

## 部署 Worker

```bash
cd worker
npx wrangler deploy --config wrangler.jsonc
```

部署后得到 Worker 地址，例如：

```text
https://telegram-support-api.<your-subdomain>.workers.dev
```

## 部署 Admin 到 Cloudflare Pages

构建前设置 Worker API 地址：

```powershell
$env:VITE_API_BASE_URL="https://telegram-support-api.<your-subdomain>.workers.dev"
npm --workspace admin run build
npx wrangler pages deploy admin/dist --project-name telegram-support-admin --branch production
```

Bash：

```bash
VITE_API_BASE_URL="https://telegram-support-api.<your-subdomain>.workers.dev" npm --workspace admin run build
npx wrangler pages deploy admin/dist --project-name telegram-support-admin --branch production
```

## 使用流程

1. 用平台管理员账号登录后台。
2. 在「用户管理」新增注册用户。
3. 注册用户登录后进入「机器人配置」。
4. 新建机器人，填写机器人名称、用户名和 Bot Token。
5. Webhook 路径可留空，系统会自动生成 `/api/telegram/webhook/{id}`。
6. 在机器人工作台绑定个人 Telegram 客服 ID。
7. 客户向 bot 发送 `/start` 或普通消息后，系统会记录客户并转发消息给绑定客服。
8. 客服在 Telegram 中回复 bot 转发来的那条消息，系统会把回复转发给客户。

## Webhook 说明

Webhook 路径必须匹配：

```text
/api/telegram/webhook/{id}
```

示例：

```text
/api/telegram/webhook/cloudcup-main
/api/telegram/webhook/support-bot-001
```

系统在新建或更新机器人时会自动调用 Telegram `setWebhook`，完整 URL 会是：

```text
https://telegram-support-api.<your-subdomain>.workers.dev/api/telegram/webhook/{id}
```

## 安全注意

不要提交这些文件：

- `worker/.dev.vars`
- `worker/.prod.vars`
- `worker/wrangler.jsonc`
- `.wrangler/`
- `admin/dist/`
- 日志和截图输出

`worker/wrangler.jsonc` 会包含你的 Cloudflare 资源 ID，本仓库只提交 `worker/wrangler.example.jsonc`。

D1 中会保存用户填写的 Bot Token。请只给可信管理员 Cloudflare 和数据库访问权限。

## License

MIT
