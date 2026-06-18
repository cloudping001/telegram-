import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Space, Table, Tabs, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { AuditLog } from "../types";

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "auth.password.update": "修改密码",
    "tenant_user.create": "新增用户",
    "tenant_user.update": "更新用户",
    "tenant_user.delete": "删除用户",
    "tenant.update": "更新注册用户",
    "bot.create": "新增机器人",
    "bot.update": "更新机器人",
    "bot.delete": "删除机器人",
    "support_config.update": "更新客服配置",
    "template.create": "新增模板",
    "template.update": "更新模板",
    "template.delete": "删除模板",
    "system_settings.update": "更新系统配置"
  };
  return labels[action] ?? action;
}

type AuditFilter = "all" | "user" | "bot" | "template" | "system";

export default function AuditLogsPage({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await api.auditLogs(200));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const matchesFilter = (log: AuditLog, value: AuditFilter) => {
    if (value === "all") {
      return true;
    }
    if (value === "user") {
      return log.resourceType.includes("tenant") || log.resourceType.includes("user");
    }
    if (value === "bot") {
      return log.resourceType.includes("bot");
    }
    if (value === "template") {
      return log.resourceType.includes("template");
    }
    return log.resourceType.includes("system") || log.action.includes("system");
  };

  const filterTabs = useMemo(
    () => [
      { key: "all", label: `全部 ${logs.length}` },
      { key: "user", label: `用户 ${logs.filter((item) => matchesFilter(item, "user")).length}` },
      { key: "bot", label: `机器人 ${logs.filter((item) => matchesFilter(item, "bot")).length}` },
      { key: "template", label: `模板 ${logs.filter((item) => matchesFilter(item, "template")).length}` },
      { key: "system", label: `系统 ${logs.filter((item) => matchesFilter(item, "system")).length}` }
    ],
    [logs]
  );
  const visibleLogs = useMemo(() => logs.filter((item) => matchesFilter(item, filter)), [filter, logs]);

  const columns: ColumnsType<AuditLog> = [
    ...(isPlatformAdmin
      ? [
          {
            title: "所属用户",
            dataIndex: "tenantName",
            width: 180,
            render: (_: string | undefined, record: AuditLog) => (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{record.tenantName || record.tenantId || "-"}</Typography.Text>
                {record.tenantId ? <Typography.Text type="secondary">{record.tenantId}</Typography.Text> : null}
              </Space>
            )
          }
        ]
      : []),
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 180
    },
    {
      title: "操作",
      dataIndex: "action",
      width: 160,
      render: (value: string) => <Tag color="blue">{actionLabel(value)}</Tag>
    },
    {
      title: "操作者",
      dataIndex: "actorUsername",
      width: 150,
      render: (value: string | undefined, record) => value || record.actorRole || "-"
    },
    {
      title: "资源",
      key: "resource",
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{record.resourceType}</Typography.Text>
          <Typography.Text type="secondary">{record.resourceId || "-"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "详情",
      dataIndex: "details",
      render: (value?: string) => (
        <Typography.Paragraph className="message-log-content" ellipsis={{ rows: 2 }}>
          {value || "-"}
        </Typography.Paragraph>
      )
    }
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <div className="page-toolbar-row">
        <Tabs
          className="filter-tabs"
          activeKey={filter}
          onChange={(key) => setFilter(key as AuditFilter)}
          items={filterTabs}
        />
        <Button icon={<ReloadOutlined />} onClick={load}>
          刷新
        </Button>
      </div>

      <Card className="panel-card">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={visibleLogs}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 980 }}
        />
      </Card>
    </Space>
  );
}
