import { Button, Card, Form, InputNumber, Select, Space, message } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { SystemSettings } from "../types";

export default function SystemSettingsPage() {
  const [form] = Form.useForm<SystemSettings>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings().then((data) => form.setFieldsValue(data)).catch(() => null);
  }, [form]);

  const onFinish = async (values: SystemSettings) => {
    setSaving(true);
    try {
      const result = await api.saveSettings(values);
      form.setFieldsValue(result);
      message.success("系统配置已保存");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <Card className="panel-card setting-card">
        <Form layout="vertical" form={form} onFinish={onFinish}>
          <Form.Item label="默认语言" name="defaultLocale">
            <Select
              options={[
                { label: "简体中文", value: "zh-CN" },
                { label: "English", value: "en-US" }
              ]}
            />
          </Form.Item>
          <Form.Item label="消息保留天数" name="retentionDays">
            <InputNumber min={7} max={365} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="附件上传策略" name="uploadPolicy">
            <Select
              options={[
                { label: "仅保留 Telegram file_id", value: "telegram-only" },
                { label: "自动写入 R2", value: "r2-sync" }
              ]}
            />
          </Form.Item>
          <Form.Item label="队列投递策略" name="queueStrategy">
            <Select
              options={[
                { label: "立即重试 3 次", value: "fast-retry" },
                { label: "指数退避", value: "backoff" }
              ]}
            />
          </Form.Item>
          <Form.Item label="后台访问方式" name="accessMode">
            <Select
              options={[
                { label: "Cloudflare Access", value: "cf-access" },
                { label: "系统账号密码", value: "local-auth" }
              ]}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" loading={saving}>
            保存配置
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
