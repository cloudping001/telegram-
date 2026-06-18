import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined
} from "@ant-design/icons";
import { Button, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { RegisterPayload, TenantInput, TenantSummary } from "../types";

type UserEditForm = Pick<TenantInput, "name" | "status" | "notes">;
type PasswordForm = {
  password: string;
};

export default function TenantManagementPage() {
  const [createForm] = Form.useForm<RegisterPayload>();
  const [editForm] = Form.useForm<UserEditForm>();
  const [passwordForm] = Form.useForm<PasswordForm>();
  const [users, setUsers] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TenantSummary | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<TenantSummary | null>(null);
  const [filter, setFilter] = useState<"all" | TenantSummary["status"]>("all");

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.platformTenants());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => message.error("用户列表加载失败"));
  }, []);

  const filterTabs = useMemo(
    () => [
      { key: "all", label: `全部 ${users.length}` },
      { key: "active", label: `启用 ${users.filter((item) => item.status === "active").length}` },
      { key: "disabled", label: `停用 ${users.filter((item) => item.status === "disabled").length}` }
    ],
    [users]
  );
  const visibleUsers = useMemo(
    () => (filter === "all" ? users : users.filter((item) => item.status === filter)),
    [filter, users]
  );

  const openCreate = () => {
    createForm.resetFields();
    setCreateOpen(true);
  };

  const createUser = async () => {
    const values = await createForm.validateFields();
    setSaving(true);
    try {
      await api.createPlatformUser(values);
      message.success("用户已新增");
      setCreateOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (record: TenantSummary) => {
    setEditing(record);
    editForm.setFieldsValue({
      name: record.name,
      status: record.status,
      notes: record.notes
    });
  };

  const saveUser = async () => {
    if (!editing) {
      return;
    }
    const values = await editForm.validateFields();
    setSaving(true);
    try {
      await api.updateTenant(editing.id, {
        ...values,
        plan: editing.plan
      });
      message.success("用户信息已更新");
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openPasswordReset = (record: TenantSummary) => {
    setPasswordTarget(record);
    passwordForm.resetFields();
  };

  const resetPassword = async () => {
    if (!passwordTarget) {
      return;
    }
    const values = await passwordForm.validateFields();
    setSaving(true);
    try {
      await api.resetPlatformUserPassword(passwordTarget.id, values.password);
      message.success("登录密码已重置");
      setPasswordTarget(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = (record: TenantSummary) => {
    Modal.confirm({
      title: `删除用户：${record.name}`,
      content:
        "删除后会同时清空该用户下的机器人、客服绑定、消息模板、系统配置、消息记录和审计日志。此操作不可恢复。",
      okText: "确认删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api.deletePlatformUser(record.id);
        message.success("用户及其配置已删除");
        await load();
      }
    });
  };

  const switchUser = (record: TenantSummary) => {
    api.setSelectedTenantId(record.id);
    message.success(`已进入用户后台：${record.name}`);
    window.location.href = "/dashboard";
  };

  const columns: ColumnsType<TenantSummary> = [
    {
      title: "用户",
      dataIndex: "name",
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Typography.Text type="secondary">{record.primaryUsername || "-"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "联系信息",
      dataIndex: "primaryEmail",
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{record.primaryDisplayName || record.primaryUsername || "-"}</Typography.Text>
          <Typography.Text type="secondary">{record.primaryEmail || "-"}</Typography.Text>
        </Space>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (value: TenantSummary["status"]) => (
        <Tag color={value === "active" ? "success" : "default"}>{value === "active" ? "启用" : "停用"}</Tag>
      )
    },
    { title: "登录账号", dataIndex: "userCount", width: 100 },
    { title: "机器人", dataIndex: "botCount", width: 90 },
    { title: "消息", dataIndex: "messageCount", width: 90 },
    { title: "更新时间", dataIndex: "updatedAt", width: 180 },
    {
      title: "操作",
      width: 360,
      render: (_, record) => (
        <Space wrap>
          <Button icon={<SwapOutlined />} onClick={() => switchUser(record)}>
            进入后台
          </Button>
          <Button icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button icon={<KeyOutlined />} onClick={() => openPasswordReset(record)}>
            重置密码
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => deleteUser(record)} />
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
          onChange={(key) => setFilter(key as "all" | TenantSummary["status"])}
          items={filterTabs}
        />
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
            新增用户
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        className="panel-card"
        loading={loading}
        columns={columns}
        dataSource={visibleUsers}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        scroll={{ x: 1260 }}
      />

      <Modal
        title="新增用户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={createUser}
        confirmLoading={saving}
        okText="创建用户"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="tenantName" label="用户名称" rules={[{ required: true, message: "请输入用户名称" }]}>
            <Input placeholder="公司或个人名称" />
          </Form.Item>
          <Form.Item
            name="username"
            label="登录账号"
            rules={[
              { required: true, message: "请输入登录账号" },
              { min: 3, message: "登录账号至少 3 位" }
            ]}
          >
            <Input placeholder="user001" autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="登录密码"
            rules={[
              { required: true, message: "请输入登录密码" },
              { min: 8, message: "密码至少 8 位" }
            ]}
          >
            <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称">
            <Input placeholder="客服后台显示名称" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="name@example.com" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑用户"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={saveUser}
        confirmLoading={saving}
        okText="保存"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="name" label="用户名称" rules={[{ required: true, message: "请输入用户名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select
              options={[
                { label: "启用", value: "active" },
                { label: "停用", value: "disabled" }
              ]}
            />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={passwordTarget ? `重置密码：${passwordTarget.name}` : "重置密码"}
        open={Boolean(passwordTarget)}
        onCancel={() => setPasswordTarget(null)}
        onOk={resetPassword}
        confirmLoading={saving}
        okText="确认重置"
        destroyOnClose
      >
        <Form form={passwordForm} layout="vertical">
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 8, message: "密码至少 8 位" }
            ]}
          >
            <Input.Password placeholder="至少 8 位" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
