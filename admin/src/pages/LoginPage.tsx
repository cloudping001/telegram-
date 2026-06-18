import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, message, Space, Typography } from "antd";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } } | undefined)?.from?.pathname ?? "/dashboard";

  const handleFinish = async (values: { username: string; password: string }) => {
    try {
      await api.login(values);
      message.success("登录成功");
      navigate(from, { replace: true });
    } catch {
      message.error("登录失败，请检查账号或密码");
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card" variant="borderless">
        <Space direction="vertical" size={6} style={{ width: "100%", marginBottom: 18 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Telegram 中转后台
          </Typography.Title>
          <Typography.Text type="secondary">登录后台，管理机器人、客服配置和消息记录。</Typography.Text>
        </Space>

        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input prefix={<UserOutlined />} placeholder="账号" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block>
            登录
          </Button>
        </Form>

        <Typography.Paragraph className="login-footer">
          还没有账号？<Link to="/register">注册账号</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
