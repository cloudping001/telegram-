import type {
  AuditLog,
  AuthSession,
  BotConfig,
  BotConfigInput,
  BotCustomer,
  BotSupportAgent,
  BotSupportAgentInput,
  BroadcastInput,
  BroadcastResult,
  MessageLog,
  MessageTemplate,
  MessageTemplateInput,
  OverviewStats,
  RegisterPayload,
  RoutingRule,
  SupportConfig,
  SystemSettings,
  TenantInput,
  TenantSummary,
  TenantUser,
  TenantUserInput
} from "./types";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "telegram_admin_token";
const TENANT_KEY = "telegram_admin_selected_tenant";
let onUnauthorized: (() => void) | null = null;

export type LoginPayload = {
  username: string;
  password: string;
};

type AuthResult = {
  token: string;
  session: AuthSession;
};

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

export const getAuthToken = () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY));

export const setAuthToken = (token: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
  }
};

export const clearAuthToken = () => setAuthToken(null);

export const isAuthenticated = () => Boolean(getAuthToken());

export const getSelectedTenantId = () =>
  typeof window === "undefined" ? null : localStorage.getItem(TENANT_KEY);

export const setSelectedTenantId = (tenantId: string | null) => {
  if (typeof window === "undefined") {
    return;
  }
  if (tenantId) {
    localStorage.setItem(TENANT_KEY, tenantId);
  } else {
    localStorage.removeItem(TENANT_KEY);
  }
};

function authHeaders(token: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json"
  });

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const selectedTenant = getSelectedTenantId();
  if (selectedTenant) {
    headers.set("X-Tenant-Id", selectedTenant);
  }

  return headers;
}

function handleUnauthorized() {
  clearAuthToken();
  if (onUnauthorized) {
    onUnauthorized();
  }
}

async function request<T>(path: string, init: RequestInit = {}, skipAuth = false): Promise<T> {
  const token = skipAuth ? null : getAuthToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...Object.fromEntries(authHeaders(token).entries()),
      ...(init.headers ?? {})
    }
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("unauthorized");
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  isAuthenticated,
  getSelectedTenantId,
  setSelectedTenantId,
  setUnauthorizedHandler,
  login: async (payload: LoginPayload) => {
    const result = await request<AuthResult>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      true
    );
    setAuthToken(result.token);
    return result;
  },
  register: async (payload: RegisterPayload) => {
    const result = await request<AuthResult>(
      "/api/auth/register",
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      true
    );
    setAuthToken(result.token);
    return result;
  },
  logout: async () => {
    await request<{ ok: true }>("/api/auth/logout", { method: "POST" });
    clearAuthToken();
  },
  me: () => request<AuthSession>("/api/auth/me"),
  platformTenants: () => request<TenantSummary[]>("/api/platform/tenants"),
  updateTenant: (id: string, payload: TenantInput) =>
    request<TenantSummary>(`/api/platform/tenants/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  createPlatformUser: (payload: RegisterPayload) =>
    request<TenantSummary>("/api/platform/tenants", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  resetPlatformUserPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/platform/tenants/${id}/password`, {
      method: "PUT",
      body: JSON.stringify({ password })
    }),
  deletePlatformUser: (id: string) =>
    request<{ id: string }>(`/api/platform/tenants/${id}`, {
      method: "DELETE"
    }),
  platformTenantUsers: (tenantId: string) =>
    request<TenantUser[]>(`/api/platform/tenants/${tenantId}/users`),
  changePassword: (payload: { username?: string; currentPassword: string; newPassword: string }) =>
    request<{ ok: true; session?: AuthSession }>("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  users: () => request<TenantUser[]>("/api/users"),
  createUser: (payload: TenantUserInput) =>
    request<TenantUser>("/api/users", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateUser: (id: string, payload: TenantUserInput) =>
    request<TenantUser>(`/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteUser: (id: string) =>
    request<{ id: string }>(`/api/users/${id}`, {
      method: "DELETE"
    }),
  overview: () => request<OverviewStats>("/api/overview"),
  messageLogs: (limit = 100) => request<MessageLog[]>(`/api/message-logs?limit=${limit}`),
  auditLogs: (limit = 100) => request<AuditLog[]>(`/api/audit-logs?limit=${limit}`),
  bots: () => request<BotConfig[]>("/api/bots"),
  createBot: (payload: BotConfigInput) =>
    request<BotConfig>("/api/bots", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateBot: (id: string, payload: BotConfigInput) =>
    request<BotConfig>(`/api/bots/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteBot: (id: string) =>
    request<{ id: string }>(`/api/bots/${id}`, {
      method: "DELETE"
    }),
  botSupportAgents: (id: string) => request<BotSupportAgent[]>(`/api/bots/${id}/support-agents`),
  saveBotSupportAgents: (id: string, payload: BotSupportAgentInput[]) =>
    request<BotSupportAgent[]>(`/api/bots/${id}/support-agents`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  botTemplates: (id: string) => request<MessageTemplate[]>(`/api/bots/${id}/templates`),
  createBotTemplate: (id: string, payload: MessageTemplateInput) =>
    request<MessageTemplate>(`/api/bots/${id}/templates`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateBotTemplate: (id: string, templateId: string, payload: MessageTemplateInput) =>
    request<MessageTemplate>(`/api/bots/${id}/templates/${templateId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteBotTemplate: (id: string, templateId: string) =>
    request<{ id: string }>(`/api/bots/${id}/templates/${templateId}`, {
      method: "DELETE"
    }),
  botCustomers: (id: string, params: { limit?: number; q?: string; status?: "active" | "blocked" } = {}) => {
    const search = new URLSearchParams();
    search.set("limit", String(params.limit ?? 200));
    if (params.q) {
      search.set("q", params.q);
    }
    if (params.status) {
      search.set("status", params.status);
    }
    return request<BotCustomer[]>(`/api/bots/${id}/customers?${search.toString()}`);
  },
  broadcastToBotCustomers: (id: string, payload: BroadcastInput) =>
    request<BroadcastResult>(`/api/bots/${id}/broadcast`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  routingRules: () => request<RoutingRule[]>("/api/routing-rules"),
  supportConfig: () => request<SupportConfig>("/api/support-config"),
  saveSupportConfig: (payload: SupportConfig) =>
    request<SupportConfig>("/api/support-config", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  templates: () => request<MessageTemplate[]>("/api/templates"),
  createTemplate: (payload: MessageTemplateInput) =>
    request<MessageTemplate>("/api/templates", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateTemplate: (id: string, payload: MessageTemplateInput) =>
    request<MessageTemplate>(`/api/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteTemplate: (id: string) =>
    request<{ id: string }>(`/api/templates/${id}`, {
      method: "DELETE"
    }),
  settings: () => request<SystemSettings>("/api/settings/system"),
  saveSettings: (payload: SystemSettings) =>
    request<SystemSettings>("/api/settings/system", {
      method: "PUT",
      body: JSON.stringify(payload)
    })
};
