import { botSeed, routingSeed, settingsSeed, templateSeed } from "./data";
import type {
  AuditLogInput,
  AuditLogRecord,
  BotCustomerInput,
  BotCustomerRecord,
  BotSupportAgentInput,
  BotSupportAgentRecord,
  BotInput,
  BotRecord,
  BotRuntimeRecord,
  ConversationInput,
  ConversationRecord,
  Env,
  MessageLogInput,
  MessageLogRecord,
  OverviewStatsRecord,
  PlanLimitsRecord,
  PlatformAdminInput,
  PlatformAdminRecord,
  RegisterInput,
  RoutingRuleRecord,
  TenantInput,
  PlatformUserInput,
  TenantPlan,
  TenantRecord,
  TenantStatus,
  TenantSummaryRecord,
  TenantUsageRecord,
  TenantUserInput,
  TenantUserRecord,
  SupportConfigRecord,
  SystemSettingsRecord,
  TemplateInput,
  TemplateRecord
} from "./types";

export const DEFAULT_TENANT_ID = "tenant-default";
const PLATFORM_ADMIN_ID = "platform-admin";

export const PLAN_LIMITS: Record<TenantPlan, PlanLimitsRecord> = {
  free: {
    bots: 1,
    users: 3,
    templates: 10,
    monthlyMessages: 1000
  },
  pro: {
    bots: 5,
    users: 20,
    templates: 100,
    monthlyMessages: 20000
  },
  enterprise: {
    bots: 50,
    users: 200,
    templates: 1000,
    monthlyMessages: 1000000
  }
};

async function hasDatabase(env: Env) {
  return Boolean(env.DB);
}

function isMissingTableError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("no such table") || error.message.includes("no such column"))
  );
}

function isMissingTokenSecretError(error: unknown) {
  return error instanceof Error && error.message.includes("no such column: token_secret");
}

function nowTimestamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function tenantId(value?: string) {
  return value?.trim() || DEFAULT_TENANT_ID;
}

function botId(value?: string) {
  return value?.trim() ?? "";
}

function truncate(value?: string, maxLength = 4000) {
  if (!value) {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256"
    },
    key,
    256
  );
  return `pbkdf2-sha256:${iterations}:${toBase64Url(salt)}:${toBase64Url(hash)}`;
}

async function verifyPassword(password: string, passwordHash?: string | null) {
  if (!passwordHash) {
    return false;
  }

  const [scheme, iterationsText, saltText, hashText] = passwordHash.split(":");
  const iterations = Number(iterationsText);
  if (scheme !== "pbkdf2-sha256" || !iterations || !saltText || !hashText) {
    return false;
  }

  const salt = fromBase64Url(saltText);
  const expected = fromBase64Url(hashText);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits"
  ]);
  const actual = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      expected.length * 8
    )
  );
  return timingSafeEqual(actual, expected);
}

type PlatformAdminRow = {
  id: string;
  username: string;
  passwordHash: string;
  updatedAt: string;
};

function mapPlatformAdminRow(row: PlatformAdminRow): PlatformAdminRecord & { passwordHash: string } {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    updatedAt: row.updatedAt
  };
}

async function readPlatformAdmin(env: Env) {
  if (!(await hasDatabase(env))) {
    return null;
  }

  try {
    const row = await env.DB!
      .prepare(
        "SELECT id, username, password_hash AS passwordHash, updated_at AS updatedAt FROM platform_admins WHERE id = ?1 LIMIT 1"
      )
      .bind(PLATFORM_ADMIN_ID)
      .first<PlatformAdminRow>();
    return row ? mapPlatformAdminRow(row) : null;
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function getPlatformAdmin(env: Env): Promise<PlatformAdminRecord> {
  const record = await readPlatformAdmin(env);
  if (record) {
    const { passwordHash: _passwordHash, ...publicRecord } = record;
    return publicRecord;
  }

  return {
    id: PLATFORM_ADMIN_ID,
    username: env.ADMIN_USERNAME ?? "admin",
    updatedAt: ""
  };
}

export async function authenticatePlatformAdmin(env: Env, username: string, password: string) {
  const record = await readPlatformAdmin(env);
  if (record) {
    const verified = record.username.toLowerCase() === username.toLowerCase() && (await verifyPassword(password, record.passwordHash));
    if (!verified) {
      return null;
    }
    const { passwordHash: _passwordHash, ...publicRecord } = record;
    return publicRecord;
  }

  const allowUsername = env.ADMIN_USERNAME ?? "admin";
  const allowPassword = env.ADMIN_PASSWORD ?? env.ADMIN_API_TOKEN;
  if (allowPassword && username === allowUsername && password === allowPassword) {
    return {
      id: PLATFORM_ADMIN_ID,
      username,
      updatedAt: ""
    };
  }

  return null;
}

export async function changePlatformAdmin(env: Env, input: PlatformAdminInput): Promise<PlatformAdminRecord> {
  if (!(await hasDatabase(env))) {
    throw new Error("Database is not configured");
  }

  const current = await readPlatformAdmin(env);
  const currentUsername = current?.username ?? env.ADMIN_USERNAME ?? "admin";
  const currentPasswordHash = current?.passwordHash;
  const envPassword = env.ADMIN_PASSWORD ?? env.ADMIN_API_TOKEN;
  const verified = currentPasswordHash
    ? await verifyPassword(input.currentPassword, currentPasswordHash)
    : Boolean(envPassword && input.currentPassword === envPassword);

  if (!verified) {
    throw new Error("Current password is incorrect");
  }

  const username = input.username?.trim() || currentUsername;
  if (username.length < 3) {
    throw new Error("Username must be at least 3 characters");
  }
  const conflictingTenantUser = await readUserByUsername(env, username);
  if (conflictingTenantUser) {
    throw new Error("Username is already used by a tenant user");
  }

  const passwordHash = input.newPassword?.trim()
    ? await hashPassword(input.newPassword.trim())
    : currentPasswordHash ?? (envPassword ? await hashPassword(envPassword) : "");
  if (!passwordHash) {
    throw new Error("New password is required");
  }

  const timestamp = nowTimestamp();
  try {
    await env.DB!
      .prepare(
        "INSERT INTO platform_admins(id, username, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash, updated_at = excluded.updated_at"
      )
      .bind(PLATFORM_ADMIN_ID, username, passwordHash, timestamp)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("Username is already used");
    }
    throw error;
  }

  return {
    id: PLATFORM_ADMIN_ID,
    username,
    updatedAt: timestamp
  };
}

function maskToken(token?: string) {
  if (!token) {
    return "not-set";
  }

  const [idPart, secretPart = ""] = token.split(":");
  return `${idPart || "token"}:***${secretPart.slice(-4)}`;
}

function normalizeWebhookPath(id: string, inputPath?: string) {
  if (inputPath?.trim()) {
    return inputPath.trim();
  }

  return `/api/telegram/webhook/${id.replace(/^bot-/, "")}`;
}

type TemplateRow = Omit<TemplateRecord, "buttons" | "enabled" | "isDefault"> & {
  botId?: string | null;
  enabled: number | boolean;
  isDefault?: number | boolean;
  buttons?: string | null;
};

function parseButtons(value?: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.text === "string" && typeof item.url === "string")
          .map((item) => ({ text: item.text.trim(), url: item.url.trim() }))
          .filter((item) => item.text && item.url)
      : [];
  } catch {
    return [];
  }
}

function normalizeButtons(input: TemplateInput["buttons"]) {
  return (input ?? [])
    .filter((item) => item.text?.trim() && item.url?.trim())
    .map((item) => ({ text: item.text.trim(), url: item.url.trim() }));
}

function normalizeParseMode(value?: string) {
  return value === "HTML" || value === "MarkdownV2" ? value : "plain";
}

function mapTemplateRow(row: TemplateRow): TemplateRecord {
  return {
    id: row.id,
    botId: row.botId ?? "",
    name: row.name,
    scene: row.scene,
    content: row.content,
    imageUrl: row.imageUrl ?? "",
    parseMode: normalizeParseMode(row.parseMode),
    isDefault: Boolean(row.isDefault),
    buttons: parseButtons(row.buttons),
    timezone: row.timezone ?? "",
    workStart: row.workStart ?? "",
    workEnd: row.workEnd ?? "",
    enabled: Boolean(row.enabled),
    updatedAt: row.updatedAt
  };
}

function makeTemplate(id: string, timestamp: string, input: TemplateInput, bot?: string): TemplateRecord {
  return {
    id,
    botId: bot ?? "",
    name: input.name.trim(),
    scene: input.scene.trim(),
    content: input.content.trim(),
    imageUrl: input.imageUrl?.trim() ?? "",
    parseMode: normalizeParseMode(input.parseMode),
    isDefault: Boolean(input.isDefault),
    buttons: normalizeButtons(input.buttons),
    timezone: input.timezone?.trim() ?? "",
    workStart: input.workStart?.trim() ?? "",
    workEnd: input.workEnd?.trim() ?? "",
    enabled: Boolean(input.enabled),
    updatedAt: timestamp
  };
}

const defaultSupportConfig: SupportConfigRecord = {
  name: "",
  chatId: "",
  online: true
};

type BotSupportAgentRow = {
  id: string;
  botId: string;
  name: string;
  chatId: string;
  online?: number | boolean | null;
  weight?: number | null;
  enabled?: number | boolean | null;
  updatedAt: string;
};

function mapBotSupportAgentRow(row: BotSupportAgentRow): BotSupportAgentRecord {
  return {
    id: row.id,
    botId: row.botId,
    name: row.name,
    chatId: row.chatId,
    online: Boolean(row.online),
    weight: Math.max(0, Number(row.weight ?? 100)),
    enabled: Boolean(row.enabled),
    updatedAt: row.updatedAt
  };
}

type BotCustomerRow = {
  id: string;
  botId: string;
  chatId: string;
  username?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  status?: string | null;
  source?: string | null;
  messageCount?: number | null;
  lastMessage?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

function mapBotCustomerRow(row: BotCustomerRow): BotCustomerRecord {
  return {
    id: row.id,
    botId: row.botId,
    chatId: row.chatId,
    username: row.username ?? "",
    displayName: row.displayName || row.username || row.chatId,
    firstName: row.firstName ?? "",
    lastName: row.lastName ?? "",
    languageCode: row.languageCode ?? "",
    status: row.status === "blocked" ? "blocked" : "active",
    source: row.source ?? "message",
    messageCount: Number(row.messageCount ?? 0),
    lastMessage: row.lastMessage ?? "",
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt
  };
}

type TenantUserRow = {
  id: string;
  tenantId: string;
  username: string;
  displayName?: string | null;
  email?: string | null;
  passwordHash?: string | null;
  role: TenantUserRecord["role"];
  status: TenantUserRecord["status"];
  createdAt: string;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
};

type TenantRow = {
  id: string;
  name: string;
  status: TenantStatus;
  plan?: TenantPlan | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

type TenantSummaryRow = TenantRow & {
  userCount?: number | null;
  botCount?: number | null;
  messageCount?: number | null;
  primaryUsername?: string | null;
  primaryDisplayName?: string | null;
  primaryEmail?: string | null;
};

type TenantUserRuntimeRecord = TenantUserRecord & {
  passwordHash?: string | null;
};

function normalizeTenantStatus(value?: string): TenantStatus {
  return value === "disabled" ? "disabled" : "active";
}

function normalizeTenantPlan(value?: string): TenantPlan {
  return value === "pro" || value === "enterprise" ? value : "free";
}

function mapTenantRow(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    name: row.name,
    status: normalizeTenantStatus(row.status),
    plan: normalizeTenantPlan(row.plan ?? undefined),
    notes: row.notes ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.createdAt
  };
}

function mapTenantSummaryRow(row: TenantSummaryRow): TenantSummaryRecord {
  return {
    ...mapTenantRow(row),
    userCount: Number(row.userCount ?? 0),
    botCount: Number(row.botCount ?? 0),
    messageCount: Number(row.messageCount ?? 0),
    primaryUsername: row.primaryUsername ?? "",
    primaryDisplayName: row.primaryDisplayName ?? "",
    primaryEmail: row.primaryEmail ?? ""
  };
}

function monthStartTimestamp() {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  return monthStart.toISOString().slice(0, 19).replace("T", " ");
}

export function getPlanLimits(plan?: TenantPlan): PlanLimitsRecord {
  return PLAN_LIMITS[normalizeTenantPlan(plan)];
}

async function readTenantById(env: Env, id: string): Promise<TenantRecord | null> {
  if (!(await hasDatabase(env))) {
    return null;
  }

  const row = await env.DB!
    .prepare(
      "SELECT id, name, status, plan, notes, created_at AS createdAt, updated_at AS updatedAt FROM tenants WHERE id = ?1 LIMIT 1"
    )
    .bind(tenantId(id))
    .first<TenantRow>();
  return row ? mapTenantRow(row) : null;
}

export async function getTenant(env: Env, id: string) {
  return readTenantById(env, id);
}

export async function getTenantUsage(env: Env, tenant?: string): Promise<TenantUsageRecord> {
  if (!(await hasDatabase(env))) {
    const fallback: TenantRecord = {
      id: tenantId(tenant),
      name: "Account",
      status: "active",
      plan: "free",
      notes: "",
      createdAt: nowTimestamp(),
      updatedAt: nowTimestamp()
    };
    return {
      tenant: fallback,
      limits: getPlanLimits(fallback.plan),
      usage: {
        bots: 0,
        users: 0,
        templates: 0,
        monthlyMessages: 0
      }
    };
  }

  const currentTenant = tenantId(tenant);
  const tenantRecord = await readTenantById(env, currentTenant);
  if (!tenantRecord) {
    throw new Error("Account not found");
  }

  const monthStart = monthStartTimestamp();
  const [bots, users, templates, monthlyMessages] = await Promise.all([
    countRows(env, "SELECT COUNT(*) AS value FROM bots WHERE tenant_id = ?1", currentTenant),
    countRows(env, "SELECT COUNT(*) AS value FROM tenant_users WHERE tenant_id = ?1", currentTenant),
    countRows(env, "SELECT COUNT(*) AS value FROM templates WHERE tenant_id = ?1", currentTenant),
    countRows(
      env,
      "SELECT COUNT(*) AS value FROM message_logs WHERE tenant_id = ?1 AND created_at >= ?2",
      currentTenant,
      monthStart
    )
  ]);

  return {
    tenant: tenantRecord,
    limits: getPlanLimits(tenantRecord.plan),
    usage: {
      bots,
      users,
      templates,
      monthlyMessages
    }
  };
}

type AuditLogRow = {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: string | null;
  createdAt: string;
};

function mapAuditLogRow(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? "",
    actorUserId: row.actorUserId ?? "",
    actorUsername: row.actorUsername ?? "",
    actorRole: row.actorRole ?? "",
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId ?? "",
    details: row.details ?? "",
    createdAt: row.createdAt
  };
}

export async function createAuditLog(env: Env, input: AuditLogInput): Promise<AuditLogRecord> {
  const timestamp = nowTimestamp();
  const log: AuditLogRecord = {
    id: makeId("audit"),
    tenantId: tenantId(input.tenantId),
    actorUserId: input.actorUserId ?? "",
    actorUsername: input.actorUsername ?? "",
    actorRole: input.actorRole ?? "",
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? "",
    details: truncate(input.details, 2000),
    createdAt: timestamp
  };

  if (!(await hasDatabase(env))) {
    return log;
  }

  try {
    await env.DB!
      .prepare(
        "INSERT INTO audit_logs(id, tenant_id, actor_user_id, actor_username, actor_role, action, resource_type, resource_id, details, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
      )
      .bind(
        log.id,
        log.tenantId,
        log.actorUserId || null,
        log.actorUsername || null,
        log.actorRole || null,
        log.action,
        log.resourceType,
        log.resourceId || null,
        log.details || null,
        timestamp
      )
      .run();
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  return log;
}

export async function listAuditLogs(
  env: Env,
  limit = 100,
  tenant?: string,
  includeAllTenants = false
): Promise<AuditLogRecord[]> {
  if (!(await hasDatabase(env))) {
    return [];
  }

  try {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    if (includeAllTenants) {
      const result = await env.DB!
        .prepare(
          "SELECT a.id, a.tenant_id AS tenantId, t.name AS tenantName, a.actor_user_id AS actorUserId, a.actor_username AS actorUsername, a.actor_role AS actorRole, a.action, a.resource_type AS resourceType, a.resource_id AS resourceId, a.details, a.created_at AS createdAt FROM audit_logs a LEFT JOIN tenants t ON t.id = a.tenant_id ORDER BY a.created_at DESC LIMIT ?1"
        )
        .bind(safeLimit)
        .all<AuditLogRow>();
      return result.results.map(mapAuditLogRow);
    }

    const result = await env.DB!
      .prepare(
        "SELECT a.id, a.tenant_id AS tenantId, t.name AS tenantName, a.actor_user_id AS actorUserId, a.actor_username AS actorUsername, a.actor_role AS actorRole, a.action, a.resource_type AS resourceType, a.resource_id AS resourceId, a.details, a.created_at AS createdAt FROM audit_logs a LEFT JOIN tenants t ON t.id = a.tenant_id WHERE a.tenant_id = ?1 ORDER BY a.created_at DESC LIMIT ?2"
      )
      .bind(tenantId(tenant), safeLimit)
      .all<AuditLogRow>();
    return result.results.map(mapAuditLogRow);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function listTenants(env: Env): Promise<TenantSummaryRecord[]> {
  if (!(await hasDatabase(env))) {
    return [];
  }

  try {
    const result = await env.DB!
      .prepare(
        "SELECT t.id, t.name, t.status, t.plan, t.notes, t.created_at AS createdAt, t.updated_at AS updatedAt, COUNT(DISTINCT u.id) AS userCount, COUNT(DISTINCT b.id) AS botCount, COUNT(DISTINCT m.id) AS messageCount, (SELECT pu.username FROM tenant_users pu WHERE pu.tenant_id = t.id ORDER BY CASE WHEN pu.role = 'owner' THEN 0 ELSE 1 END, pu.created_at LIMIT 1) AS primaryUsername, (SELECT pu.display_name FROM tenant_users pu WHERE pu.tenant_id = t.id ORDER BY CASE WHEN pu.role = 'owner' THEN 0 ELSE 1 END, pu.created_at LIMIT 1) AS primaryDisplayName, (SELECT pu.email FROM tenant_users pu WHERE pu.tenant_id = t.id ORDER BY CASE WHEN pu.role = 'owner' THEN 0 ELSE 1 END, pu.created_at LIMIT 1) AS primaryEmail FROM tenants t LEFT JOIN tenant_users u ON u.tenant_id = t.id LEFT JOIN bots b ON b.tenant_id = t.id LEFT JOIN message_logs m ON m.tenant_id = t.id GROUP BY t.id ORDER BY COALESCE(t.updated_at, t.created_at) DESC"
      )
      .all<TenantSummaryRow>();
    return result.results.map(mapTenantSummaryRow);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function updateTenant(
  env: Env,
  id: string,
  input: TenantInput
): Promise<TenantRecord> {
  if (!(await hasDatabase(env))) {
    throw new Error("Database is not configured");
  }

  const timestamp = nowTimestamp();
  const tenant: TenantRecord = {
    id,
    name: input.name.trim(),
    status: normalizeTenantStatus(input.status),
    plan: normalizeTenantPlan(input.plan),
    notes: input.notes?.trim() ?? "",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const result = await env.DB!
    .prepare(
      "UPDATE tenants SET name = ?1, status = ?2, plan = ?3, notes = ?4, updated_at = ?5 WHERE id = ?6"
    )
    .bind(tenant.name, tenant.status, tenant.plan, tenant.notes || null, timestamp, id)
    .run();

  if (!result.meta.rows_written) {
    throw new Error("Account not found");
  }

  const row = await readTenantById(env, id);
  return row ?? tenant;
}

function normalizeRole(value?: string): TenantUserRecord["role"] {
  return value === "owner" || value === "admin" || value === "member" ? value : "member";
}

function normalizeUserStatus(value?: string): TenantUserRecord["status"] {
  return value === "disabled" ? "disabled" : "active";
}

function mapTenantUserRow(row: TenantUserRow): TenantUserRuntimeRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    username: row.username,
    displayName: row.displayName || row.username,
    email: row.email ?? "",
    passwordHash: row.passwordHash ?? "",
    role: normalizeRole(row.role),
    status: normalizeUserStatus(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt ?? row.createdAt,
    lastLoginAt: row.lastLoginAt ?? ""
  };
}

function publicUser(user: TenantUserRuntimeRecord): TenantUserRecord {
  const { passwordHash: _passwordHash, ...record } = user;
  return record;
}

async function readUserByUsername(env: Env, username: string): Promise<TenantUserRuntimeRecord | null> {
  if (!(await hasDatabase(env))) {
    return null;
  }

  try {
    const row = await env.DB!
      .prepare(
        "SELECT id, tenant_id AS tenantId, username, display_name AS displayName, email, password_hash AS passwordHash, role, status, created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt FROM tenant_users WHERE lower(username) = lower(?1) LIMIT 1"
      )
      .bind(username)
      .first<TenantUserRow>();
    return row ? mapTenantUserRow(row) : null;
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

async function readUserById(env: Env, tenant: string, id: string): Promise<TenantUserRuntimeRecord | null> {
  if (!(await hasDatabase(env))) {
    return null;
  }

  const row = await env.DB!
    .prepare(
      "SELECT id, tenant_id AS tenantId, username, display_name AS displayName, email, password_hash AS passwordHash, role, status, created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt FROM tenant_users WHERE tenant_id = ?1 AND id = ?2 LIMIT 1"
    )
    .bind(tenantId(tenant), id)
    .first<TenantUserRow>();
  return row ? mapTenantUserRow(row) : null;
}

export async function authenticateTenantUser(env: Env, username: string, password: string) {
  const user = await readUserByUsername(env, username.trim());
  if (!user || user.status !== "active") {
    return null;
  }
  const tenant = await readTenantById(env, user.tenantId);
  if (!tenant || tenant.status !== "active") {
    return null;
  }

  const verified = await verifyPassword(password, user.passwordHash);
  if (!verified) {
    return null;
  }

  const timestamp = nowTimestamp();
  await env.DB!
    .prepare("UPDATE tenant_users SET last_login_at = ?1, updated_at = COALESCE(updated_at, ?1) WHERE id = ?2")
    .bind(timestamp, user.id)
    .run();

  return publicUser({ ...user, lastLoginAt: timestamp });
}

export async function registerTenant(env: Env, input: RegisterInput) {
  if (!(await hasDatabase(env))) {
    throw new Error("Database is not configured");
  }

  const tenant: TenantRecord = {
    id: makeId("tenant"),
    name: input.tenantName.trim(),
    status: "active",
    plan: "free",
    notes: "",
    createdAt: nowTimestamp(),
    updatedAt: nowTimestamp()
  };
  const passwordHash = await hashPassword(input.password);
  const timestamp = tenant.createdAt;
  const user: TenantUserRuntimeRecord = {
    id: makeId("user"),
    tenantId: tenant.id,
    username: input.username.trim(),
    displayName: input.displayName?.trim() || input.username.trim(),
    email: input.email?.trim() ?? "",
    passwordHash,
    role: "owner",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: timestamp
  };

  try {
    await env.DB!.batch([
      env.DB!
        .prepare("INSERT INTO tenants(id, name, status, plan, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
        .bind(tenant.id, tenant.name, tenant.status, tenant.plan, tenant.notes || null, tenant.createdAt),
      env.DB!
        .prepare(
          "INSERT INTO tenant_users(id, tenant_id, username, password_hash, display_name, email, role, status, created_at, updated_at, last_login_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9)"
        )
        .bind(
          user.id,
          user.tenantId,
          user.username,
          passwordHash,
          user.displayName,
          user.email || null,
          user.role,
          user.status,
          timestamp
        )
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("Username already exists");
    }
    throw error;
  }

  return { tenant, user: publicUser(user) };
}

async function tenantSummaryById(env: Env, id: string) {
  const rows = await listTenants(env);
  return rows.find((item) => item.id === id) ?? null;
}

export async function createPlatformUser(env: Env, input: PlatformUserInput): Promise<TenantSummaryRecord> {
  const result = await registerTenant(env, input);
  const summary = await tenantSummaryById(env, result.tenant.id);
  if (!summary) {
    throw new Error("Account was created but could not be loaded");
  }
  return summary;
}

async function readPrimaryUserByTenant(env: Env, tenant: string) {
  if (!(await hasDatabase(env))) {
    return null;
  }
  const row = await env.DB!
    .prepare(
      "SELECT id, tenant_id AS tenantId, username, display_name AS displayName, email, password_hash AS passwordHash, role, status, created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt FROM tenant_users WHERE tenant_id = ?1 ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at LIMIT 1"
    )
    .bind(tenantId(tenant))
    .first<TenantUserRow>();
  return row ? mapTenantUserRow(row) : null;
}

export async function resetPlatformUserPassword(env: Env, tenant: string, password: string) {
  if (!password?.trim() || password.trim().length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const user = await readPrimaryUserByTenant(env, tenant);
  if (!user) {
    throw new Error("Login account not found");
  }
  return changeTenantUserPassword(env, tenant, user.id, password.trim());
}

export async function deletePlatformUser(env: Env, tenant: string): Promise<{ id: string }> {
  if (!(await hasDatabase(env))) {
    return { id: tenantId(tenant) };
  }

  const currentTenant = tenantId(tenant);
  const existing = await readTenantById(env, currentTenant);
  if (!existing) {
    throw new Error("Account not found");
  }

  const statements = [
    "DELETE FROM message_logs WHERE tenant_id = ?1",
    "DELETE FROM conversations WHERE tenant_id = ?1",
    "DELETE FROM bot_customers WHERE tenant_id = ?1",
    "DELETE FROM bot_support_agents WHERE tenant_id = ?1",
    "DELETE FROM bots WHERE tenant_id = ?1",
    "DELETE FROM templates WHERE tenant_id = ?1",
    "DELETE FROM tenant_settings WHERE tenant_id = ?1",
    "DELETE FROM audit_logs WHERE tenant_id = ?1",
    "DELETE FROM tenant_users WHERE tenant_id = ?1",
    "DELETE FROM tenants WHERE id = ?1"
  ];

  try {
    await env.DB!.batch(statements.map((statement) => env.DB!.prepare(statement).bind(currentTenant)));
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Account delete failed because database schema is not up to date");
    }
    throw error;
  }

  return { id: currentTenant };
}

export async function listTenantUsers(env: Env, tenant?: string): Promise<TenantUserRecord[]> {
  if (!(await hasDatabase(env))) {
    return [];
  }

  try {
    const result = await env.DB!
      .prepare(
        "SELECT id, tenant_id AS tenantId, username, display_name AS displayName, email, password_hash AS passwordHash, role, status, created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt FROM tenant_users WHERE tenant_id = ?1 ORDER BY created_at DESC"
      )
      .bind(tenantId(tenant))
      .all<TenantUserRow>();
    return result.results.map(mapTenantUserRow).map(publicUser);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function createTenantUser(
  env: Env,
  tenant: string,
  input: TenantUserInput
): Promise<TenantUserRecord> {
  if (!(await hasDatabase(env))) {
    throw new Error("Database is not configured");
  }
  if (!input.password?.trim()) {
    throw new Error("Password is required");
  }

  const timestamp = nowTimestamp();
  const passwordHash = await hashPassword(input.password);
  const user: TenantUserRuntimeRecord = {
    id: makeId("user"),
    tenantId: tenantId(tenant),
    username: input.username.trim(),
    displayName: input.displayName?.trim() || input.username.trim(),
    email: input.email?.trim() ?? "",
    passwordHash,
    role: normalizeRole(input.role),
    status: normalizeUserStatus(input.status),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: ""
  };

  try {
    await env.DB!
      .prepare(
        "INSERT INTO tenant_users(id, tenant_id, username, password_hash, display_name, email, role, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)"
      )
      .bind(
        user.id,
        user.tenantId,
        user.username,
        passwordHash,
        user.displayName,
        user.email || null,
        user.role,
        user.status,
        timestamp
      )
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("Username already exists");
    }
    throw error;
  }

  return publicUser(user);
}

export async function updateTenantUser(
  env: Env,
  tenant: string,
  id: string,
  input: TenantUserInput
): Promise<TenantUserRecord> {
  if (!(await hasDatabase(env))) {
    throw new Error("Database is not configured");
  }

  const currentTenant = tenantId(tenant);
  const current = await readUserById(env, currentTenant, id);
  if (!current) {
    throw new Error("User not found");
  }

  const timestamp = nowTimestamp();
  const role = normalizeRole(input.role);
  const status = normalizeUserStatus(input.status);

  if (current.role === "owner" && (role !== "owner" || status !== "active")) {
    const otherActiveOwners = await countRows(
      env,
      "SELECT COUNT(*) AS value FROM tenant_users WHERE tenant_id = ?1 AND id <> ?2 AND role = 'owner' AND status = 'active'",
      currentTenant,
      id
    );
    if (otherActiveOwners < 1) {
      throw new Error("At least one active owner is required");
    }
  }

  const result = await env.DB!
    .prepare(
      "UPDATE tenant_users SET username = ?1, display_name = ?2, email = ?3, role = ?4, status = ?5, updated_at = ?6 WHERE tenant_id = ?7 AND id = ?8"
    )
    .bind(
      input.username.trim(),
      input.displayName?.trim() || input.username.trim(),
      input.email?.trim() || null,
      role,
      status,
      timestamp,
      currentTenant,
      id
    )
    .run();

  if (!result.meta.rows_written) {
    throw new Error("User not found");
  }

  if (input.password?.trim()) {
    await changeTenantUserPassword(env, currentTenant, id, input.password.trim());
  }

  return {
    ...publicUser(current),
    username: input.username.trim(),
    displayName: input.displayName?.trim() || input.username.trim(),
    email: input.email?.trim() ?? "",
    role,
    status,
    updatedAt: timestamp
  };
}

export async function changeTenantUserPassword(env: Env, tenant: string, id: string, password: string) {
  if (!(await hasDatabase(env))) {
    throw new Error("Database is not configured");
  }

  const passwordHash = await hashPassword(password);
  const timestamp = nowTimestamp();
  const result = await env.DB!
    .prepare("UPDATE tenant_users SET password_hash = ?1, updated_at = ?2 WHERE tenant_id = ?3 AND id = ?4")
    .bind(passwordHash, timestamp, tenantId(tenant), id)
    .run();

  if (!result.meta.rows_written) {
    throw new Error("User not found");
  }

  return { ok: true };
}

export async function deleteTenantUser(env: Env, tenant: string, id: string) {
  if (!(await hasDatabase(env))) {
    throw new Error("Database is not configured");
  }

  const currentTenant = tenantId(tenant);
  const user = await readUserById(env, currentTenant, id);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.role === "owner") {
    const ownerCount = await countRows(
      env,
      "SELECT COUNT(*) AS value FROM tenant_users WHERE tenant_id = ?1 AND role = 'owner' AND status = 'active'",
      currentTenant
    );
    if (ownerCount <= 1) {
      throw new Error("At least one active owner is required");
    }
  }

  await env.DB!.prepare("DELETE FROM tenant_users WHERE tenant_id = ?1 AND id = ?2").bind(currentTenant, id).run();
  return { id };
}

export async function changeOwnPassword(
  env: Env,
  tenant: string,
  id: string,
  currentPassword: string,
  nextPassword: string
) {
  const user = await readUserById(env, tenant, id);
  if (!user) {
    throw new Error("User not found");
  }
  const verified = await verifyPassword(currentPassword, user.passwordHash);
  if (!verified) {
    throw new Error("Current password is invalid");
  }
  return changeTenantUserPassword(env, tenant, id, nextPassword);
}

async function readSettingsMap(env: Env, tenant?: string) {
  const rows = await env.DB!
    .prepare("SELECT key, value FROM tenant_settings WHERE tenant_id = ?1")
    .bind(tenantId(tenant))
    .all<{ key: string; value: string }>();

  if (!rows.results.length && tenantId(tenant) === DEFAULT_TENANT_ID) {
    const legacyRows = await env.DB!
      .prepare("SELECT key, value FROM system_settings")
      .all<{ key: string; value: string }>();
    return Object.fromEntries(legacyRows.results.map((item) => [item.key, JSON.parse(item.value)]));
  }

  return Object.fromEntries(rows.results.map((item) => [item.key, JSON.parse(item.value)]));
}

export async function getSupportConfig(env: Env, tenant?: string): Promise<SupportConfigRecord> {
  if (!(await hasDatabase(env))) {
    return defaultSupportConfig;
  }

  try {
    const map = await readSettingsMap(env, tenant);
    return {
      name: map.supportName ?? defaultSupportConfig.name,
      chatId: map.supportChatId ?? defaultSupportConfig.chatId,
      online: map.supportOnline ?? defaultSupportConfig.online
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return defaultSupportConfig;
    }
    throw error;
  }
}

export async function saveSupportConfig(
  env: Env,
  payload: SupportConfigRecord,
  tenant?: string
): Promise<SupportConfigRecord> {
  const config: SupportConfigRecord = {
    name: payload.name.trim(),
    chatId: payload.chatId.trim(),
    online: payload.online ?? true
  };

  if (!(await hasDatabase(env))) {
    return config;
  }

  try {
    const timestamp = new Date().toISOString();
    await env.DB!.batch([
      env.DB!
        .prepare(
          "INSERT INTO tenant_settings(tenant_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
        )
        .bind(tenantId(tenant), "supportName", JSON.stringify(config.name), timestamp),
      env.DB!
        .prepare(
          "INSERT INTO tenant_settings(tenant_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
        )
        .bind(tenantId(tenant), "supportChatId", JSON.stringify(config.chatId), timestamp),
      env.DB!
        .prepare(
          "INSERT INTO tenant_settings(tenant_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
        )
        .bind(tenantId(tenant), "supportOnline", JSON.stringify(config.online), timestamp)
    ]);
    return config;
  } catch (error) {
    if (isMissingTableError(error)) {
      return config;
    }
    throw error;
  }
}

export async function listBotSupportAgents(
  env: Env,
  tenant: string,
  botId: string
): Promise<BotSupportAgentRecord[]> {
  const currentTenant = tenantId(tenant);
  if (!(await hasDatabase(env))) {
    const supportConfig = await getSupportConfig(env, currentTenant);
    return supportConfig.chatId
      ? [
          {
            id: "fallback-support",
            botId,
            name: supportConfig.name || "默认客服",
            chatId: supportConfig.chatId,
            online: supportConfig.online,
            weight: 100,
            enabled: true,
            updatedAt: nowTimestamp()
          }
        ]
      : [];
  }

  try {
    const result = await env.DB!
      .prepare(
        "SELECT id, bot_id AS botId, name, chat_id AS chatId, online, weight, enabled, updated_at AS updatedAt FROM bot_support_agents WHERE tenant_id = ?1 AND bot_id = ?2 ORDER BY created_at ASC"
      )
      .bind(currentTenant, botId)
      .all<BotSupportAgentRow>();
    if (result.results.length) {
      return result.results.map(mapBotSupportAgentRow);
    }

    const bots = await listBots(env, currentTenant);
    const bot = bots.find((item) => item.id === botId);
    const supportConfig = await getSupportConfig(env, currentTenant);
    const fallbackChatId = bot?.supportGroup || supportConfig.chatId;
    if (!fallbackChatId) {
      return [];
    }
    return [
      {
        id: "fallback-support",
        botId,
        name: supportConfig.name || "默认客服",
        chatId: fallbackChatId,
        online: supportConfig.online,
        weight: 100,
        enabled: true,
        updatedAt: nowTimestamp()
      }
    ];
  } catch (error) {
    if (isMissingTableError(error)) {
      const supportConfig = await getSupportConfig(env, currentTenant);
      return supportConfig.chatId
        ? [
            {
              id: "fallback-support",
              botId,
              name: supportConfig.name || "默认客服",
              chatId: supportConfig.chatId,
              online: supportConfig.online,
              weight: 100,
              enabled: true,
              updatedAt: nowTimestamp()
            }
          ]
        : [];
    }
    throw error;
  }
}

export async function saveBotSupportAgents(
  env: Env,
  tenant: string,
  botId: string,
  input: BotSupportAgentInput[]
): Promise<BotSupportAgentRecord[]> {
  if (!(await hasDatabase(env))) {
    return input
      .filter((item) => item.chatId?.trim())
      .map((item, index) => ({
        id: item.id || makeId("agent"),
        botId,
        name: item.name.trim() || `客服 ${index + 1}`,
        chatId: item.chatId.trim(),
        online: Boolean(item.online),
        weight: Math.max(0, Math.round(Number(item.weight || 0))),
        enabled: Boolean(item.enabled),
        updatedAt: nowTimestamp()
      }));
  }

  const currentTenant = tenantId(tenant);
  const timestamp = nowTimestamp();
  const bots = await listBots(env, currentTenant);
  if (!bots.some((item) => item.id === botId)) {
    throw new Error("Bot not found");
  }

  const rows = input
    .map((item, index) => ({
      id: item.id && !item.id.startsWith("fallback-") ? item.id : makeId("agent"),
      name: item.name.trim() || `客服 ${index + 1}`,
      chatId: item.chatId.trim(),
      online: Boolean(item.online),
      weight: Math.max(0, Math.round(Number(item.weight || 0))),
      enabled: Boolean(item.enabled)
    }))
    .filter((item) => item.chatId);

  const firstTarget = rows.find((item) => item.enabled && item.online)?.chatId ?? rows[0]?.chatId ?? "";

  await env.DB!.batch([
    env.DB!.prepare("DELETE FROM bot_support_agents WHERE tenant_id = ?1 AND bot_id = ?2").bind(currentTenant, botId),
    ...rows.map((row) =>
      env.DB!
        .prepare(
          "INSERT INTO bot_support_agents(id, tenant_id, bot_id, name, chat_id, online, weight, enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)"
        )
        .bind(row.id, currentTenant, botId, row.name, row.chatId, row.online ? 1 : 0, row.weight, row.enabled ? 1 : 0, timestamp)
    ),
    env.DB!
      .prepare("UPDATE bots SET support_group = ?1, updated_at = ?2 WHERE tenant_id = ?3 AND id = ?4")
      .bind(firstTarget, timestamp, currentTenant, botId)
  ]);

  return listBotSupportAgents(env, currentTenant, botId);
}

function weightedRandomIndex(weights: number[]) {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return 0;
  }
  const randomBytes = crypto.getRandomValues(new Uint32Array(1))[0];
  let cursor = (randomBytes / 2 ** 32) * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= Math.max(0, weights[index]);
    if (cursor <= 0) {
      return index;
    }
  }
  return weights.length - 1;
}

export async function selectBotSupportAgent(env: Env, bot: BotRecord): Promise<BotSupportAgentRecord | null> {
  const agents = await listBotSupportAgents(env, tenantId(bot.tenantId), bot.id);
  const activeAgents = agents.filter((item) => item.enabled && item.online && item.chatId);
  if (activeAgents.length) {
    const weights = activeAgents.map((item) => (item.weight > 0 ? item.weight : 1));
    return activeAgents[weightedRandomIndex(weights)];
  }

  if (!agents.length && bot.supportGroup) {
    return {
      id: "fallback-support",
      botId: bot.id,
      name: "默认客服",
      chatId: bot.supportGroup,
      online: true,
      weight: 100,
      enabled: true,
      updatedAt: nowTimestamp()
    };
  }
  return null;
}

type BotRow = BotRecord & {
  tenantName?: string | null;
};

function mapBotRow(row: BotRow): BotRecord {
  return {
    tenantId: row.tenantId ?? DEFAULT_TENANT_ID,
    tenantName: row.tenantName ?? "",
    id: row.id,
    name: row.name,
    username: row.username,
    status: row.status,
    supportGroup: row.supportGroup,
    webhookPath: row.webhookPath,
    latestSync: row.latestSync
  };
}

export async function listBots(env: Env, tenant?: string, includeAllTenants = false): Promise<BotRecord[]> {
  if (!(await hasDatabase(env))) {
    return botSeed;
  }

  try {
    if (includeAllTenants) {
      const result = await env.DB!
        .prepare(
          "SELECT b.tenant_id AS tenantId, t.name AS tenantName, b.id, b.name, b.username, b.status, b.support_group AS supportGroup, b.webhook_path AS webhookPath, COALESCE(b.updated_at, b.created_at) AS latestSync FROM bots b LEFT JOIN tenants t ON t.id = b.tenant_id ORDER BY COALESCE(b.updated_at, b.created_at) DESC"
        )
        .all<BotRow>();

      return result.results.map(mapBotRow);
    }

    const currentTenant = tenantId(tenant);
    const result = await env.DB!
      .prepare(
        "SELECT b.tenant_id AS tenantId, t.name AS tenantName, b.id, b.name, b.username, b.status, b.support_group AS supportGroup, b.webhook_path AS webhookPath, COALESCE(b.updated_at, b.created_at) AS latestSync FROM bots b LEFT JOIN tenants t ON t.id = b.tenant_id WHERE b.tenant_id = ?1 ORDER BY COALESCE(b.updated_at, b.created_at) DESC"
      )
      .bind(currentTenant)
      .all<BotRow>();

    return result.results.length ? result.results.map(mapBotRow) : currentTenant === DEFAULT_TENANT_ID ? botSeed : [];
  } catch (error) {
    if (isMissingTableError(error)) {
      return botSeed;
    }
    throw error;
  }
}

export async function createBot(env: Env, input: BotInput, tenant?: string): Promise<BotRecord> {
  const id = makeId("bot");
  const timestamp = nowTimestamp();
  const currentTenant = tenantId(tenant);
  const supportConfig = await getSupportConfig(env, currentTenant);
  const bot: BotRecord = {
    tenantId: currentTenant,
    id,
    name: input.name.trim(),
    username: input.username.trim(),
    status: input.status,
    supportGroup: input.supportGroup?.trim() || supportConfig.chatId,
    webhookPath: normalizeWebhookPath(id, input.webhookPath),
    latestSync: timestamp
  };

  if (!(await hasDatabase(env))) {
    return bot;
  }

  try {
    await env.DB!
      .prepare(
        "INSERT INTO bots(tenant_id, id, name, username, token_masked, token_secret, webhook_path, status, support_group, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)"
      )
      .bind(
        bot.tenantId,
        bot.id,
        bot.name,
        bot.username,
        maskToken(input.token),
        input.token?.trim() ?? null,
        bot.webhookPath,
        bot.status,
        bot.supportGroup,
        timestamp
      )
      .run();

    await seedBotTemplatesFromGlobal(env, currentTenant, bot.id);

    return bot;
  } catch (error) {
    if (isMissingTableError(error)) {
      return bot;
    }
    throw error;
  }
}

export async function updateBot(env: Env, id: string, input: BotInput, tenant?: string): Promise<BotRecord> {
  const timestamp = nowTimestamp();
  const currentTenant = tenantId(tenant);
  const supportConfig = await getSupportConfig(env, currentTenant);
  const bot: BotRecord = {
    tenantId: currentTenant,
    id,
    name: input.name.trim(),
    username: input.username.trim(),
    status: input.status,
    supportGroup: input.supportGroup?.trim() || supportConfig.chatId,
    webhookPath: normalizeWebhookPath(id, input.webhookPath),
    latestSync: timestamp
  };

  if (!(await hasDatabase(env))) {
    return bot;
  }

  try {
    const token = input.token?.trim();
    const bound = token
      ? env.DB!
          .prepare(
            "UPDATE bots SET name = ?1, username = ?2, webhook_path = ?3, status = ?4, support_group = ?5, updated_at = ?6, token_masked = ?7, token_secret = ?8 WHERE id = ?9 AND tenant_id = ?10"
          )
          .bind(
            bot.name,
            bot.username,
            bot.webhookPath,
            bot.status,
            bot.supportGroup,
            timestamp,
            maskToken(token),
            token,
            id,
            currentTenant
          )
      : env.DB!
          .prepare(
            "UPDATE bots SET name = ?1, username = ?2, webhook_path = ?3, status = ?4, support_group = ?5, updated_at = ?6 WHERE id = ?7 AND tenant_id = ?8"
          )
          .bind(
            bot.name,
            bot.username,
            bot.webhookPath,
            bot.status,
            bot.supportGroup,
            timestamp,
            id,
            currentTenant
          );

    const result = await bound.run();
    if (!result.meta.rows_written) {
      throw new Error("Bot not found");
    }

    return bot;
  } catch (error) {
    if (isMissingTableError(error)) {
      return bot;
    }
    throw error;
  }
}

export async function getBotForWebhook(
  env: Env,
  webhookBotId: string
): Promise<BotRuntimeRecord | null> {
  const expectedPath = `/api/telegram/webhook/${webhookBotId}`;

  if (!(await hasDatabase(env))) {
    const supportConfig = await getSupportConfig(env);
    const seed =
      botSeed.find((item) => item.webhookPath === expectedPath || item.id === `bot-${webhookBotId}`) ??
      botSeed[0];
    return {
      ...seed,
      supportGroup: supportConfig.chatId || seed.supportGroup,
      tokenSecret: env.TELEGRAM_BOT_TOKEN
    };
  }

  try {
    const row = await env.DB!
      .prepare(
        "SELECT b.tenant_id AS tenantId, b.id, b.name, b.username, b.status, b.support_group AS supportGroup, b.webhook_path AS webhookPath, COALESCE(b.updated_at, b.created_at) AS latestSync, b.token_secret AS tokenSecret FROM bots b INNER JOIN tenants t ON t.id = b.tenant_id AND t.status = 'active' WHERE b.status = 'online' AND (b.webhook_path = ?1 OR b.id = ?2) ORDER BY COALESCE(b.updated_at, b.created_at) DESC LIMIT 1"
      )
      .bind(expectedPath, `bot-${webhookBotId}`)
      .first<BotRuntimeRecord>();

    if (row) {
      const supportConfig = await getSupportConfig(env, row.tenantId);
      return {
        ...row,
        supportGroup: supportConfig.chatId || row.supportGroup
      };
    }

    const seed = botSeed.find((item) => item.id === `bot-${webhookBotId}`) ?? botSeed[0];
    const supportConfig = await getSupportConfig(env);
    return {
      ...seed,
      supportGroup: supportConfig.chatId || seed.supportGroup,
      tokenSecret: env.TELEGRAM_BOT_TOKEN
    };
  } catch (error) {
    if (isMissingTokenSecretError(error)) {
      const row = await env.DB!
        .prepare(
          "SELECT b.tenant_id AS tenantId, b.id, b.name, b.username, b.status, b.support_group AS supportGroup, b.webhook_path AS webhookPath, COALESCE(b.updated_at, b.created_at) AS latestSync FROM bots b INNER JOIN tenants t ON t.id = b.tenant_id AND t.status = 'active' WHERE b.status = 'online' AND (b.webhook_path = ?1 OR b.id = ?2) ORDER BY COALESCE(b.updated_at, b.created_at) DESC LIMIT 1"
        )
        .bind(expectedPath, `bot-${webhookBotId}`)
        .first<BotRuntimeRecord>();

      if (!row) {
        return null;
      }

      const supportConfig = await getSupportConfig(env, row.tenantId);
      return {
        ...row,
        supportGroup: supportConfig.chatId || row.supportGroup,
        tokenSecret: env.TELEGRAM_BOT_TOKEN
      };
    }

    if (isMissingTableError(error)) {
      const seed = botSeed.find((item) => item.id === `bot-${webhookBotId}`) ?? botSeed[0];
      const supportConfig = await getSupportConfig(env);
      return {
        ...seed,
        supportGroup: supportConfig.chatId || seed.supportGroup,
        tokenSecret: env.TELEGRAM_BOT_TOKEN
      };
    }

    throw error;
  }
}

export async function getBotRuntimeById(env: Env, tenant: string, id: string): Promise<BotRuntimeRecord | null> {
  if (!(await hasDatabase(env))) {
    const seed = botSeed.find((item) => item.id === id) ?? null;
    return seed ? { ...seed, tokenSecret: env.TELEGRAM_BOT_TOKEN } : null;
  }

  try {
    const row = await env.DB!
      .prepare(
        "SELECT tenant_id AS tenantId, id, name, username, status, support_group AS supportGroup, webhook_path AS webhookPath, COALESCE(updated_at, created_at) AS latestSync, token_secret AS tokenSecret FROM bots WHERE tenant_id = ?1 AND id = ?2 LIMIT 1"
      )
      .bind(tenantId(tenant), id)
      .first<BotRuntimeRecord>();
    return row ?? null;
  } catch (error) {
    if (isMissingTokenSecretError(error)) {
      const row = await env.DB!
        .prepare(
          "SELECT tenant_id AS tenantId, id, name, username, status, support_group AS supportGroup, webhook_path AS webhookPath, COALESCE(updated_at, created_at) AS latestSync FROM bots WHERE tenant_id = ?1 AND id = ?2 LIMIT 1"
        )
        .bind(tenantId(tenant), id)
        .first<BotRuntimeRecord>();
      return row ? { ...row, tokenSecret: env.TELEGRAM_BOT_TOKEN } : null;
    }
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function deleteBot(env: Env, id: string, tenant?: string): Promise<{ id: string }> {
  if (!(await hasDatabase(env))) {
    return { id };
  }

  try {
    const currentTenant = tenantId(tenant);
    await env.DB!.batch([
      env.DB!.prepare("DELETE FROM message_logs WHERE bot_id = ?1 AND tenant_id = ?2").bind(id, currentTenant),
      env.DB!.prepare("DELETE FROM conversations WHERE bot_id = ?1 AND tenant_id = ?2").bind(id, currentTenant),
      env.DB!.prepare("DELETE FROM bot_customers WHERE bot_id = ?1 AND tenant_id = ?2").bind(id, currentTenant),
      env.DB!.prepare("DELETE FROM templates WHERE bot_id = ?1 AND tenant_id = ?2").bind(id, currentTenant),
      env.DB!.prepare("DELETE FROM bot_support_agents WHERE bot_id = ?1 AND tenant_id = ?2").bind(id, currentTenant),
      env.DB!.prepare("DELETE FROM bots WHERE id = ?1 AND tenant_id = ?2").bind(id, currentTenant)
    ]);
    return { id };
  } catch (error) {
    if (isMissingTableError(error)) {
      return { id };
    }
    throw error;
  }
}

export async function listRoutingRules(): Promise<RoutingRuleRecord[]> {
  return routingSeed;
}

export async function createTemplate(
  env: Env,
  input: TemplateInput,
  tenant?: string,
  bot?: string
): Promise<TemplateRecord> {
  const timestamp = nowTimestamp();
  const currentTenant = tenantId(tenant);
  const currentBot = botId(bot);
  const template = makeTemplate(makeId("tpl"), timestamp, input, currentBot);

  if (!(await hasDatabase(env))) {
    return template;
  }

  try {
    const statements = [];
    if (template.isDefault) {
      statements.push(
        env.DB!
          .prepare("UPDATE templates SET is_default = 0 WHERE tenant_id = ?1 AND scene = ?2 AND COALESCE(bot_id, '') = ?3")
          .bind(currentTenant, template.scene, currentBot)
      );
    }
    statements.push(
      env.DB!
        .prepare(
          "INSERT INTO templates(tenant_id, id, bot_id, name, scene, content, image_url, parse_mode, is_default, buttons, timezone, work_start, work_end, enabled, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"
        )
        .bind(
          currentTenant,
          template.id,
          currentBot,
          template.name,
          template.scene,
          template.content,
          template.imageUrl,
          template.parseMode,
          template.isDefault ? 1 : 0,
          JSON.stringify(template.buttons),
          template.timezone,
          template.workStart,
          template.workEnd,
          template.enabled ? 1 : 0,
          timestamp
        )
    );
    await env.DB!.batch(statements);

    return template;
  } catch (error) {
    if (isMissingTableError(error)) {
      return template;
    }
    throw error;
  }
}

export async function updateTemplate(
  env: Env,
  id: string,
  input: TemplateInput,
  tenant?: string,
  bot?: string
): Promise<TemplateRecord> {
  const timestamp = nowTimestamp();
  const currentTenant = tenantId(tenant);
  const currentBot = botId(bot);
  const template = makeTemplate(id, timestamp, input, currentBot);

  if (!(await hasDatabase(env))) {
    return template;
  }

  try {
    const statements = [];
    if (template.isDefault) {
      statements.push(
        env.DB!
          .prepare("UPDATE templates SET is_default = 0 WHERE tenant_id = ?1 AND scene = ?2 AND id <> ?3 AND COALESCE(bot_id, '') = ?4")
          .bind(currentTenant, template.scene, id, currentBot)
      );
    }
    statements.push(
      env.DB!
        .prepare(
          "UPDATE templates SET name = ?1, scene = ?2, content = ?3, image_url = ?4, parse_mode = ?5, is_default = ?6, buttons = ?7, timezone = ?8, work_start = ?9, work_end = ?10, enabled = ?11, updated_at = ?12, bot_id = ?15 WHERE id = ?13 AND tenant_id = ?14 AND COALESCE(bot_id, '') = ?15"
        )
        .bind(
          template.name,
          template.scene,
          template.content,
          template.imageUrl,
          template.parseMode,
          template.isDefault ? 1 : 0,
          JSON.stringify(template.buttons),
          template.timezone,
          template.workStart,
          template.workEnd,
          template.enabled ? 1 : 0,
          timestamp,
          id,
          currentTenant,
          currentBot
        )
    );

    const result = await env.DB!.batch(statements);
    const last = result[result.length - 1];

    if (!last.meta.rows_written) {
      throw new Error("Template not found");
    }

    return template;
  } catch (error) {
    if (isMissingTableError(error)) {
      return template;
    }
    throw error;
  }
}

export async function deleteTemplate(env: Env, id: string, tenant?: string, bot?: string): Promise<{ id: string }> {
  if (!(await hasDatabase(env))) {
    return { id };
  }

  try {
    await env.DB!
      .prepare("DELETE FROM templates WHERE id = ?1 AND tenant_id = ?2 AND COALESCE(bot_id, '') = ?3")
      .bind(id, tenantId(tenant), botId(bot))
      .run();
    return { id };
  } catch (error) {
    if (isMissingTableError(error)) {
      return { id };
    }
    throw error;
  }
}

export async function listTemplates(env: Env, tenant?: string, bot?: string): Promise<TemplateRecord[]> {
  if (!(await hasDatabase(env))) {
    return templateSeed;
  }

  try {
    const currentTenant = tenantId(tenant);
    const currentBot = botId(bot);
    if (currentBot) {
      const botResult = await env.DB!
        .prepare(
          "SELECT id, bot_id AS botId, name, scene, content, image_url AS imageUrl, parse_mode AS parseMode, is_default AS isDefault, buttons, timezone, work_start AS workStart, work_end AS workEnd, enabled, updated_at AS updatedAt FROM templates WHERE tenant_id = ?1 AND COALESCE(bot_id, '') = ?2 ORDER BY updated_at DESC"
        )
        .bind(currentTenant, currentBot)
        .all<TemplateRow>();

      if (botResult.results.length) {
        return botResult.results.map(mapTemplateRow);
      }
    }

    const result = await env.DB!
      .prepare(
        "SELECT id, bot_id AS botId, name, scene, content, image_url AS imageUrl, parse_mode AS parseMode, is_default AS isDefault, buttons, timezone, work_start AS workStart, work_end AS workEnd, enabled, updated_at AS updatedAt FROM templates WHERE tenant_id = ?1 AND COALESCE(bot_id, '') = '' ORDER BY updated_at DESC"
      )
      .bind(currentTenant)
      .all<TemplateRow>();

    return result.results.length ? result.results.map(mapTemplateRow) : currentTenant === DEFAULT_TENANT_ID ? templateSeed : [];
  } catch (error) {
    if (isMissingTableError(error)) {
      return templateSeed;
    }
    throw error;
  }
}

async function seedBotTemplatesFromGlobal(env: Env, tenant: string, bot: string) {
  try {
    const templates = await listTemplates(env, tenant);
    const source = templates.length ? templates : templateSeed;
    for (const template of source) {
      await createTemplate(
        env,
        {
          name: template.name,
          scene: template.scene,
          content: template.content,
          imageUrl: template.imageUrl ?? "",
          parseMode: template.parseMode,
          isDefault: template.isDefault,
          buttons: template.buttons,
          timezone: template.timezone,
          workStart: template.workStart,
          workEnd: template.workEnd,
          enabled: template.enabled
        },
        tenant,
        bot
      );
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }
}

export async function upsertBotCustomer(
  env: Env,
  tenant: string,
  input: BotCustomerInput
): Promise<BotCustomerRecord> {
  const timestamp = nowTimestamp();
  const currentTenant = tenantId(tenant);
  const displayName =
    input.displayName?.trim() ||
    [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(" ") ||
    input.username?.trim() ||
    input.chatId;

  const fallback: BotCustomerRecord = {
    id: makeId("cust"),
    botId: input.botId,
    chatId: input.chatId,
    username: input.username?.trim() ?? "",
    displayName,
    firstName: input.firstName?.trim() ?? "",
    lastName: input.lastName?.trim() ?? "",
    languageCode: input.languageCode?.trim() ?? "",
    status: "active",
    source: input.source?.trim() || "message",
    messageCount: 1,
    lastMessage: truncate(input.lastMessage, 500),
    firstSeenAt: timestamp,
    lastSeenAt: timestamp
  };

  if (!(await hasDatabase(env))) {
    return fallback;
  }

  try {
    await env.DB!
      .prepare(
        "INSERT INTO bot_customers(id, tenant_id, bot_id, chat_id, username, display_name, first_name, last_name, language_code, status, source, message_count, last_message, first_seen_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'active', ?10, 1, ?11, ?12, ?12) ON CONFLICT(tenant_id, bot_id, chat_id) DO UPDATE SET username = excluded.username, display_name = excluded.display_name, first_name = excluded.first_name, last_name = excluded.last_name, language_code = excluded.language_code, status = CASE WHEN bot_customers.status = 'blocked' THEN 'blocked' ELSE 'active' END, source = excluded.source, message_count = bot_customers.message_count + 1, last_message = excluded.last_message, last_seen_at = excluded.last_seen_at"
      )
      .bind(
        fallback.id,
        currentTenant,
        input.botId,
        input.chatId,
        fallback.username || null,
        fallback.displayName,
        fallback.firstName || null,
        fallback.lastName || null,
        fallback.languageCode || null,
        fallback.source,
        fallback.lastMessage || null,
        timestamp
      )
      .run();

    const row = await env.DB!
      .prepare(
        "SELECT id, bot_id AS botId, chat_id AS chatId, username, display_name AS displayName, first_name AS firstName, last_name AS lastName, language_code AS languageCode, status, source, message_count AS messageCount, last_message AS lastMessage, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt FROM bot_customers WHERE tenant_id = ?1 AND bot_id = ?2 AND chat_id = ?3 LIMIT 1"
      )
      .bind(currentTenant, input.botId, input.chatId)
      .first<BotCustomerRow>();
    return row ? mapBotCustomerRow(row) : fallback;
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallback;
    }
    throw error;
  }
}

export async function listBotCustomers(
  env: Env,
  tenant: string,
  bot: string,
  limit = 200,
  keyword = "",
  status = "active"
): Promise<BotCustomerRecord[]> {
  if (!(await hasDatabase(env))) {
    return [];
  }

  try {
    const currentTenant = tenantId(tenant);
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const text = keyword.trim();
    const statusFilter = status === "blocked" ? "blocked" : "active";
    const result = text
      ? await env.DB!
          .prepare(
            "SELECT id, bot_id AS botId, chat_id AS chatId, username, display_name AS displayName, first_name AS firstName, last_name AS lastName, language_code AS languageCode, status, source, message_count AS messageCount, last_message AS lastMessage, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt FROM bot_customers WHERE tenant_id = ?1 AND bot_id = ?2 AND status = ?3 AND (chat_id LIKE ?4 OR username LIKE ?4 OR display_name LIKE ?4) ORDER BY last_seen_at DESC LIMIT ?5"
          )
          .bind(currentTenant, bot, statusFilter, `%${text}%`, safeLimit)
          .all<BotCustomerRow>()
      : await env.DB!
          .prepare(
            "SELECT id, bot_id AS botId, chat_id AS chatId, username, display_name AS displayName, first_name AS firstName, last_name AS lastName, language_code AS languageCode, status, source, message_count AS messageCount, last_message AS lastMessage, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt FROM bot_customers WHERE tenant_id = ?1 AND bot_id = ?2 AND status = ?3 ORDER BY last_seen_at DESC LIMIT ?4"
          )
          .bind(currentTenant, bot, statusFilter, safeLimit)
          .all<BotCustomerRow>();

    return result.results.map(mapBotCustomerRow);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function updateBotCustomerStatus(
  env: Env,
  tenant: string,
  bot: string,
  chatId: string,
  status: BotCustomerRecord["status"]
) {
  if (!(await hasDatabase(env))) {
    return;
  }

  try {
    await env.DB!
      .prepare("UPDATE bot_customers SET status = ?1, last_seen_at = ?2 WHERE tenant_id = ?3 AND bot_id = ?4 AND chat_id = ?5")
      .bind(status, nowTimestamp(), tenantId(tenant), bot, chatId)
      .run();
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }
}

type ConversationRow = {
  id: string;
  tenantId: string;
  botId: string;
  customerChatId: string;
  customerUsername?: string | null;
  customerName?: string | null;
  status: "open" | "closed";
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

function mapConversationRow(row: ConversationRow): ConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    botId: row.botId,
    customerChatId: row.customerChatId,
    customerUsername: row.customerUsername ?? "",
    customerName: row.customerName ?? "",
    status: row.status,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function upsertConversation(
  env: Env,
  input: ConversationInput
): Promise<ConversationRecord> {
  const timestamp = nowTimestamp();
  const currentTenantId = tenantId(input.tenantId);
  const fallback: ConversationRecord = {
    id: makeId("conv"),
    tenantId: currentTenantId,
    botId: input.botId,
    customerChatId: input.customerChatId,
    customerUsername: input.customerUsername ?? "",
    customerName: input.customerName ?? "",
    status: "open",
    lastMessageAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (!(await hasDatabase(env))) {
    return fallback;
  }

  try {
    const existing = await env.DB!
      .prepare(
        "SELECT id FROM conversations WHERE tenant_id = ?1 AND bot_id = ?2 AND customer_chat_id = ?3 LIMIT 1"
      )
      .bind(currentTenantId, input.botId, input.customerChatId)
      .first<{ id: string }>();
    const id = existing?.id ?? fallback.id;

    await env.DB!
      .prepare(
        "INSERT INTO conversations(id, tenant_id, bot_id, customer_chat_id, customer_username, customer_name, status, last_message_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7, ?7, ?7) ON CONFLICT(tenant_id, bot_id, customer_chat_id) DO UPDATE SET customer_username = COALESCE(excluded.customer_username, conversations.customer_username), customer_name = COALESCE(excluded.customer_name, conversations.customer_name), status = 'open', last_message_at = excluded.last_message_at, updated_at = excluded.updated_at"
      )
      .bind(
        id,
        currentTenantId,
        input.botId,
        input.customerChatId,
        input.customerUsername?.trim() || null,
        input.customerName?.trim() || null,
        timestamp
      )
      .run();

    const row = await env.DB!
      .prepare(
        "SELECT id, tenant_id AS tenantId, bot_id AS botId, customer_chat_id AS customerChatId, customer_username AS customerUsername, customer_name AS customerName, status, last_message_at AS lastMessageAt, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE tenant_id = ?1 AND bot_id = ?2 AND customer_chat_id = ?3 LIMIT 1"
      )
      .bind(currentTenantId, input.botId, input.customerChatId)
      .first<ConversationRow>();

    return row ? mapConversationRow(row) : { ...fallback, id };
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallback;
    }
    throw error;
  }
}

type MessageLogRow = {
  id: string;
  tenantId: string;
  tenantName?: string | null;
  conversationId?: string | null;
  botId: string;
  direction: MessageLogRecord["direction"];
  messageType: MessageLogRecord["messageType"];
  scene?: string | null;
  customerChatId?: string | null;
  supportChatId?: string | null;
  telegramMessageId?: string | null;
  relatedMessageId?: string | null;
  content?: string | null;
  mediaFileId?: string | null;
  mediaCaption?: string | null;
  status: MessageLogRecord["status"];
  error?: string | null;
  createdAt: string;
};

function mapMessageLogRow(row: MessageLogRow): MessageLogRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenantName ?? "",
    conversationId: row.conversationId ?? "",
    botId: row.botId,
    direction: row.direction,
    messageType: row.messageType,
    scene: row.scene ?? "",
    customerChatId: row.customerChatId ?? "",
    supportChatId: row.supportChatId ?? "",
    telegramMessageId: row.telegramMessageId ?? "",
    relatedMessageId: row.relatedMessageId ?? "",
    content: row.content ?? "",
    mediaFileId: row.mediaFileId ?? "",
    mediaCaption: row.mediaCaption ?? "",
    status: row.status,
    error: row.error ?? "",
    createdAt: row.createdAt
  };
}

export async function createMessageLog(
  env: Env,
  input: MessageLogInput
): Promise<MessageLogRecord> {
  const timestamp = nowTimestamp();
  const log: MessageLogRecord = {
    id: makeId("log"),
    tenantId: tenantId(input.tenantId),
    conversationId: input.conversationId ?? "",
    botId: input.botId,
    direction: input.direction,
    messageType: input.messageType,
    scene: input.scene ?? "",
    customerChatId: input.customerChatId ?? "",
    supportChatId: input.supportChatId ?? "",
    telegramMessageId: input.telegramMessageId ?? "",
    relatedMessageId: input.relatedMessageId ?? "",
    content: truncate(input.content),
    mediaFileId: input.mediaFileId ?? "",
    mediaCaption: truncate(input.mediaCaption),
    status: input.status,
    error: truncate(input.error, 1000),
    createdAt: timestamp
  };

  if (!(await hasDatabase(env))) {
    return log;
  }

  try {
    await env.DB!
      .prepare(
        "INSERT INTO message_logs(id, tenant_id, conversation_id, bot_id, direction, message_type, scene, customer_chat_id, support_chat_id, telegram_message_id, related_message_id, content, media_file_id, media_caption, status, error, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)"
      )
      .bind(
        log.id,
        log.tenantId,
        log.conversationId || null,
        log.botId,
        log.direction,
        log.messageType,
        log.scene || null,
        log.customerChatId || null,
        log.supportChatId || null,
        log.telegramMessageId || null,
        log.relatedMessageId || null,
        log.content || null,
        log.mediaFileId || null,
        log.mediaCaption || null,
        log.status,
        log.error || null,
        timestamp
      )
      .run();

    return log;
  } catch (error) {
    if (isMissingTableError(error)) {
      return log;
    }
    throw error;
  }
}

export async function listMessageLogs(
  env: Env,
  limit = 100,
  tenant?: string,
  includeAllTenants = false
): Promise<MessageLogRecord[]> {
  if (!(await hasDatabase(env))) {
    return [];
  }

  try {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    if (includeAllTenants) {
      const result = await env.DB!
        .prepare(
          "SELECT m.id, m.tenant_id AS tenantId, t.name AS tenantName, m.conversation_id AS conversationId, m.bot_id AS botId, m.direction, m.message_type AS messageType, m.scene, m.customer_chat_id AS customerChatId, m.support_chat_id AS supportChatId, m.telegram_message_id AS telegramMessageId, m.related_message_id AS relatedMessageId, m.content, m.media_file_id AS mediaFileId, m.media_caption AS mediaCaption, m.status, m.error, m.created_at AS createdAt FROM message_logs m LEFT JOIN tenants t ON t.id = m.tenant_id ORDER BY m.created_at DESC LIMIT ?1"
        )
        .bind(safeLimit)
        .all<MessageLogRow>();

      return result.results.map(mapMessageLogRow);
    }

    const result = await env.DB!
      .prepare(
        "SELECT m.id, m.tenant_id AS tenantId, t.name AS tenantName, m.conversation_id AS conversationId, m.bot_id AS botId, m.direction, m.message_type AS messageType, m.scene, m.customer_chat_id AS customerChatId, m.support_chat_id AS supportChatId, m.telegram_message_id AS telegramMessageId, m.related_message_id AS relatedMessageId, m.content, m.media_file_id AS mediaFileId, m.media_caption AS mediaCaption, m.status, m.error, m.created_at AS createdAt FROM message_logs m LEFT JOIN tenants t ON t.id = m.tenant_id WHERE m.tenant_id = ?1 ORDER BY m.created_at DESC LIMIT ?2"
      )
      .bind(tenantId(tenant), safeLimit)
      .all<MessageLogRow>();

    return result.results.map(mapMessageLogRow);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
}

async function countRows(env: Env, sql: string, ...bindings: Array<string | number>) {
  const row = await env.DB!.prepare(sql).bind(...bindings).first<{ value: number }>();
  return Number(row?.value ?? 0);
}

export async function getOverviewStats(
  env: Env,
  tenant?: string,
  includeAllTenants = false
): Promise<OverviewStatsRecord> {
  const empty: OverviewStatsRecord = {
    botCount: 0,
    activeConversations: 0,
    todayMessages: 0,
    todayReplies: 0,
    offlineReplies: 0,
    queueFailures: 0
  };

  if (!(await hasDatabase(env))) {
    return { ...empty, botCount: botSeed.length };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStart = today.toISOString().slice(0, 19).replace("T", " ");
  const currentTenant = tenantId(tenant);

  try {
    if (includeAllTenants) {
      return {
        botCount: await countRows(env, "SELECT COUNT(*) AS value FROM bots"),
        activeConversations: await countRows(
          env,
          "SELECT COUNT(*) AS value FROM conversations WHERE status = 'open'"
        ),
        todayMessages: await countRows(
          env,
          "SELECT COUNT(*) AS value FROM message_logs WHERE direction = 'inbound' AND created_at >= ?1",
          todayStart
        ),
        todayReplies: await countRows(
          env,
          "SELECT COUNT(*) AS value FROM message_logs WHERE direction = 'outbound' AND created_at >= ?1",
          todayStart
        ),
        offlineReplies: await countRows(
          env,
          "SELECT COUNT(*) AS value FROM message_logs WHERE scene = 'off-hours' AND created_at >= ?1",
          todayStart
        ),
        queueFailures: await countRows(
          env,
          "SELECT COUNT(*) AS value FROM message_logs WHERE status = 'failed' AND created_at >= ?1",
          todayStart
        )
      };
    }

    return {
      botCount: await countRows(
        env,
        "SELECT COUNT(*) AS value FROM bots WHERE tenant_id = ?1",
        currentTenant
      ),
      activeConversations: await countRows(
        env,
        "SELECT COUNT(*) AS value FROM conversations WHERE tenant_id = ?1 AND status = 'open'",
        currentTenant
      ),
      todayMessages: await countRows(
        env,
        "SELECT COUNT(*) AS value FROM message_logs WHERE tenant_id = ?1 AND direction = 'inbound' AND created_at >= ?2",
        currentTenant,
        todayStart
      ),
      todayReplies: await countRows(
        env,
        "SELECT COUNT(*) AS value FROM message_logs WHERE tenant_id = ?1 AND direction = 'outbound' AND created_at >= ?2",
        currentTenant,
        todayStart
      ),
      offlineReplies: await countRows(
        env,
        "SELECT COUNT(*) AS value FROM message_logs WHERE tenant_id = ?1 AND scene = 'off-hours' AND created_at >= ?2",
        currentTenant,
        todayStart
      ),
      queueFailures: await countRows(
        env,
        "SELECT COUNT(*) AS value FROM message_logs WHERE tenant_id = ?1 AND status = 'failed' AND created_at >= ?2",
        currentTenant,
        todayStart
      )
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      const bots = await listBots(env, tenant, includeAllTenants);
      return { ...empty, botCount: bots.length };
    }
    throw error;
  }
}

export async function getSettings(env: Env, tenant?: string): Promise<SystemSettingsRecord> {
  if (!(await hasDatabase(env))) {
    return settingsSeed;
  }

  try {
    const map = await readSettingsMap(env, tenant);
    if (!Object.keys(map).length) {
      return settingsSeed;
    }
    return {
      defaultLocale: map.defaultLocale ?? settingsSeed.defaultLocale,
      retentionDays: map.retentionDays ?? settingsSeed.retentionDays,
      uploadPolicy: map.uploadPolicy ?? settingsSeed.uploadPolicy,
      queueStrategy: map.queueStrategy ?? settingsSeed.queueStrategy,
      accessMode: map.accessMode ?? settingsSeed.accessMode,
      timezone: map.timezone ?? settingsSeed.timezone,
      workStart: map.workStart ?? settingsSeed.workStart,
      workEnd: map.workEnd ?? settingsSeed.workEnd
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return settingsSeed;
    }
    throw error;
  }
}

export async function saveSettings(
  env: Env,
  payload: SystemSettingsRecord,
  tenant?: string
): Promise<SystemSettingsRecord> {
  if (!(await hasDatabase(env))) {
    return payload;
  }

  try {
    const timestamp = new Date().toISOString();
    const statements = Object.entries(payload).map(([key, value]) =>
      env.DB!
        .prepare(
          "INSERT INTO tenant_settings(tenant_id, key, value, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
        )
        .bind(tenantId(tenant), key, JSON.stringify(value), timestamp)
    );
    await env.DB!.batch(statements);

    return payload;
  } catch (error) {
    if (isMissingTableError(error)) {
      return payload;
    }
    throw error;
  }
}
