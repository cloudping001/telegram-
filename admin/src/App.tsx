import {
  ApiOutlined,
  AppstoreOutlined,
  AuditOutlined,
  DashboardOutlined,
  FileTextOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PoweroffOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Card,
  ConfigProvider,
  Drawer,
  Grid,
  Layout,
  Menu,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import type { AuthSession } from "./types";

const AccountPage = lazy(() => import("./pages/AccountPage"));
const AuditLogsPage = lazy(() => import("./pages/AuditLogsPage"));
const BotConfigPage = lazy(() => import("./pages/BotConfigPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const MessageLogsPage = lazy(() => import("./pages/MessageLogsPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const SystemSettingsPage = lazy(() => import("./pages/SystemSettingsPage"));
const TenantManagementPage = lazy(() => import("./pages/TenantManagementPage"));

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

const baseMenuItems = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "仪表盘" },
  { key: "/bots", icon: <ApiOutlined />, label: "机器人配置" },
  { key: "/messages", icon: <FileTextOutlined />, label: "消息记录" },
  { key: "/audit", icon: <AuditOutlined />, label: "审计日志" },
  { key: "/account", icon: <UserOutlined />, label: "我的账户" },
  { key: "/system", icon: <SettingOutlined />, label: "系统配置" }
];

const platformMenuItem = { key: "/tenants", icon: <TeamOutlined />, label: "用户管理" };
const userMenuItems = baseMenuItems.filter((item) => item.key !== "/system");

function requireAuth(node: JSX.Element) {
  return api.isAuthenticated() ? node : <Navigate to="/login" replace />;
}

function PageFallback() {
  return (
    <div className="route-loading">
      <Spin />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isDesktop = Boolean(screens.md);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      navigate("/login", { replace: true });
    });

    if ((location.pathname === "/login" || location.pathname === "/register") && api.isAuthenticated()) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (api.isAuthenticated() && location.pathname !== "/login" && location.pathname !== "/register") {
      setSessionLoading(true);
      api
        .me()
        .then(setSession)
        .catch(() => null)
        .finally(() => setSessionLoading(false));
    } else {
      setSessionLoading(false);
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (isDesktop) {
      setMobileMenuOpen(false);
    }
  }, [isDesktop]);

  const menuItems = useMemo(() => {
    return session?.isPlatformAdmin ? [baseMenuItems[0], platformMenuItem, ...baseMenuItems.slice(1)] : userMenuItems;
  }, [session?.isPlatformAdmin]);

  const selectedKey = menuItems.some((item) => item.key === location.pathname) ? location.pathname : "/dashboard";
  const pageTitle = useMemo(() => {
    return menuItems.find((item) => item.key === selectedKey)?.label ?? "后台管理";
  }, [menuItems, selectedKey]);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // continue logout flow
    }
    navigate("/login", { replace: true });
  };

  const selectedUserScope = api.getSelectedTenantId();
  const accountScopeLabel =
    session?.isPlatformAdmin && selectedUserScope
      ? "正在代管用户"
      : session?.isPlatformAdmin
        ? "平台管理员"
        : session?.username;

  const handleMenuClick = (key: string) => {
    navigate(key);
    setMobileMenuOpen(false);
  };

  const SidebarContent = ({ compact = false }: { compact?: boolean }) => (
    <div className="sider-inner">
      <div className={compact ? "brand-block compact" : "brand-block"}>
        <div className="brand-icon">
          <AppstoreOutlined />
        </div>
        {!compact ? (
          <div>
            <Typography.Title level={4} className="brand-title">
              Telegram 后台
            </Typography.Title>
            <Typography.Text className="brand-subtitle">Cloudflare 托管控制台</Typography.Text>
          </div>
        ) : null}
      </div>

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => handleMenuClick(String(key))}
        className="app-menu"
      />

      {!compact ? (
        <Card className="status-card" variant="borderless">
          <Space direction="vertical" size={10}>
            <Tag color={session?.isPlatformAdmin ? "gold" : "blue"} className="status-tag">
              {session?.isPlatformAdmin ? "平台管理员" : "注册用户"}
            </Tag>
            <Typography.Text className="status-title">当前身份</Typography.Text>
            <Typography.Paragraph className="status-copy">{accountScopeLabel || "-"}</Typography.Paragraph>
            {session?.isPlatformAdmin && selectedUserScope ? (
              <Button
                size="small"
                onClick={() => {
                  api.setSelectedTenantId(null);
                  window.location.href = "/tenants";
                }}
              >
                退出代管
              </Button>
            ) : null}
          </Space>
        </Card>
      ) : null}
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#2a78f6",
          borderRadius: 14,
          colorBgLayout: "#eef3f7",
          fontFamily:
            '"Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", sans-serif'
        }
      }}
    >
      <Suspense
        fallback={
          <div className="loading-shell">
            <Spin size="large" />
          </div>
        }
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/*"
            element={requireAuth(
              sessionLoading && !session ? (
                <div className="loading-shell">
                  <Spin size="large" />
                </div>
              ) : (
              <Layout className="app-shell">
                {isDesktop ? (
                  <Sider
                    width={272}
                    collapsedWidth={88}
                    collapsed={collapsed}
                    className="app-sider"
                    trigger={null}
                  >
                    <SidebarContent compact={collapsed} />
                  </Sider>
                ) : null}

                <Drawer
                  title={null}
                  placement="left"
                  open={!isDesktop && mobileMenuOpen}
                  onClose={() => setMobileMenuOpen(false)}
                  width={288}
                  rootClassName="mobile-menu-drawer-root"
                  className="mobile-menu-drawer"
                  styles={{
                    content: { background: "linear-gradient(180deg, #145c58 0%, #164d4a 100%)" },
                    body: { padding: 0, background: "linear-gradient(180deg, #145c58 0%, #164d4a 100%)" }
                  }}
                >
                  <SidebarContent />
                </Drawer>

                <Layout className="main-layout">
                  <Header className="app-header">
                    <Space align="center" size={12} className="header-left">
                      {isDesktop ? (
                        <Button
                          className="sidebar-toggle"
                          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                          onClick={() => setCollapsed((value) => !value)}
                        />
                      ) : (
                        <Button
                          className="sidebar-toggle"
                          icon={<MenuOutlined />}
                          onClick={() => setMobileMenuOpen(true)}
                        >
                          菜单
                        </Button>
                      )}
                      <div className="header-title-block">
                        <Typography.Text className="header-eyebrow">Telegram 中转服务</Typography.Text>
                        <Typography.Title level={2} className="header-title">
                          {pageTitle}
                        </Typography.Title>
                      </div>
                    </Space>
                    <Space size={12} className="header-actions">
                      <Tag color="processing" className="header-tag">
                        Pages + Workers
                      </Tag>
                      <Button type="default" icon={<PoweroffOutlined />} onClick={logout}>
                        退出
                      </Button>
                      <Avatar size={42}>CF</Avatar>
                    </Space>
                  </Header>

                  <Content className="app-content">
                    <Suspense fallback={<PageFallback />}>
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/tenants" element={<TenantManagementPage />} />
                        <Route path="/dashboard" element={<DashboardPage isPlatformAdmin={Boolean(session?.isPlatformAdmin)} />} />
                        <Route path="/bots" element={<BotConfigPage isPlatformAdmin={Boolean(session?.isPlatformAdmin)} />} />
                        <Route path="/messages" element={<MessageLogsPage isPlatformAdmin={Boolean(session?.isPlatformAdmin)} />} />
                        <Route path="/audit" element={<AuditLogsPage isPlatformAdmin={Boolean(session?.isPlatformAdmin)} />} />
                        <Route path="/account" element={<AccountPage />} />
                        <Route
                          path="/system"
                          element={
                            session?.isPlatformAdmin ? <SystemSettingsPage /> : <Navigate to="/dashboard" replace />
                          }
                        />
                      </Routes>
                    </Suspense>
                  </Content>
                  <footer className="app-footer">
                    本系统由TG:@yanhuacloud赞助开源，购买阿里云腾讯云，点击前往
                    <a href="https://www.juhecloud.online/" target="_blank" rel="noreferrer">
                      聚合云平台
                    </a>
                  </footer>
                </Layout>
              </Layout>
              )
            )}
          />
        </Routes>
      </Suspense>
    </ConfigProvider>
  );
}
