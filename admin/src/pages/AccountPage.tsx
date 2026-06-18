import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Space, Tag, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuthSession } from "../types";

type PasswordForm = {
  username?: string;
  currentPassword: string;
  newPassword: string;
};

export default function AccountPage() {
  const [form] = Form.useForm<PasswordForm>();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.me()
      .then((result) => {
        setSession(result);
        form.setFieldsValue({ username: result.username });
      })
      .catch(() => null);
  }, [form]);

  const submit = async (values: PasswordForm) => {
    setSaving(true);
    try {
      const result = await api.changePassword({
        username: session?.isPlatformAdmin ? values.username : undefined,
        currentPassword: values.currentPassword,
        newPassword: values.newPassword
      });
      if (result.session) {
        setSession(result.session);
        form.setFieldsValue({ username: result.session.username });
      }
      form.setFieldsValue({ currentPassword: "", newPassword: "" });
      message.success(session?.isPlatformAdmin ? "平台管理员账号已更新" : "密码已修改");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "修改失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          我的账户
        </Typography.Title>
        <Typography.Text type="secondary">查看当前登录身份，修改当前账号的登录信息。</Typography.Text>
      </div>

      <Card className="setting-card" title="登录身份">
        <Space direction="vertical" size={10}>
          <Typography.Text>
            账号：<Typography.Text strong>{session?.username ?? "-"}</Typography.Text>
          </Typography.Text>
          <Typography.Text>
            角色：
            <Tag color={session?.isPlatformAdmin ? "gold" : "blue"}>
              {session?.isPlatformAdmin ? "平台管理员" : "注册用户"}
            </Tag>
          </Typography.Text>
        </Space>
      </Card>

      <Card className="setting-card" title={session?.isPlatformAdmin ? "平台管理员账户" : "修改密码"}>
        <Form form={form} layout="vertical" onFinish={submit}>
          {session?.isPlatformAdmin ? (
            <Form.Item
              name="username"
              label="平台管理员账号"
              rules={[
                { required: true, message: "请输入平台管理员账号" },
                { min: 3, message: "账号至少 3 位" }
              ]}
            >
              <Input prefix={<UserOutlined />} autoComplete="username" />
            </Form.Item>
          ) : null}

          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true, message: "请输入当前密码" }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 8, message: "密码至少 8 位" }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={saving}>
            {session?.isPlatformAdmin ? "保存平台管理员账号" : "保存密码"}
          </Button>
        </Form>
      </Card>
    </Space>
  );
}
