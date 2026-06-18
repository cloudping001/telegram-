import { ReloadOutlined } from "@ant-design/icons";
import { Button, Card, Space, Table, Tabs, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { MessageLog } from "../types";

const directionMeta: Record<MessageLog["direction"], { label: string; color: string }> = {
  inbound: { label: "客户消息", color: "blue" },
  outbound: { label: "客服回复", color: "green" },
  system: { label: "系统发送", color: "purple" }
};

const statusMeta: Record<MessageLog["status"], { label: string; color: string }> = {
  sent: { label: "成功", color: "success" },
  failed: { label: "失败", color: "error" },
  ignored: { label: "忽略", color: "default" }
};

const typeText: Record<MessageLog["messageType"], string> = {
  text: "文本",
  photo: "图片",
  document: "文件",
  voice: "语音",
  template: "模板",
  unsupported: "其他"
};

function contentPreview(record: MessageLog) {
  return record.content || record.mediaCaption || record.error || "-";
}

type LogFilter = "all" | "inbound" | "outbound" | "system" | "failed";

export default function MessageLogsPage({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await api.messageLogs(200));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => null);
  }, []);

  const filterTabs = useMemo(
    () => [
      { key: "all", label: `全部 ${logs.length}` },
      { key: "inbound", label: `客户消息 ${logs.filter((item) => item.direction === "inbound").length}` },
      { key: "outbound", label: `客服回复 ${logs.filter((item) => item.direction === "outbound").length}` },
      { key: "system", label: `系统发送 ${logs.filter((item) => item.direction === "system").length}` },
      { key: "failed", label: `失败 ${logs.filter((item) => item.status === "failed").length}` }
    ],
    [logs]
  );

  const visibleLogs = useMemo(() => {
    if (filter === "all") {
      return logs;
    }
    if (filter === "failed") {
      return logs.filter((item) => item.status === "failed");
    }
    return logs.filter((item) => item.direction === filter);
  }, [filter, logs]);

  const columns: ColumnsType<MessageLog> = [
    ...(isPlatformAdmin
      ? [
          {
            title: "所属用户",
            dataIndex: "tenantName",
            width: 180,
            render: (_: string | undefined, record: MessageLog) => (
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
      title: "方向",
      dataIndex: "direction",
      width: 120,
      render: (value: MessageLog["direction"]) => (
        <Tag color={directionMeta[value].color}>{directionMeta[value].label}</Tag>
      )
    },
    {
      title: "类型",
      dataIndex: "messageType",
      width: 90,
      render: (value: MessageLog["messageType"]) => typeText[value]
    },
    {
      title: "客户 ID",
      dataIndex: "customerChatId",
      width: 150,
      render: (value?: string) => value || "-"
    },
    {
      title: "客服 ID",
      dataIndex: "supportChatId",
      width: 150,
      render: (value?: string) => value || "-"
    },
    {
      title: "场景",
      dataIndex: "scene",
      width: 150,
      render: (value?: string) => value || "-"
    },
    {
      title: "内容",
      key: "content",
      render: (_, record) => (
        <Typography.Paragraph className="message-log-content" ellipsis={{ rows: 2 }}>
          {contentPreview(record)}
        </Typography.Paragraph>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: MessageLog["status"], record) => (
        <Space direction="vertical" size={2}>
          <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>
          {record.error ? <Typography.Text type="danger">{record.error}</Typography.Text> : null}
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <div className="page-toolbar-row">
        <Tabs
          className="filter-tabs"
          activeKey={filter}
          onChange={(key) => setFilter(key as LogFilter)}
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
          scroll={{ x: 1180 }}
        />
      </Card>
    </Space>
  );
}
