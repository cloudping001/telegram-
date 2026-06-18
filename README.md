# Telegram Support Admin

一套可完全托管在 Cloudflare 上的 Telegram 双向客服中转系统。系统面向 SaaS 场景设计，支持平台管理员和注册用户两类身份，注册用户可以配置自己的 Telegram Bot、客服接待号、消息模板、客户列表和群发消息；平台管理员可以统一管理用户、机器人配置、消息记录和审计日志。

前端使用 React + Vite + Ant Design，后台 API 使用 Cloudflare Workers + Hono，数据存储使用 Cloudflare D1，缓存使用 KV，媒体文件可使用 R2，协调会话使用 Durable Objects。整套系统不需要传统服务器。

## 功能概览

- 平台管理员登录、修改管理员账号和密码。
- 注册用户登录、注册、修改自己的账号信息。
- 用户管理：新增用户、编辑用户、重置密码、删除用户。
- 机器人配置：每个用户可配置自己的 Bot Token、Webhook、状态。
- 客服配置：机器人内绑定多个个人 Telegram 客服号，并按比例分流。
- 消息模板：机器人内绑定欢迎语、离线回复和群发模板。
- 客户列表：记录关注或使用过机器人的 Telegram 客户。
- 群发消息：给关注过机器人的客户发送自定义消息，并可保存为模板。
- 消息记录：查看客户消息、客服回复、转发状态和历史日志。
- 审计日志：记录后台关键操作。
- 移动端适配：侧边栏可折叠，移动端抽屉菜单。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 管理后台 | React, Vite, TypeScript, Ant Design |
| API 服务 | Cloudflare Workers, Hono, TypeScript |
| 数据库 | Cloudflare D1 |
| 缓存 | Cloudflare KV |
| 文件存储 | Cloudflare R2 |
| 会话协调 | Cloudflare Durable Objects |
| 部署 | Cloudflare Pages + Workers |

## 目录结构

```text
.
├── admin/                  # 管理后台前端
├── worker/                 # Cloudflare Worker API
│   ├── migrations/         # D1 数据库迁移
│   ├── src/                # Worker 源码
│   └── wrangler.example.jsonc
├── package.json
└── README.md
```

## 默认后台登录说明

当前项目初始化后的平台管理员账号说明如下：

```text
后台地址：部署后的 Cloudflare Pages 地址
管理员账号：admin
默认密码：147258369
登录身份：平台管理员
```

首次上线后请立即进入后台的“我的账户”或管理员账户设置页面修改账号和密码。

自部署时建议通过 Cloudflare Worker Secrets 设置初始管理员信息：

```bash
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

系统的登录逻辑如下：

- 如果数据库中已经存在平台管理员账号，登录会使用数据库中的账号和加密密码。
- 如果数据库中还没有平台管理员账号，系统会读取 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 作为初始登录信息。
- 如果没有设置 `ADMIN_USERNAME`，默认用户名为 `admin`。
- 如果没有设置 `ADMIN_PASSWORD`，新环境可能没有可用的默认登录密码，所以正式部署前必须设置。
- 管理员在后台修改密码后，数据库中的管理员账号会优先生效。

不要把真实管理员密码、Bot Token、Cloudflare Token 或任何密钥提交到 GitHub。

## 本地开发

安装依赖：

```bash
npm install
```

启动前端：

```bash
npm --workspace admin run dev
```

启动 Worker 本地开发：

```bash
cd worker
npx wrangler dev
```

前端需要知道 API 地址。开发环境可以在 `admin/.env.local` 中配置：

```env
VITE_API_BASE_URL=http://localhost:8787
```

## Cloudflare 部署

### 1. 准备 Cloudflare 资源

需要准备以下 Cloudflare 产品：

- Pages：托管管理后台前端。
- Workers：托管后端 API 和 Telegram Webhook。
- D1：保存用户、机器人、客服、模板、客户和消息记录。
- KV：缓存配置和临时状态。
- R2：保存 Telegram 图片、文件、语音等媒体文件。
- Durable Objects：用于会话协调和后续实时能力扩展。

### 2. 创建配置文件

复制示例配置：

```powershell
Copy-Item worker/wrangler.example.jsonc worker/wrangler.jsonc
```

或在 Bash 中执行：

```bash
cp worker/wrangler.example.jsonc worker/wrangler.jsonc
```

然后把 `worker/wrangler.jsonc` 中的 D1、KV、R2 等资源 ID 替换成你自己的 Cloudflare 资源。

创建资源示例：

```bash
npx wrangler kv namespace create CACHE
npx wrangler d1 create telegram-support
npx wrangler r2 bucket create telegram-support-media
```

### 3. 执行 D1 数据库迁移

```bash
cd worker
npx wrangler d1 migrations apply telegram-support --remote
```

### 4. 设置 Worker Secrets

至少设置平台管理员账号和密码：

```bash
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

可选设置 Telegram Webhook 校验密钥：

```bash
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Bot Token 不需要写入 Worker Secrets。用户在后台“机器人配置”中填写自己的 Bot Token 后保存即可。

### 5. 部署 Worker

```bash
cd worker
npx wrangler deploy --config wrangler.jsonc
```

部署完成后会得到类似下面的 Worker 地址：

```text
https://telegram-support-api.<your-subdomain>.workers.dev
```

### 6. 构建并部署前端

PowerShell：

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

部署完成后，使用 Cloudflare Pages 地址访问后台。

## Telegram Bot 配置流程

1. 在 Telegram 中通过 BotFather 创建机器人，获取 Bot Token。
2. 登录后台，进入“机器人配置”。
3. 新增机器人，填写机器人名称、用户名和 Bot Token。
4. 保存后系统会生成或显示 Webhook 路径。
5. 进入机器人详情，添加客服配置，填写个人 Telegram ID 和客服名称。
6. 配置消息模板，例如欢迎语、离线回复、群发模板。
7. 开启机器人状态。
8. 用户给机器人发送消息后，系统会转发到绑定的个人 Telegram 客服号。
9. 客服在 Telegram 中回复机器人转发来的消息，客户会通过 Bot 收到客服回复。

Webhook 完整地址格式通常为：

```text
https://telegram-support-api.<your-subdomain>.workers.dev/api/telegram/webhook/<机器人ID>
```

不同机器人应该使用不同的 Webhook 路径。不要让所有机器人共用同一个固定路径，否则系统无法准确判断消息属于哪个机器人和用户。

## 开源前注意事项

提交到 GitHub 前请确认不要提交以下内容：

- `worker/wrangler.jsonc`
- `.dev.vars`
- `.prod.vars`
- `.env`
- `.env.local`
- `.wrangler/`
- `admin/dist/`
- 真实 Bot Token
- 真实管理员密码
- Cloudflare API Token
- 任何包含用户隐私的日志、截图、数据库导出文件

仓库中只保留 `worker/wrangler.example.jsonc` 作为示例配置。

## 常用命令

检查代码：

```bash
npm --workspace admin run lint
npm --workspace worker run lint
```

构建前端：

```bash
npm --workspace admin run build
```

部署 Worker：

```bash
cd worker
npx wrangler deploy --config wrangler.jsonc
```

部署 Pages：

```bash
npx wrangler pages deploy admin/dist --project-name telegram-support-admin --branch production
```

查看 Git 状态：

```bash
git status --short
```

提交代码：

```bash
git add .
git commit -m "docs: update readme"
```

推送到 GitHub：

```bash
git push origin main
```

## 常见问题

### 为什么客户消息收不到？

优先检查以下几项：

- Bot Token 是否正确。
- 机器人状态是否开启。
- Webhook 是否指向当前 Worker 地址。
- Webhook 路径中的机器人 ID 是否正确。
- 客服配置中是否已经填写个人 Telegram ID。
- 当前用户是否先给 Bot 发过消息或点击过 `/start`。
- Worker 是否部署到了最新版本。
- D1 迁移是否已经执行。

### 为什么客服回复客户看不到？

客服需要在个人 Telegram 中回复机器人转发来的那条消息。系统会根据被回复消息中的会话关系找到原客户，再通过 Bot 发给客户。

### Bot Token 应该放在哪里？

Bot Token 由用户在后台“机器人配置”中填写保存。不要写进代码，也不要写进 GitHub。

### 非工作时间如何回复？

可以在系统配置中设置工作时间，在消息模板中启用离线回复。非工作时间客户首次点击 `/start` 时，系统会先发送欢迎语，再发送离线回复。

## 版权说明

本系统由 TG: `@yanhuacloud` 赞助开源。购买阿里云、腾讯云可前往 [聚合云平台](https://www.juhecloud.online/)。

## License

MIT
