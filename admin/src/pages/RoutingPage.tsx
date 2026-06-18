import { Button, Card, Space, Switch, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { RoutingRule } from "../types";

export default function RoutingPage() {
  const [rules, setRules] = useState<RoutingRule[]>([]);

  useEffect(() => {
    api.routingRules().then(setRules).catch(() => null);
  }, []);

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div className="page-header-row">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            会话路由
          </Typography.Title>
          <Typography.Text type="secondary">
            将机器人收到的消息按来源、标签或 Topic 路由到指定客服组
          </Typography.Text>
        </div>
        <Button size="large">新增规则</Button>
      </div>

      <Card className="panel-card">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={rules}
          columns={[
            { title: "场景", dataIndex: "scene" },
            { title: "来源条件", dataIndex: "source" },
            { title: "目标组", dataIndex: "target", render: (value) => <Tag color="blue">{value}</Tag> },
            { title: "兜底策略", dataIndex: "fallback" },
            {
              title: "启用",
              dataIndex: "enabled",
              render: (enabled: boolean) => <Switch checked={enabled} />
            }
          ]}
        />
      </Card>
    </Space>
  );
}
