import { Button, Card, Form, Input, Space, Switch, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { SupportConfig } from "../types";

export default function SupportConfigPage() {
  const [form] = Form.useForm<SupportConfig>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .supportConfig()
      .then((config) => form.setFieldsValue({ ...config, online: config.online ?? true }))
      .catch(() => message.error("客服配置加载失败"))
      .finally(() => setLoading(false));
  }, [form]);

  const submit = async (values: SupportConfig) => {
    setSaving(true);
    try {
      const config = await api.saveSupportConfig(values);
      form.setFieldsValue(config);
      message.success("客服配置已保存");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          客服配置
        </Typography.Title>
        <Typography.Text type="secondary">
          设置个人 Telegram 接收信息和在线状态；离线或非工作时间会自动给客户发送离线回复。
        </Typography.Text>
      </div>

      <Card className="setting-card" loading={loading}>
        <Form layout="vertical" form={form} onFinish={submit} initialValues={{ online: true }}>
          <Form.Item
            label="客服名称"
            name="name"
            rules={[{ required: true, message: "请输入客服名称" }]}
          >
            <Input placeholder="主客服" />
          </Form.Item>
          <Form.Item
            label="客服 Telegram ID"
            name="chatId"
            extra="填写你的个人 Telegram 数字 chat_id，例如 123456789。"
            rules={[
              { required: true, message: "请输入客服 Telegram ID" },
              { pattern: /^-?\d+$/, message: "客服 ID 必须是数字 chat_id" }
            ]}
          >
            <Input placeholder="123456789" />
          </Form.Item>
          <Form.Item label="在线状态" name="online" valuePropName="checked">
            <Switch checkedChildren="在线" unCheckedChildren="离线" />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" loading={saving}>
            保存客服配置
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
