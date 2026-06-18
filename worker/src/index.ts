import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  authenticatePlatformAdmin,
  authenticateTenantUser,
  changePlatformAdmin,
  changeOwnPassword,
  createAuditLog,
  createTenantUser,
  createBot,
  createMessageLog,
  createTemplate,
  createPlatformUser,
  DEFAULT_TENANT_ID,
  deleteBot,
  deletePlatformUser,
  deleteTemplate,
  deleteTenantUser,
  getBotForWebhook,
  getBotRuntimeById,
  getOverviewStats,
  getPlatformAdmin,
  getSettings,
  getSupportConfig,
  getTenant,
  listAuditLogs,
  listBotCustomers,
  listMessageLogs,
  listBotSupportAgents,
  listBots,
  listRoutingRules,
  listTenants,
  listTenantUsers,
  listTemplates,
  registerTenant,
  resetPlatformUserPassword,
  saveSettings,
  saveBotSupportAgents,
  saveSupportConfig,
  selectBotSupportAgent,
  updateBotCustomerStatus,
  upsertConversation,
  upsertBotCustomer,
  updateBot,
  updateTenant,
  updateTenantUser,
  updateTemplate
} from "./repository";
import type {
  AdminSessionRecord,
  BroadcastInput,
  BroadcastResult,
  BotInput,
  BotSupportAgentInput,
  BotRecord,
  ConversationRecord,
  Env,
  MessageLogInput,
  RegisterInput,
  SupportConfigRecord,
  TelegramUpdate,
  TenantInput,
  PlatformUserInput,
  TenantUserInput,
  TemplateRecord,
  TemplateInput
} from "./types";

class ConversationCoordinator extends DurableObject<Env> {
  async ensureConversation(input: { chatId: number; botId: string; targetGroup: string }) {
    const routeKey = `${input.botId}:${input.chatId}`;
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS conversations(route_key TEXT PRIMARY KEY, target_group TEXT NOT NULL)"
    );
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO conversations(route_key, target_group) VALUES (?, ?)",
      routeKey,
      input.targetGroup
    );
    const row = this.ctx.storage.sql
      .exec("SELECT target_group FROM conversations WHERE route_key = ?", routeKey)
      .one<{ target_group: string }>();

    return {
      routeKey,
      targetGroup: row?.target_group ?? input.targetGroup
    };
  }
}

const app = new Hono<{ Bindings: Env; Variables: { session: AdminSessionRecord } }>();
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24;
const ROUTE_TTL_SECONDS = 60 * 60 * 24 * 30;

app.use("/api/*", cors());

function extractToken(headerValue: string | undefined) {
  if (!headerValue) {
    return null;
  }

  const text = headerValue.trim();
  return text.startsWith("Bearer ") ? text.slice(7).trim() : text;
}

async function requireAdminSession(c: any) {
  const path = new URL(c.req.url).pathname;
  const isPublic =
    path === "/api/auth/login" ||
    path === "/api/auth/register" ||
    path.startsWith("/api/telegram/webhook/");
  if (isPublic) {
    return null;
  }

  const token = extractToken(c.req.header("Authorization")) ?? c.req.header("X-Admin-Token");
  if (!token) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  const session = await c.env.CACHE.get(`admin-session:${token}`);
  if (!session) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const parsed = JSON.parse(session) as AdminSessionRecord;
    if (!parsed.isPlatformAdmin) {
      const tenant = await getTenant(c.env, parsed.tenantId);
      if (!tenant || tenant.status !== "active") {
        return c.json({ ok: false, error: "account disabled" }, 403);
      }
    }
    c.set("session", parsed);
  } catch {
    await c.env.CACHE.delete(`admin-session:${token}`);
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }

  return null;
}

app.use("/api/*", async (c, next) => {
  const unauthorized = await requireAdminSession(c);
  if (unauthorized) {
    return unauthorized;
  }

  await next();
});

app.onError((error, c) => {
  return c.json({ ok: false, error: error.message }, error.message.includes("not found") ? 404 : 500);
});

function currentSession(c: any): AdminSessionRecord {
  return c.get("session") as AdminSessionRecord;
}

function selectedTenantHeader(c: any) {
  return c.req.header("X-Tenant-Id")?.trim() || "";
}

function currentTenant(c: any) {
  const session = currentSession(c);
  const requestedTenant = selectedTenantHeader(c);
  if (session.isPlatformAdmin && requestedTenant) {
    return requestedTenant;
  }
  return session.tenantId || DEFAULT_TENANT_ID;
}

function isPlatformWideView(c: any) {
  const session = currentSession(c);
  return Boolean(session.isPlatformAdmin && !selectedTenantHeader(c));
}

async function tenantForBotParam(c: any) {
  if (!isPlatformWideView(c)) {
    return currentTenant(c);
  }

  const bot = (await listBots(c.env, undefined, true)).find((item) => item.id === c.req.param("id"));
  return bot?.tenantId || currentTenant(c);
}

function canManageUsers(session: AdminSessionRecord) {
  return Boolean(session.isPlatformAdmin);
}

function requirePlatformAdmin(c: any) {
  const session = currentSession(c);
  if (!session.isPlatformAdmin) {
    return c.json({ ok: false, error: "forbidden" }, 403);
  }
  return null;
}

async function audit(c: any, action: string, resourceType: string, resourceId?: string, details?: unknown) {
  const session = currentSession(c);
  try {
    await createAuditLog(c.env, {
      tenantId: currentTenant(c),
      actorUserId: session.userId,
      actorUsername: session.username,
      actorRole: session.role,
      action,
      resourceType,
      resourceId,
      details: details ? JSON.stringify(details) : ""
    });
  } catch (error) {
    console.error("audit log failed", error);
  }
}

function assertBotInput(input: Partial<BotInput>) {
  if (!input.name?.trim()) {
    throw new Error("Bot name is required");
  }
  if (!input.username?.trim()) {
    throw new Error("Bot username is required");
  }
  const webhookPath = input.webhookPath?.trim();
  if (webhookPath && !/^\/api\/telegram\/webhook\/[a-zA-Z0-9_-]+$/.test(webhookPath)) {
    throw new Error("Webhook path must match /api/telegram/webhook/{id}");
  }
  if (input.status !== "online" && input.status !== "paused") {
    throw new Error("Invalid bot status");
  }
}

function assertSupportConfig(input: Partial<SupportConfigRecord>) {
  if (!input.name?.trim()) {
    throw new Error("Support name is required");
  }
  if (!input.chatId?.trim()) {
    throw new Error("Support chat id is required");
  }
  if (!/^-?\d+$/.test(input.chatId.trim())) {
    throw new Error("Support chat id must be numeric");
  }
  if (typeof input.online !== "boolean") {
    throw new Error("Support online status is required");
  }
}

function assertBotSupportAgents(input: unknown): BotSupportAgentInput[] {
  if (!Array.isArray(input)) {
    throw new Error("Support agents payload must be an array");
  }
  return input.map((item, index) => {
    const agent = item as Partial<BotSupportAgentInput>;
    if (!agent.name?.trim()) {
      throw new Error(`Support agent ${index + 1} name is required`);
    }
    if (!agent.chatId?.trim() || !/^-?\d+$/.test(agent.chatId.trim())) {
      throw new Error(`Support agent ${index + 1} Telegram ID must be a numeric chat_id`);
    }
    return {
      id: agent.id,
      name: agent.name.trim(),
      chatId: agent.chatId.trim(),
      online: agent.online ?? true,
      weight: Math.max(0, Math.round(Number(agent.weight ?? 100))),
      enabled: agent.enabled ?? true
    };
  });
}

function assertTemplateInput(input: Partial<TemplateInput>) {
  if (!input.name?.trim()) {
    throw new Error("Template name is required");
  }
  if (!input.scene?.trim()) {
    throw new Error("Template scene is required");
  }
  if (!input.content?.trim()) {
    throw new Error("Template content is required");
  }
  if (input.parseMode && input.parseMode !== "plain" && input.parseMode !== "HTML" && input.parseMode !== "MarkdownV2") {
    throw new Error("Invalid parse mode");
  }
  if (input.scene === "off-hours") {
    if (!input.timezone?.trim()) {
      throw new Error("Timezone is required for off-hours template");
    }
    if (parseTimeMinutes(input.workStart ?? "") === null || parseTimeMinutes(input.workEnd ?? "") === null) {
      throw new Error("Invalid off-hours work time");
    }
  }
  for (const button of input.buttons ?? []) {
    if (!button.text?.trim() || !button.url?.trim()) {
      throw new Error("Button text and url are required");
    }
    try {
      new URL(button.url);
    } catch {
      throw new Error("Invalid button url");
    }
  }
}

function assertBroadcastInput(input: Partial<BroadcastInput>): BroadcastInput {
  if (!input.content?.trim()) {
    throw new Error("Broadcast content is required");
  }
  if (input.parseMode && input.parseMode !== "plain" && input.parseMode !== "HTML" && input.parseMode !== "MarkdownV2") {
    throw new Error("Invalid parse mode");
  }
  for (const button of input.buttons ?? []) {
    if (!button.text?.trim() || !button.url?.trim()) {
      throw new Error("Broadcast buttons require text and url");
    }
    try {
      new URL(button.url);
    } catch {
      throw new Error("Invalid button url");
    }
  }

  return {
    content: input.content.trim(),
    imageUrl: input.imageUrl?.trim() ?? "",
    parseMode: input.parseMode ?? "plain",
    buttons: (input.buttons ?? []).map((button) => ({
      text: button.text.trim(),
      url: button.url.trim()
    }))
  };
}

function assertRegisterInput(input: Partial<RegisterInput>) {
  if (!input.tenantName?.trim()) {
    throw new Error("Account name is required");
  }
  if (!/^[a-zA-Z0-9_@.-]{3,64}$/.test(input.username?.trim() ?? "")) {
    throw new Error("Username must be 3-64 characters");
  }
  if ((input.password?.trim().length ?? 0) < 8) {
    throw new Error("Password must be at least 8 characters");
  }
}

function assertTenantUserInput(input: Partial<TenantUserInput>, requirePassword: boolean) {
  if (!/^[a-zA-Z0-9_@.-]{3,64}$/.test(input.username?.trim() ?? "")) {
    throw new Error("Username must be 3-64 characters");
  }
  if (requirePassword && (input.password?.trim().length ?? 0) < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (input.password?.trim() && input.password.trim().length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (input.role !== "owner" && input.role !== "admin" && input.role !== "member") {
    throw new Error("Invalid user role");
  }
  if (input.status !== "active" && input.status !== "disabled") {
    throw new Error("Invalid user status");
  }
}

function assertPasswordChange(input: { currentPassword?: string; newPassword?: string }) {
  if (!input.currentPassword?.trim()) {
    throw new Error("Current password is required");
  }
  if ((input.newPassword?.trim().length ?? 0) < 8) {
    throw new Error("New password must be at least 8 characters");
  }
}

function assertTenantInput(input: Partial<TenantInput>) {
  if (!input.name?.trim()) {
    throw new Error("Account name is required");
  }
  if (input.status !== "active" && input.status !== "disabled") {
    throw new Error("Invalid tenant status");
  }
  if (input.plan !== "free" && input.plan !== "pro" && input.plan !== "enterprise") {
    throw new Error("Invalid tenant plan");
  }
}

type TelegramMessage = NonNullable<TelegramUpdate["message"]>;
type ReplyMap = {
  customerChatId: number;
  routeKey: string;
  conversationId?: string;
};

function parseChatTarget(value: string) {
  const text = value.trim();
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

function isSameChat(chatId: number, target: number | string) {
  return typeof target === "number" && chatId === target;
}

function tenantForBot(bot: BotRecord) {
  return bot.tenantId ?? DEFAULT_TENANT_ID;
}

function cleanTelegramDebugText(value?: string) {
  if (!value) {
    return value;
  }

  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const firstDebugLine = lines.findIndex((line) => line.trim() === "Telegram message");
  const searchLines = firstDebugLine >= 0 ? lines.slice(firstDebugLine) : lines;
  const isTelegramDebug =
    firstDebugLine >= 0 &&
    searchLines.some((line) => line.trim().startsWith("Update ID:")) &&
    searchLines.some((line) => line.trim().startsWith("Message ID:")) &&
    searchLines.some((line) => line.trim().startsWith("Chat:")) &&
    searchLines.some((line) => line.trim().startsWith("From:"));

  if (!isTelegramDebug) {
    return value;
  }

  const fromIndex = lines.findIndex((line, index) => index >= firstDebugLine && line.trim().startsWith("From:"));
  const blankAfterHeader = lines.findIndex((line, index) => index > fromIndex && line.trim() === "");
  const bodyStart = blankAfterHeader >= 0 ? blankAfterHeader + 1 : fromIndex + 1;
  return lines.slice(bodyStart).join("\n").trim();
}

function customerName(message: TelegramMessage) {
  return (
    [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim() ||
    message.chat.title ||
    message.chat.username ||
    message.from?.username ||
    ""
  );
}

function messageType(message: TelegramMessage): MessageLogInput["messageType"] {
  if (message.photo?.length) {
    return "photo";
  }
  if (message.document) {
    return "document";
  }
  if (message.voice) {
    return "voice";
  }
  if (message.text || message.caption) {
    return "text";
  }
  return "unsupported";
}

function messageContent(message: TelegramMessage) {
  const text = cleanTelegramDebugText(message.text);
  const caption = cleanTelegramDebugText(message.caption);
  if (text || caption) {
    return text || caption || "";
  }
  if (message.document?.file_name) {
    return message.document.file_name;
  }
  if (message.photo?.length) {
    return "[图片]";
  }
  if (message.voice) {
    return "[语音]";
  }
  return "[不支持的消息类型]";
}

function messageMediaFileId(message: TelegramMessage) {
  if (message.photo?.length) {
    return message.photo[message.photo.length - 1].file_id;
  }
  if (message.document) {
    return message.document.file_id;
  }
  if (message.voice) {
    return message.voice.file_id;
  }
  return "";
}

async function upsertCustomerConversation(
  env: Env,
  bot: BotRecord,
  message: TelegramMessage
) {
  return upsertConversation(env, {
    tenantId: tenantForBot(bot),
    botId: bot.id,
    customerChatId: String(message.chat.id),
    customerUsername: message.from?.username ?? message.chat.username ?? "",
    customerName: customerName(message)
  });
}

async function rememberBotCustomer(env: Env, bot: BotRecord, message: TelegramMessage, source: string) {
  return upsertBotCustomer(env, tenantForBot(bot), {
    botId: bot.id,
    chatId: String(message.chat.id),
    username: message.from?.username ?? message.chat.username ?? "",
    displayName: customerName(message),
    firstName: message.from?.first_name ?? "",
    lastName: message.from?.last_name ?? "",
    languageCode: message.from?.language_code ?? "",
    source,
    lastMessage: messageContent(message)
  });
}

async function safeCreateMessageLog(env: Env, input: MessageLogInput) {
  try {
    return await createMessageLog(env, input);
  } catch (error) {
    console.error("create message log failed", error);
    return null;
  }
}

async function logTelegramMessage(
  env: Env,
  bot: BotRecord,
  message: TelegramMessage,
  direction: MessageLogInput["direction"],
  conversation: ConversationRecord,
  extra: Partial<MessageLogInput> = {}
) {
  return safeCreateMessageLog(env, {
    tenantId: tenantForBot(bot),
    conversationId: conversation.id,
    botId: bot.id,
    direction,
    messageType: extra.messageType ?? messageType(message),
    scene: extra.scene,
    customerChatId: extra.customerChatId ?? String(message.chat.id),
    supportChatId: extra.supportChatId,
    telegramMessageId: extra.telegramMessageId ?? String(message.message_id),
    relatedMessageId: extra.relatedMessageId,
    content: extra.content ?? messageContent(message),
    mediaFileId: extra.mediaFileId ?? messageMediaFileId(message),
    mediaCaption: extra.mediaCaption ?? cleanTelegramDebugText(message.caption) ?? "",
    status: extra.status ?? "sent",
    error: extra.error
  });
}

function parseTimeMinutes(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function currentMinutesInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isWithinTemplateWorkingHours(template: TemplateRecord) {
  const start = parseTimeMinutes(template.workStart ?? "");
  const end = parseTimeMinutes(template.workEnd ?? "");
  if (start === null || end === null || start === end) {
    return true;
  }

  const now = currentMinutesInTimezone(template.timezone || "Asia/Singapore");
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function isStartCommand(message: TelegramMessage) {
  return /^\/start(?:\s|$)/.test(message.text?.trim() ?? "");
}

function defaultTemplate(templates: TemplateRecord[], scene: string) {
  return (
    templates.find((item) => item.enabled && item.scene === scene && item.isDefault) ??
    templates.find((item) => item.enabled && item.scene === scene)
  );
}

function inlineKeyboard(template: TemplateRecord) {
  const rows = [];
  for (let index = 0; index < template.buttons.length; index += 2) {
    rows.push(template.buttons.slice(index, index + 2).map((button) => ({ text: button.text, url: button.url })));
  }

  return rows.length ? { inline_keyboard: rows } : undefined;
}

async function sendTemplate(token: string, chatId: number | string, template: TemplateRecord) {
  const replyMarkup = inlineKeyboard(template);
  const parseMode = template.parseMode !== "plain" ? template.parseMode : undefined;

  if (template.imageUrl?.trim()) {
    return telegramRequest<{ message_id: number }>(token, "sendPhoto", {
      chat_id: chatId,
      photo: template.imageUrl.trim(),
      caption: template.content,
      parse_mode: parseMode,
      reply_markup: replyMarkup
    });
  }

  return telegramRequest<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text: template.content || " ",
    parse_mode: parseMode,
    reply_markup: replyMarkup
  });
}

function broadcastTemplate(input: BroadcastInput): TemplateRecord {
  return {
    id: "broadcast-preview",
    name: "自定义群发",
    scene: "broadcast",
    content: input.content,
    imageUrl: input.imageUrl ?? "",
    parseMode: input.parseMode ?? "plain",
    isDefault: false,
    buttons: input.buttons ?? [],
    enabled: true,
    updatedAt: new Date().toISOString()
  };
}

function isBlockedTelegramError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("bot was blocked") ||
    message.includes("user is deactivated") ||
    message.includes("chat not found") ||
    message.includes("forbidden")
  );
}

async function broadcastToBotCustomers(
  env: Env,
  token: string,
  bot: BotRecord,
  input: BroadcastInput
): Promise<BroadcastResult> {
  const customers = await listBotCustomers(env, tenantForBot(bot), bot.id, 500, "", "active");
  const template = broadcastTemplate(input);
  const result: BroadcastResult = {
    total: customers.length,
    sent: 0,
    failed: 0,
    blocked: 0
  };

  for (const customer of customers) {
    try {
      const sent = await sendTemplate(token, parseChatTarget(customer.chatId), template);
      result.sent += 1;
      await safeCreateMessageLog(env, {
        tenantId: tenantForBot(bot),
        botId: bot.id,
        direction: "system",
        messageType: "template",
        scene: "broadcast",
        customerChatId: customer.chatId,
        telegramMessageId: String(sent.message_id),
        content: input.content,
        mediaFileId: input.imageUrl ?? "",
        status: "sent"
      });
    } catch (error) {
      result.failed += 1;
      if (isBlockedTelegramError(error)) {
        result.blocked += 1;
        await updateBotCustomerStatus(env, tenantForBot(bot), bot.id, customer.chatId, "blocked");
      }
      await safeCreateMessageLog(env, {
        tenantId: tenantForBot(bot),
        botId: bot.id,
        direction: "system",
        messageType: "template",
        scene: "broadcast",
        customerChatId: customer.chatId,
        content: input.content,
        mediaFileId: input.imageUrl ?? "",
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
}

async function maybeSendOfflineReply(
  env: Env,
  token: string,
  bot: BotRecord,
  message: TelegramMessage,
  templates?: TemplateRecord[]
) {
  const templateList = templates ?? (await listTemplates(env, tenantForBot(bot), bot.id));
  const template = defaultTemplate(templateList, "off-hours");
  if (!template?.content.trim()) {
    return;
  }

  const supportConfig = await getSupportConfig(env, tenantForBot(bot));
  const isAvailable = supportConfig.online && isWithinTemplateWorkingHours(template);
  if (isAvailable) {
    return;
  }

  const dedupeKey = `offline-reply:${bot.id}:${message.chat.id}`;
  const alreadySent = await env.CACHE.get(dedupeKey);
  if (alreadySent) {
    return;
  }

  const conversation = await upsertCustomerConversation(env, bot, message);
  try {
    const sent = await sendTemplate(token, message.chat.id, template);
    await safeCreateMessageLog(env, {
      tenantId: tenantForBot(bot),
      conversationId: conversation.id,
      botId: bot.id,
      direction: "system",
      messageType: "template",
      scene: "off-hours",
      customerChatId: String(message.chat.id),
      telegramMessageId: String(sent.message_id),
      content: template.content,
      mediaFileId: template.imageUrl ?? "",
      status: "sent"
    });
  } catch (error) {
    await safeCreateMessageLog(env, {
      tenantId: tenantForBot(bot),
      conversationId: conversation.id,
      botId: bot.id,
      direction: "system",
      messageType: "template",
      scene: "off-hours",
      customerChatId: String(message.chat.id),
      content: template.content,
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
  await env.CACHE.put(dedupeKey, "1", { expirationTtl: 60 * 60 });
}

async function handleStartCommand(env: Env, token: string, bot: BotRecord, message: TelegramMessage) {
  await rememberBotCustomer(env, bot, message, "start");
  const templates = await listTemplates(env, tenantForBot(bot), bot.id);
  const welcomeTemplate = defaultTemplate(templates, "first-contact");
  const conversation = await upsertCustomerConversation(env, bot, message);

  await logTelegramMessage(env, bot, message, "inbound", conversation, {
    scene: "start-command"
  });

  if (welcomeTemplate) {
    try {
      const sent = await sendTemplate(token, message.chat.id, welcomeTemplate);
      await safeCreateMessageLog(env, {
        tenantId: tenantForBot(bot),
        conversationId: conversation.id,
        botId: bot.id,
        direction: "system",
        messageType: "template",
        scene: "first-contact",
        customerChatId: String(message.chat.id),
        telegramMessageId: String(sent.message_id),
        content: welcomeTemplate.content,
        mediaFileId: welcomeTemplate.imageUrl ?? "",
        status: "sent"
      });
    } catch (error) {
      await safeCreateMessageLog(env, {
        tenantId: tenantForBot(bot),
        conversationId: conversation.id,
        botId: bot.id,
        direction: "system",
        messageType: "template",
        scene: "first-contact",
        customerChatId: String(message.chat.id),
        content: welcomeTemplate.content,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  await maybeSendOfflineReply(env, token, bot, message, templates);
}

async function telegramRequest<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };

  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.description ?? `Telegram ${method} failed`);
  }

  return payload.result;
}

function webhookUrl(origin: string, bot: BotRecord) {
  return new URL(bot.webhookPath, origin).toString();
}

async function syncTelegramWebhook(
  env: Env,
  origin: string,
  bot: BotRecord,
  providedToken?: string
) {
  const runtime = providedToken?.trim()
    ? null
    : await getBotRuntimeById(env, tenantForBot(bot), bot.id);
  const token = providedToken?.trim() || runtime?.tokenSecret;

  if (!token) {
    throw new Error("Bot token is not configured");
  }
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("Telegram webhook secret is not configured");
  }

  await telegramRequest<boolean>(token, "setWebhook", {
    url: webhookUrl(origin, bot),
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    drop_pending_updates: false,
    allowed_updates: ["message"]
  });
}

async function sendTelegramMessage(
  token: string,
  chatId: number | string,
  message: TelegramMessage
) {
  const cleanText = cleanTelegramDebugText(message.text);
  const cleanCaption = cleanTelegramDebugText(message.caption);

  if (message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    return telegramRequest<{ message_id: number }>(token, "sendPhoto", {
      chat_id: chatId,
      photo: photo.file_id,
      caption: cleanCaption
    });
  }

  if (message.document) {
    return telegramRequest<{ message_id: number }>(token, "sendDocument", {
      chat_id: chatId,
      document: message.document.file_id,
      caption: cleanCaption
    });
  }

  if (message.voice) {
    return telegramRequest<{ message_id: number }>(token, "sendVoice", {
      chat_id: chatId,
      voice: message.voice.file_id,
      caption: cleanCaption
    });
  }

  return telegramRequest<{ message_id: number }>(token, "sendMessage", {
    chat_id: chatId,
    text: cleanText || cleanCaption || "Received an unsupported message type"
  });
}

async function relayCustomerToSupport(env: Env, token: string, bot: BotRecord, message: TelegramMessage) {
  await rememberBotCustomer(env, bot, message, "message");
  const supportAgent = await selectBotSupportAgent(env, bot);
  if (!supportAgent?.chatId) {
    throw new Error("No active support agent is configured for this bot");
  }
  const coordinatorId = env.CONVERSATION_COORDINATOR.idFromName(bot.id);
  const coordinator = env.CONVERSATION_COORDINATOR.get(coordinatorId);
  const conversation = await coordinator.ensureConversation({
    botId: bot.id,
    chatId: message.chat.id,
    targetGroup: supportAgent.chatId
  });
  const record = await upsertCustomerConversation(env, bot, message);
  await logTelegramMessage(env, bot, message, "inbound", record, {
    customerChatId: String(message.chat.id)
  });
  const supportChat = parseChatTarget(conversation.targetGroup);
  let forwarded: { message_id: number };
  try {
    forwarded = await sendTelegramMessage(token, supportChat, message);
  } catch (error) {
    await logTelegramMessage(env, bot, message, "system", record, {
      scene: "forward-to-support",
      customerChatId: String(message.chat.id),
      supportChatId: String(supportChat),
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
  await logTelegramMessage(env, bot, message, "system", record, {
    scene: "forward-to-support",
    customerChatId: String(message.chat.id),
    supportChatId: String(supportChat),
    telegramMessageId: String(forwarded.message_id)
  });
  await maybeSendOfflineReply(env, token, bot, message);
  const replyMap: ReplyMap = {
    customerChatId: message.chat.id,
    routeKey: conversation.routeKey,
    conversationId: record.id
  };

  await env.CACHE.put(`reply-map:${bot.id}:${supportChat}:${forwarded.message_id}`, JSON.stringify(replyMap), {
    expirationTtl: ROUTE_TTL_SECONDS
  });
  await env.CACHE.put(
    `last-update:${bot.id}`,
    JSON.stringify({
      updateId: message.message_id,
      routeKey: conversation.routeKey,
      messageText: cleanTelegramDebugText(message.text) ?? cleanTelegramDebugText(message.caption) ?? ""
    }),
    { expirationTtl: 300 }
  );

  return {
    routeKey: conversation.routeKey,
    targetGroup: conversation.targetGroup,
    forwardedMessageId: forwarded.message_id
  };
}

async function relaySupportReplyToCustomer(
  env: Env,
  token: string,
  bot: BotRecord,
  supportChat: number | string,
  message: TelegramMessage
) {
  const replyToMessageId = message.reply_to_message?.message_id;
  if (!replyToMessageId) {
    return { ignored: true, reason: "support message is not a reply" };
  }

  const rawMap = await env.CACHE.get(`reply-map:${bot.id}:${supportChat}:${replyToMessageId}`);
  if (!rawMap) {
    await safeCreateMessageLog(env, {
      tenantId: tenantForBot(bot),
      botId: bot.id,
      direction: "outbound",
      messageType: messageType(message),
      scene: "support-reply",
      supportChatId: String(supportChat),
      telegramMessageId: String(message.message_id),
      relatedMessageId: String(replyToMessageId),
      content: messageContent(message),
      mediaFileId: messageMediaFileId(message),
      mediaCaption: cleanTelegramDebugText(message.caption) ?? "",
      status: "ignored",
      error: "reply target is unknown"
    });
    return { ignored: true, reason: "reply target is unknown" };
  }

  const replyMap = JSON.parse(rawMap) as ReplyMap;
  const record = await upsertConversation(env, {
    tenantId: tenantForBot(bot),
    botId: bot.id,
    customerChatId: String(replyMap.customerChatId)
  });
  let sent: { message_id: number };
  try {
    sent = await sendTelegramMessage(token, replyMap.customerChatId, message);
  } catch (error) {
    await logTelegramMessage(env, bot, message, "outbound", record, {
      scene: "support-reply",
      customerChatId: String(replyMap.customerChatId),
      supportChatId: String(supportChat),
      relatedMessageId: String(replyToMessageId),
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
  await logTelegramMessage(env, bot, message, "outbound", record, {
    scene: "support-reply",
    customerChatId: String(replyMap.customerChatId),
    supportChatId: String(supportChat),
    telegramMessageId: String(sent.message_id),
    relatedMessageId: String(replyToMessageId)
  });
  return {
    routeKey: replyMap.routeKey,
    customerChatId: replyMap.customerChatId,
    sentMessageId: sent.message_id
  };
}

app.post("/api/auth/login", async (c) => {
  const body = (await c.req.json()) as { username?: string; password?: string };
  const username = body.username?.trim();
  const password = body.password?.trim();

  if (!username || !password) {
    return c.json({ ok: false, error: "invalid credentials" }, 401);
  }

  const platformAdmin = await authenticatePlatformAdmin(c.env, username, password);
  let session: AdminSessionRecord | null = null;

  if (platformAdmin) {
    session = {
      tenantId: DEFAULT_TENANT_ID,
      userId: platformAdmin.id,
      username: platformAdmin.username,
      role: "platform_admin",
      isPlatformAdmin: true,
      createdAt: new Date().toISOString()
    };
  } else {
    const user = await authenticateTenantUser(c.env, username, password);
    if (user) {
      session = {
        tenantId: user.tenantId,
        userId: user.id,
        username: user.username,
        role: "registered_user",
        createdAt: new Date().toISOString()
      };
    }
  }

  if (!session) {
    return c.json({ ok: false, error: "invalid credentials" }, 401);
  }

  const token = crypto.randomUUID();
  await c.env.CACHE.put(`admin-session:${token}`, JSON.stringify(session), {
    expirationTtl: ADMIN_SESSION_TTL_SECONDS
  });
  return c.json({ ok: true, token, session });
});

app.get("/api/auth/platform-admin", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  return c.json(await getPlatformAdmin(c.env));
});

app.post("/api/auth/register", async (c) => {
  const payload = (await c.req.json()) as RegisterInput;
  assertRegisterInput(payload);
  const result = await registerTenant(c.env, payload);
  const session: AdminSessionRecord = {
    tenantId: result.tenant.id,
    userId: result.user.id,
    username: result.user.username,
    role: "registered_user",
    createdAt: new Date().toISOString()
  };
  const token = crypto.randomUUID();
  await c.env.CACHE.put(`admin-session:${token}`, JSON.stringify(session), {
    expirationTtl: ADMIN_SESSION_TTL_SECONDS
  });
  return c.json({ ok: true, token, session, tenant: result.tenant, user: result.user }, 201);
});

app.post("/api/auth/logout", async (c) => {
  const token = extractToken(c.req.header("Authorization"));
  if (token) {
    await c.env.CACHE.delete(`admin-session:${token}`);
  }
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => c.json(currentSession(c)));

app.put("/api/auth/password", async (c) => {
  const session = currentSession(c);
  const payload = (await c.req.json()) as { username?: string; currentPassword?: string; newPassword?: string };
  assertPasswordChange(payload);

  if (session.isPlatformAdmin) {
    const platformAdmin = await changePlatformAdmin(c.env, {
      username: payload.username,
      currentPassword: payload.currentPassword!,
      newPassword: payload.newPassword
    });
    const nextSession: AdminSessionRecord = {
      ...session,
      userId: platformAdmin.id,
      username: platformAdmin.username,
      role: "platform_admin",
      isPlatformAdmin: true
    };
    const token = extractToken(c.req.header("Authorization"));
    if (token) {
      await c.env.CACHE.put(`admin-session:${token}`, JSON.stringify(nextSession), {
        expirationTtl: ADMIN_SESSION_TTL_SECONDS
      });
    }
    await audit(c, "platform_admin.update", "platform_admin", platformAdmin.id, { username: platformAdmin.username });
    return c.json({ ok: true, session: nextSession });
  }

  const result = await changeOwnPassword(c.env, session.tenantId, session.userId, payload.currentPassword!, payload.newPassword!);
  await audit(c, "auth.password.update", "tenant_user", session.userId);
  return c.json({ ok: true, user: result });
});

app.get("/api/users", async (c) => {
  const session = currentSession(c);
  if (!canManageUsers(session)) {
    return c.json({ ok: false, error: "forbidden" }, 403);
  }
  return c.json(await listTenantUsers(c.env, currentTenant(c)));
});

app.post("/api/users", async (c) => {
  const session = currentSession(c);
  if (!canManageUsers(session)) {
    return c.json({ ok: false, error: "forbidden" }, 403);
  }
  const payload = (await c.req.json()) as TenantUserInput;
  assertTenantUserInput(payload, true);
  const user = await createTenantUser(c.env, currentTenant(c), payload);
  await audit(c, "tenant_user.create", "tenant_user", user.id, { username: user.username, role: user.role });
  return c.json(user, 201);
});

app.put("/api/users/:id", async (c) => {
  const session = currentSession(c);
  if (!canManageUsers(session)) {
    return c.json({ ok: false, error: "forbidden" }, 403);
  }
  const payload = (await c.req.json()) as TenantUserInput;
  assertTenantUserInput(payload, false);
  const user = await updateTenantUser(c.env, currentTenant(c), c.req.param("id"), payload);
  await audit(c, "tenant_user.update", "tenant_user", user.id, { username: user.username, role: user.role, status: user.status });
  return c.json(user);
});

app.delete("/api/users/:id", async (c) => {
  const session = currentSession(c);
  if (!canManageUsers(session)) {
    return c.json({ ok: false, error: "forbidden" }, 403);
  }
  const result = await deleteTenantUser(c.env, currentTenant(c), c.req.param("id"));
  await audit(c, "tenant_user.delete", "tenant_user", result.id);
  return c.json(result);
});

app.get("/api/audit-logs", async (c) => {
  const limit = Number(c.req.query("limit") ?? 100);
  return c.json(await listAuditLogs(c.env, limit, currentTenant(c), isPlatformWideView(c)));
});

app.get("/api/platform/tenants", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  return c.json(await listTenants(c.env));
});

app.post("/api/platform/tenants", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  const payload = (await c.req.json()) as PlatformUserInput;
  assertRegisterInput(payload);
  const user = await createPlatformUser(c.env, payload);
  const session = currentSession(c);
  await createAuditLog(c.env, {
    tenantId: user.id,
    actorUserId: session.userId,
    actorUsername: session.username,
    actorRole: session.role,
    action: "platform_user.create",
    resourceType: "platform_user",
    resourceId: user.id,
    details: JSON.stringify({ username: user.primaryUsername, name: user.name })
  });
  return c.json(user, 201);
});

app.put("/api/platform/tenants/:id", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  const payload = (await c.req.json()) as TenantInput;
  assertTenantInput(payload);
  const tenant = await updateTenant(c.env, c.req.param("id"), payload);
  const session = currentSession(c);
  await createAuditLog(c.env, {
    tenantId: tenant.id,
    actorUserId: session.userId,
    actorUsername: session.username,
    actorRole: session.role,
    action: "tenant.update",
    resourceType: "tenant",
    resourceId: tenant.id,
    details: JSON.stringify({ name: tenant.name, status: tenant.status, plan: tenant.plan })
  });
  return c.json(tenant);
});

app.put("/api/platform/tenants/:id/password", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  const payload = (await c.req.json()) as { password?: string };
  if (!payload.password || payload.password.length < 8) {
    return c.json({ ok: false, error: "invalid password payload" }, 400);
  }
  const result = await resetPlatformUserPassword(c.env, c.req.param("id"), payload.password);
  const session = currentSession(c);
  await createAuditLog(c.env, {
    tenantId: c.req.param("id"),
    actorUserId: session.userId,
    actorUsername: session.username,
    actorRole: session.role,
    action: "platform_user.password.reset",
    resourceType: "platform_user",
    resourceId: c.req.param("id")
  });
  return c.json(result);
});

app.delete("/api/platform/tenants/:id", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  const id = c.req.param("id");
  const result = await deletePlatformUser(c.env, id);
  const session = currentSession(c);
  await createAuditLog(c.env, {
    tenantId: DEFAULT_TENANT_ID,
    actorUserId: session.userId,
    actorUsername: session.username,
    actorRole: session.role,
    action: "platform_user.delete",
    resourceType: "platform_user",
    resourceId: id
  });
  return c.json(result);
});

app.get("/api/platform/tenants/:id/users", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  return c.json(await listTenantUsers(c.env, c.req.param("id")));
});

app.get("/api/overview", async (c) => {
  return c.json(await getOverviewStats(c.env, currentTenant(c), isPlatformWideView(c)));
});

app.get("/api/message-logs", async (c) => {
  const limit = Number(c.req.query("limit") ?? 100);
  return c.json(await listMessageLogs(c.env, limit, currentTenant(c), isPlatformWideView(c)));
});

app.get("/api/bots", async (c) => c.json(await listBots(c.env, currentTenant(c), isPlatformWideView(c))));

app.post("/api/bots", async (c) => {
  const payload = (await c.req.json()) as BotInput;
  assertBotInput(payload);
  const bot = await createBot(c.env, payload, currentTenant(c));
  await syncTelegramWebhook(c.env, new URL(c.req.url).origin, bot, payload.token);
  await audit(c, "bot.create", "bot", bot.id, { name: bot.name, username: bot.username });
  return c.json(bot, 201);
});

app.put("/api/bots/:id", async (c) => {
  const payload = (await c.req.json()) as BotInput;
  assertBotInput(payload);
  const bot = await updateBot(c.env, c.req.param("id"), payload, await tenantForBotParam(c));
  await syncTelegramWebhook(c.env, new URL(c.req.url).origin, bot, payload.token);
  await audit(c, "bot.update", "bot", bot.id, { name: bot.name, status: bot.status });
  return c.json(bot);
});

app.delete("/api/bots/:id", async (c) => {
  const result = await deleteBot(c.env, c.req.param("id"), await tenantForBotParam(c));
  await audit(c, "bot.delete", "bot", result.id);
  return c.json(result);
});

app.get("/api/bots/:id/support-agents", async (c) => {
  return c.json(await listBotSupportAgents(c.env, await tenantForBotParam(c), c.req.param("id")));
});

app.put("/api/bots/:id/support-agents", async (c) => {
  const payload = assertBotSupportAgents(await c.req.json());
  const agents = await saveBotSupportAgents(c.env, await tenantForBotParam(c), c.req.param("id"), payload);
  await audit(c, "bot.support_agents.update", "bot", c.req.param("id"), {
    supportCount: agents.length,
    activeCount: agents.filter((item) => item.enabled && item.online).length
  });
  return c.json(agents);
});

app.get("/api/bots/:id/templates", async (c) => {
  return c.json(await listTemplates(c.env, await tenantForBotParam(c), c.req.param("id")));
});

app.post("/api/bots/:id/templates", async (c) => {
  const payload = (await c.req.json()) as TemplateInput;
  assertTemplateInput(payload);
  const template = await createTemplate(c.env, payload, await tenantForBotParam(c), c.req.param("id"));
  await audit(c, "bot.template.create", "template", template.id, {
    botId: c.req.param("id"),
    name: template.name,
    scene: template.scene
  });
  return c.json(template, 201);
});

app.put("/api/bots/:id/templates/:templateId", async (c) => {
  const payload = (await c.req.json()) as TemplateInput;
  assertTemplateInput(payload);
  const template = await updateTemplate(c.env, c.req.param("templateId"), payload, await tenantForBotParam(c), c.req.param("id"));
  await audit(c, "bot.template.update", "template", template.id, {
    botId: c.req.param("id"),
    name: template.name,
    scene: template.scene,
    enabled: template.enabled
  });
  return c.json(template);
});

app.delete("/api/bots/:id/templates/:templateId", async (c) => {
  const result = await deleteTemplate(c.env, c.req.param("templateId"), await tenantForBotParam(c), c.req.param("id"));
  await audit(c, "bot.template.delete", "template", result.id, { botId: c.req.param("id") });
  return c.json(result);
});

app.get("/api/bots/:id/customers", async (c) => {
  const limit = Number(c.req.query("limit") ?? 200);
  const q = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "active";
  return c.json(await listBotCustomers(c.env, await tenantForBotParam(c), c.req.param("id"), limit, q, status));
});

app.post("/api/bots/:id/broadcast", async (c) => {
  const payload = assertBroadcastInput((await c.req.json()) as Partial<BroadcastInput>);
  const bot = await getBotRuntimeById(c.env, await tenantForBotParam(c), c.req.param("id"));
  if (!bot) {
    return c.json({ ok: false, error: "bot not found" }, 404);
  }
  if (!bot.tokenSecret) {
    return c.json({ ok: false, error: "bot token is not configured" }, 422);
  }
  const result = await broadcastToBotCustomers(c.env, bot.tokenSecret, bot, payload);
  await audit(c, "bot.broadcast.send", "bot", bot.id, result);
  return c.json(result);
});

app.get("/api/routing-rules", async (c) => c.json(await listRoutingRules()));

app.get("/api/support-config", async (c) => c.json(await getSupportConfig(c.env, currentTenant(c))));

app.put("/api/support-config", async (c) => {
  const payload = (await c.req.json()) as SupportConfigRecord;
  assertSupportConfig(payload);
  const config = await saveSupportConfig(c.env, payload, currentTenant(c));
  await audit(c, "support_config.update", "support_config", currentTenant(c), {
    name: config.name,
    chatId: config.chatId,
    online: config.online
  });
  return c.json(config);
});

app.get("/api/templates", async (c) => c.json(await listTemplates(c.env, currentTenant(c))));

app.post("/api/templates", async (c) => {
  const payload = (await c.req.json()) as TemplateInput;
  assertTemplateInput(payload);
  const template = await createTemplate(c.env, payload, currentTenant(c));
  await audit(c, "template.create", "template", template.id, { name: template.name, scene: template.scene });
  return c.json(template, 201);
});

app.put("/api/templates/:id", async (c) => {
  const payload = (await c.req.json()) as TemplateInput;
  assertTemplateInput(payload);
  const template = await updateTemplate(c.env, c.req.param("id"), payload, currentTenant(c));
  await audit(c, "template.update", "template", template.id, { name: template.name, scene: template.scene, enabled: template.enabled });
  return c.json(template);
});

app.delete("/api/templates/:id", async (c) => {
  const result = await deleteTemplate(c.env, c.req.param("id"), currentTenant(c));
  await audit(c, "template.delete", "template", result.id);
  return c.json(result);
});

app.get("/api/settings/system", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  return c.json(await getSettings(c.env, currentTenant(c)));
});

app.put("/api/settings/system", async (c) => {
  const forbidden = requirePlatformAdmin(c);
  if (forbidden) {
    return forbidden;
  }
  const payload = await c.req.json();
  const settings = await saveSettings(c.env, payload, currentTenant(c));
  await audit(c, "system_settings.update", "system_settings", currentTenant(c));
  return c.json(settings);
});

app.post("/api/telegram/webhook/:botId", async (c) => {
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ ok: false, reason: "invalid secret" }, 401);
  }

  const bot = await getBotForWebhook(c.env, c.req.param("botId"));
  if (!bot) {
    return c.json({ ok: false, reason: "bot not found" }, 404);
  }
  if (!bot.tokenSecret) {
    return c.json({ ok: false, reason: "bot token is not configured" }, 422);
  }

  const payload = (await c.req.json()) as TelegramUpdate;
  if (!payload.message?.chat?.id) {
    return c.json({ ok: true, ignored: true });
  }

  const supportAgents = await listBotSupportAgents(c.env, tenantForBot(bot), bot.id);
  const supportAgent = supportAgents.find((agent) => agent.chatId && isSameChat(payload.message!.chat.id, parseChatTarget(agent.chatId)));
  if (supportAgent) {
    const supportChat = parseChatTarget(supportAgent.chatId);
    const reply = await relaySupportReplyToCustomer(c.env, bot.tokenSecret, bot, supportChat, payload.message);
    return c.json({ ok: true, mode: "support-reply", ...reply });
  }

  if (isStartCommand(payload.message)) {
    await handleStartCommand(c.env, bot.tokenSecret, bot, payload.message);
    return c.json({ ok: true, mode: "start-template" });
  }

  const relay = await relayCustomerToSupport(c.env, bot.tokenSecret, bot, payload.message);
  return c.json({ ok: true, mode: "customer-to-support", ...relay });
});

app.get("/", (c) => {
  return c.json({
    service: "telegram-support-api",
    endpoints: [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/me",
      "/api/auth/logout",
      "/api/platform/tenants",
      "/api/overview",
      "/api/message-logs",
      "/api/audit-logs",
      "/api/users",
      "/api/bots",
      "/api/bots/:id/support-agents",
      "/api/bots/:id/templates",
      "/api/bots/:id/customers",
      "/api/bots/:id/broadcast",
      "/api/routing-rules",
      "/api/support-config",
      "/api/templates",
      "/api/settings/system",
      "/api/telegram/webhook/:botId"
    ]
  });
});

export default app;
export { ConversationCoordinator };
