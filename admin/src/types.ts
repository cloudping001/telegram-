export type OverviewStats = {
  botCount: number;
  activeConversations: number;
  todayMessages: number;
  todayReplies: number;
  offlineReplies: number;
  queueFailures: number;
};

export type BotConfig = {
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

export type BotConfigInput = {
  name: string;
  username: string;
  token?: string;
  status: "online" | "paused";
  supportGroup?: string;
  webhookPath?: string;
};

export type BotSupportAgent = {
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

export type SupportConfig = {
  name: string;
  chatId: string;
  online: boolean;
};

export type TemplateButton = {
  text: string;
  url: string;
};

export type RoutingRule = {
  id: string;
  scene: string;
  source: string;
  target: string;
  fallback: string;
  enabled: boolean;
};

export type MessageTemplate = {
  id: string;
  botId?: string;
  name: string;
  scene: string;
  content: string;
  imageUrl?: string;
  parseMode: "plain" | "HTML" | "MarkdownV2";
  isDefault: boolean;
  buttons: TemplateButton[];
  timezone?: string;
  workStart?: string;
  workEnd?: string;
  enabled: boolean;
  updatedAt: string;
};

export type MessageTemplateInput = {
  name: string;
  scene: string;
  content: string;
  imageUrl?: string;
  parseMode: "plain" | "HTML" | "MarkdownV2";
  isDefault: boolean;
  buttons: TemplateButton[];
  timezone?: string;
  workStart?: string;
  workEnd?: string;
  enabled: boolean;
};

export type BotCustomer = {
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

export type BroadcastInput = {
  content: string;
  imageUrl?: string;
  parseMode?: "plain" | "HTML" | "MarkdownV2";
  buttons?: TemplateButton[];
};

export type BroadcastResult = {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
};

export type SystemSettings = {
  defaultLocale: string;
  retentionDays: number;
  uploadPolicy: string;
  queueStrategy: string;
  accessMode: string;
};

export type MessageDirection = "inbound" | "outbound" | "system";
export type MessageLogStatus = "sent" | "failed" | "ignored";
export type TelegramMessageType = "text" | "photo" | "document" | "voice" | "template" | "unsupported";

export type MessageLog = {
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

export type TenantUserRole = "owner" | "admin" | "member";
export type TenantUserStatus = "active" | "disabled";

export type AuthSession = {
  tenantId: string;
  userId: string;
  username: string;
  role: "platform_admin" | "registered_user";
  isPlatformAdmin?: boolean;
  createdAt: string;
};

export type RegisterPayload = {
  tenantName: string;
  username: string;
  password: string;
  displayName?: string;
  email?: string;
};

export type TenantUser = {
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

export type TenantPlan = "free" | "pro" | "enterprise";
export type TenantStatus = "active" | "disabled";

export type TenantSummary = {
  id: string;
  name: string;
  status: TenantStatus;
  plan: TenantPlan;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  botCount: number;
  messageCount: number;
  primaryUsername?: string;
  primaryDisplayName?: string;
  primaryEmail?: string;
};

export type TenantInput = {
  name: string;
  status: TenantStatus;
  plan: TenantPlan;
  notes?: string;
};

export type AuditLog = {
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
