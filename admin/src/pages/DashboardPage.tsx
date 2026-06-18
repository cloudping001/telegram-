import { Card, Col, Empty, List, Row, Skeleton, Space, Statistic, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { MessageLog, OverviewStats } from "../types";

const directionText: Record<MessageLog["direction"], string> = {
  inbound: "客户",
  outbound: "客服",
  system: "系统"
};

const directionColor: Record<MessageLog["direction"], string> = {
  inbound: "blue",
  outbound: "green",
  system: "purple"
};

function logTitle(log: MessageLog) {
  if (log.scene === "first-contact") {
    return "欢迎语";
  }
  if (log.scene === "off-hours") {
    return "离线回复";
  }
  if (log.scene === "support-reply") {
    return "客服回复";
  }
  if (log.scene === "forward-to-support") {
    return "转发客服";
  }
  return log.content || log.mediaCaption || log.messageType;
}

export default function DashboardPage({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.overview(), isPlatformAdmin ? Promise.resolve([]) : api.messageLogs(6)])
      .then(([overview, messageLogs]) => {
        setStats(overview);
        setLogs(messageLogs);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [isPlatformAdmin]);

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      {loading || !stats ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24} md={12} xl={4}>
            <Card className="metric-card">
              <Statistic title="机器人" value={stats.botCount} />
            </Card>
          </Col>
          <Col xs={24} md={12} xl={5}>
            <Card className="metric-card">
              <Statistic title="活跃会话" value={stats.activeConversations} />
            </Card>
          </Col>
          <Col xs={24} md={12} xl={5}>
            <Card className="metric-card">
              <Statistic title="今日客户消息" value={stats.todayMessages} />
            </Card>
          </Col>
          <Col xs={24} md={12} xl={5}>
            <Card className="metric-card">
              <Statistic title="今日客服回复" value={stats.todayReplies} />
            </Card>
          </Col>
          <Col xs={24} md={12} xl={5}>
            <Card className="metric-card">
              <Statistic title="发送失败" value={stats.queueFailures} />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[20, 20]}>
        {!isPlatformAdmin ? (
          <Col xs={24} xl={16}>
            <Card className="panel-card" title="最近消息">
              {logs.length ? (
                <List
                  dataSource={logs}
                  renderItem={(item) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space wrap>
                            <Tag color={directionColor[item.direction]}>{directionText[item.direction]}</Tag>
                            <Typography.Text strong>{logTitle(item)}</Typography.Text>
                            {item.status !== "sent" ? <Tag color="error">{item.status}</Tag> : null}
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={2}>
                            <Typography.Text type="secondary">
                              {item.createdAt} · 客户 {item.customerChatId || "-"}
                            </Typography.Text>
                            <Typography.Text>{item.content || item.mediaCaption || item.error || "-"}</Typography.Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="暂无消息记录" />
              )}
            </Card>
          </Col>
        ) : null}

        <Col xs={24} xl={isPlatformAdmin ? 24 : 8}>
          <Card className="panel-card" title="运行摘要">
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <div className="panel-label-row">
                <Typography.Text>离线回复次数</Typography.Text>
                <Tag color="purple">{stats?.offlineReplies ?? 0}</Tag>
              </div>
              <div className="panel-label-row">
                <Typography.Text>日志来源</Typography.Text>
                <Tag color="processing">D1 message_logs</Tag>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
