export type BotRecord = {
  tenantId?: string;
  tenantName?: string;
  id: string;
  name: string;
  username: string;
  status: "online" | "paused";
  supportGroup: string;
  webhookPath: string;
  latestSync: string;
};

export type BotRuntimeRecord = BotRecord & {
  tokenSecret?: string;
};

export type BotInput = {
  name: string;
  username: string;
  token?: string;
  status: "online" | "paused";
  supportGroup?: string;
  webhookPath?: string;
};

export type BotSupportAgentRecord = {
  id: string;
  botId: string;
  name: string;
  chatId: string;
  online: boolean;
  weight: number;
  enabled: boolean;
  updatedAt: string;
};

export type BotSupportAgentInput = {
  id?: string;
  name: string;
  chatId: string;
  online: boolean;
  weight: number;
  enabled: boolean;
};

export type SupportConfigRecord = {
  name: string;
  chatId: string;
  online: boolean;
};

export type TemplateButtonRecord = {
  text: string;
  url: string;
};

export type RoutingRuleRecord = {
  id: string;
  scene: string;
  source: string;
  target: string;
  fallback: string;
  enabled: boolean;
};

export type TemplateRecord = {
  id: string;
  botId?: string;
  name: string;
  scene: string;
  content: string;
  imageUrl?: string;
  parseMode: "plain" | "HTML" | "MarkdownV2";
  isDefault: boolean;
  buttons: TemplateButtonRecord[];
  timezone?: string;
  workStart?: string;
  workEnd?: string;
  enabled: boolean;
  updatedAt: string;
};

export type TemplateInput = {
  name: string;
  scene: string;
  content: string;
  imageUrl?: string;
  parseMode: "plain" | "HTML" | "MarkdownV2";
  isDefault: boolean;
  buttons: TemplateButtonRecord[];
  timezone?: string;
  workStart?: string;
  workEnd?: string;
  enabled: boolean;
};

export type BotCustomerRecord = {
  id: string;
  botId: string;
  chatId: string;
  username?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  status: "active" | "blocked";
  source: string;
  messageCount: number;
  lastMessage?: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type BotCustomerInput = {
  botId: string;
  chatId: string;
  username?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  languageCode?: string;
  source?: string;
  lastMessage?: string;
};

export type BroadcastInput = {
  content: string;
  imageUrl?: string;
  parseMode?: "plain" | "HTML" | "MarkdownV2";
  buttons?: TemplateButtonRecord[];
};

export type BroadcastResult = {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
};

export type TenantPlan = "free" | "pro" | "enterprise";
export type TenantStatus = "active" | "disabled";

export type TenantRecord = {
  id: string;
  name: string;
  status: TenantStatus;
  plan: TenantPlan;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type TenantInput = {
  name: string;
  status: TenantStatus;
  plan: TenantPlan;
  notes?: string;
};

export type TenantSummaryRecord = TenantRecord & {
  userCount: number;
  botCount: number;
  messageCount: number;
  primaryUsername?: string;
  primaryDisplayName?: string;
  primaryEmail?: string;
};

export type PlatformUserInput = RegisterInput;

export type PlanLimitsRecord = {
  bots: number;
  users: number;
  templates: number;
  monthlyMessages: number;
};

export type TenantUsageRecord = {
  tenant: TenantRecord;
  limits: PlanLimitsRecord;
  usage: {
    bots: number;
    users: number;
    templates: number;
    monthlyMessages: number;
  };
};

export type AuditLogRecord = {
  id: string;
  tenantId: string;
  tenantName?: string;
  actorUserId?: string;
  actorUsername?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: string;
  createdAt: string;
};

export type AuditLogInput = Omit<AuditLogRecord, "id" | "tenantId" | "createdAt"> & {
  tenantId?: string;
};

export type TenantUserRole = "owner" | "admin" | "member";
export type TenantUserStatus = "active" | "disabled";

export type TenantUserRecord = {
  id: string;
  tenantId: string;
  username: string;
  displayName: string;
  email?: string;
  role: TenantUserRole;
  status: TenantUserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
};

export type TenantUserInput = {
  username: string;
  displayName?: string;
  email?: string;
  password?: string;
  role: TenantUserRole;
  status: TenantUserStatus;
};

export type PlatformAdminRecord = {
  id: string;
  username: string;
  updatedAt: string;
};

export type PlatformAdminInput = {
  username?: string;
  currentPassword: string;
  newPassword?: string;
};

export type RegisterInput = {
  tenantName: string;
  username: string;
  password: string;
  displayName?: string;
  email?: string;
};

export type AdminSessionRecord = {
  tenantId: string;
  userId: string;
  username: string;
  role: "platform_admin" | "registered_user";
  isPlatformAdmin?: boolean;
  createdAt: string;
};

export type ConversationRecord = {
  id: string;
  tenantId: string;
  botId: string;
  customerChatId: string;
  customerUsername?: string;
  customerName?: string;
  status: "open" | "closed";
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationInput = {
  tenantId?: string;
  botId: string;
  customerChatId: string;
  customerUsername?: string;
  customerName?: string;
};

export type MessageDirection = "inbound" | "outbound" | "system";
export type MessageLogStatus = "sent" | "failed" | "ignored";
export type TelegramMessageType = "text" | "photo" | "document" | "voice" | "template" | "unsupported";

export type MessageLogRecord = {
  id: string;
  tenantId: string;
  tenantName?: string;
  conversationId?: string;
  botId: string;
  direction: MessageDirection;
  messageType: TelegramMessageType;
  scene?: string;
  customerChatId?: string;
  supportChatId?: string;
  telegramMessageId?: string;
  relatedMessageId?: string;
  content?: string;
  mediaFileId?: string;
  mediaCaption?: string;
  status: MessageLogStatus;
  error?: string;
  createdAt: string;
};

export type MessageLogInput = Omit<MessageLogRecord, "id" | "tenantId" | "createdAt"> & {
  tenantId?: string;
};

export type OverviewStatsRecord = {
  botCount: number;
  activeConversations: number;
  todayMessages: number;
  todayReplies: number;
  offlineReplies: number;
  queueFailures: number;
};

export type SystemSettingsRecord = {
  defaultLocale: string;
  retentionDays: number;
  uploadPolicy: string;
  queueStrategy: string;
  accessMode: string;
  timezone: string;
  workStart: string;
  workEnd: string;
};

export type Env = {
  CACHE: KVNamespace;
  DB?: D1Database;
  MEDIA: R2Bucket;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ADMIN_API_TOKEN?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  CONVERSATION_COORDINATOR: DurableObjectNamespace<ConversationCoordinator>;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    chat: {
      id: number;
      type: string;
      title?: string;
      username?: string;
    };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };
    text?: string;
    caption?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      width: number;
      height: number;
      file_size?: number;
    }>;
    document?: {
      file_id: string;
      file_unique_id: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
    voice?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      mime_type?: string;
      file_size?: number;
    };
    reply_to_message?: {
      message_id: number;
      text?: string;
      caption?: string;
    };
  };
};

export interface ConversationCoordinator {
  ensureConversation(input: {
    chatId: number;
    botId: string;
    targetGroup: string;
  }): Promise<{ routeKey: string; targetGroup: string }>;
}
