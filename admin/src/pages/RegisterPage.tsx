import { LockOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, message, Space, Typography } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { RegisterPayload } from "../types";

export default function RegisterPage() {
  const navigate = useNavigate();

  const handleFinish = async (values: RegisterPayload) => {
    try {
      await api.register(values);
      message.success("注册成功");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "注册失败");
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card" variant="borderless">
        <Space direction="vertical" size={6} style={{ width: "100%", marginBottom: 18 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            注册账号
          </Typography.Title>
          <Typography.Text type="secondary">创建你的 Telegram 客服后台账号。</Typography.Text>
        </Space>

        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item name="tenantName" rules={[{ required: true, message: "请输入账号名称" }]}>
            <Input prefix={<UserOutlined />} placeholder="账号名称 / 公司名称" size="large" />
          </Form.Item>
          <Form.Item
            name="username"
            rules={[
              { required: true, message: "请输入登录账号" },
              { min: 3, message: "账号至少 3 位" }
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="登录账号" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="displayName">
            <Input prefix={<UserOutlined />} placeholder="显示名称" size="large" />
          </Form.Item>
          <Form.Item name="email">
            <Input prefix={<MailOutlined />} placeholder="邮箱，可选" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少 8 位" }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block>
            创建账号
          </Button>
        </Form>

        <Typography.Paragraph className="login-footer">
          已有账号？<Link to="/login">返回登录</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
