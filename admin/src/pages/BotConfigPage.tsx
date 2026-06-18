import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  MessageOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  TeamOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type {
  BotConfig,
  BotConfigInput,
  BotCustomer,
  BotSupportAgentInput,
  BroadcastInput,
  BroadcastResult,
  MessageTemplate,
  MessageTemplateInput,
  TemplateButton
} from "../types";

type SupportForm = {
  agents: BotSupportAgentInput[];
};

type BroadcastFormValues = BroadcastInput & {
  templateName?: string;
};

const defaultSupportAgent: BotSupportAgentInput = {
  name: "",
  chatId: "",
  online: true,
  enabled: true,
  weight: 100
};

const sceneOptions = [
  { label: "欢迎语", value: "first-contact" },
  { label: "离线回复", value: "off-hours" },
  { label: "群发消息", value: "broadcast" }
];
const allowedTemplateScenes = new Set(sceneOptions.map((item) => item.value));

const emptyTemplate: MessageTemplateInput = {
  name: "",
  scene: "first-contact",
  content: "",
  imageUrl: "",
  parseMode: "plain",
  isDefault: false,
  buttons: [],
  timezone: "Asia/Singapore",
  workStart: "09:00",
  workEnd: "22:00",
  enabled: true
};

const emptyBroadcast: BroadcastFormValues = {
  templateName: "",
  content: "",
  imageUrl: "",
  parseMode: "plain",
  buttons: []
};

function buttonRows(buttons: TemplateButton[] = []) {
  const rows: TemplateButton[][] = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return rows;
}

function toTemplateValues(template: MessageTemplate): MessageTemplateInput {
  return {
    name: template.name,
    scene: template.scene,
    content: template.content,
    imageUrl: template.imageUrl ?? "",
    parseMode: template.parseMode ?? "plain",
    isDefault: Boolean(template.isDefault),
    buttons: template.buttons ?? [],
    timezone: template.timezone || "Asia/Singapore",
    workStart: template.workStart || "09:00",
    workEnd: template.workEnd || "22:00",
    enabled: Boolean(template.enabled)
  };
}

function MessagePreview({ imageUrl, content, buttons }: { imageUrl?: string; content?: string; buttons?: TemplateButton[] }) {
  return (
    <div className="telegram-preview compact-preview">
      <div className="telegram-message">
        {imageUrl ? <img className="telegram-preview-image" src={imageUrl} alt="preview" /> : null}
        <div className="telegram-preview-text">{content || "消息内容会显示在这里"}</div>
        {buttons?.length ? (
          <div className="telegram-button-grid">
            {buttonRows(buttons).map((row, rowIndex) => (
              <div className="telegram-button-row" key={rowIndex}>
                {row.map((button, buttonIndex) => (
                  <span className="telegram-inline-button" key={`${button.text}-${buttonIndex}`}>
                    {button.text || "按钮"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function BotConfigPage({ isPlatformAdmin = false }: { isPlatformAdmin?: boolean }) {
  const screens = Grid.useBreakpoint();
  const [form] = Form.useForm<BotConfigInput>();
  const [supportForm] = Form.useForm<SupportForm>();
  const [templateForm] = Form.useForm<MessageTemplateInput>();
  const [broadcastForm] = Form.useForm<BroadcastFormValues>();
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [botDrawerOpen, setBotDrawerOpen] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<BotConfig | null>(null);
  const [activeBot, setActiveBot] = useState<BotConfig | null>(null);
  const [activeTab, setActiveTab] = useState("support");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<BotCustomer[]>([]);
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [customerStatus, setCustomerStatus] = useState<"active" | "blocked">("active");
  const [botFilter, setBotFilter] = useState<"all" | BotConfig["status"]>("all");
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSupport, setSavingSupport] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingBroadcastTemplate, setSavingBroadcastTemplate] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const useMobileCards = !screens.md;

  const templateValues = Form.useWatch([], templateForm) ?? emptyTemplate;
  const broadcastValues = Form.useWatch([], broadcastForm) ?? emptyBroadcast;
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const botFilterTabs = useMemo(
    () => [
      { key: "all", label: `全部 ${bots.length}` },
      { key: "online", label: `在线 ${bots.filter((item) => item.status === "online").length}` },
      { key: "paused", label: `暂停 ${bots.filter((item) => item.status === "paused").length}` }
    ],
    [bots]
  );
  const visibleBots = useMemo(
    () => (botFilter === "all" ? bots : bots.filter((item) => item.status === botFilter)),
    [botFilter, bots]
  );

  const loadBots = useCallback(async () => {
    setLoading(true);
    try {
      setBots(await api.bots());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBots().catch(() => message.error("机器人列表加载失败"));
  }, [loadBots]);

  const loadSupport = async (bot: BotConfig) => {
    setSupportLoading(true);
    try {
      const agents = await api.botSupportAgents(bot.id);
      supportForm.setFieldsValue({
        agents: agents.length ? agents : [{ ...defaultSupportAgent }]
      });
    } finally {
      setSupportLoading(false);
    }
  };

  const loadTemplates = async (bot: BotConfig, preferredId?: string) => {
    setTemplateLoading(true);
    try {
      const rows = (await api.botTemplates(bot.id)).filter((item) => allowedTemplateScenes.has(item.scene));
      setTemplates(rows);
      const next = rows.find((item) => item.id === preferredId) ?? rows[0] ?? null;
      setSelectedTemplateId(next?.id ?? null);
      templateForm.setFieldsValue(next ? toTemplateValues(next) : emptyTemplate);
    } finally {
      setTemplateLoading(false);
    }
  };

  const loadCustomers = async (bot: BotConfig, keyword = customerKeyword, status = customerStatus) => {
    setCustomerLoading(true);
    try {
      setCustomers(await api.botCustomers(bot.id, { limit: 200, q: keyword, status }));
    } finally {
      setCustomerLoading(false);
    }
  };

  const openCreate = () => {
    setEditingBot(null);
    form.setFieldsValue({
      name: "",
      username: "",
      token: "",
      status: "online",
      webhookPath: ""
    });
    setBotDrawerOpen(true);
  };

  const openEdit = (bot: BotConfig) => {
    setEditingBot(bot);
    form.setFieldsValue({
      name: bot.name,
      username: bot.username,
      token: "",
      status: bot.status,
      webhookPath: bot.webhookPath
    });
    setBotDrawerOpen(true);
  };

  const openWorkbench = async (bot: BotConfig) => {
    setActiveBot(bot);
    setActiveTab("support");
    setWorkbenchOpen(true);
    setBroadcastResult(null);
    broadcastForm.setFieldsValue(emptyBroadcast);
    await Promise.all([
      loadSupport(bot).catch(() => message.error("客服绑定加载失败")),
      loadTemplates(bot).catch(() => message.error("模板列表加载失败")),
      loadCustomers(bot).catch(() => message.error("客户列表加载失败"))
    ]);
  };

  const submit = async (values: BotConfigInput) => {
    setSaving(true);
    try {
      if (editingBot) {
        await api.updateBot(editingBot.id, values);
        message.success("机器人配置已更新");
      } else {
        await api.createBot(values);
        message.success("机器人已创建，已初始化默认模板");
      }
      setBotDrawerOpen(false);
      await loadBots();
    } finally {
      setSaving(false);
    }
  };

  const saveSupport = async (values: SupportForm) => {
    if (!activeBot) {
      return;
    }
    setSavingSupport(true);
    try {
      const agents = (values.agents ?? []).map((item) => ({
        ...item,
        weight: Number(item.weight ?? 0),
        online: Boolean(item.online),
        enabled: Boolean(item.enabled)
      }));
      await api.saveBotSupportAgents(activeBot.id, agents);
      message.success("客服绑定已保存");
      await loadSupport(activeBot);
    } finally {
      setSavingSupport(false);
    }
  };

  const createTemplate = () => {
    setSelectedTemplateId(null);
    templateForm.setFieldsValue({
      ...emptyTemplate,
      name: "新模板",
      content: ""
    });
  };

  const saveTemplate = async (values: MessageTemplateInput) => {
    if (!activeBot) {
      return;
    }
    setSavingTemplate(true);
    try {
      const payload = {
        ...emptyTemplate,
        ...values,
        buttons: values.buttons ?? []
      };
      const saved = selectedTemplate
        ? await api.updateBotTemplate(activeBot.id, selectedTemplate.id, payload)
        : await api.createBotTemplate(activeBot.id, payload);
      message.success("机器人模板已保存");
      await loadTemplates(activeBot, saved.id);
    } finally {
      setSavingTemplate(false);
    }
  };

  const removeTemplate = async () => {
    if (!activeBot || !selectedTemplate) {
      return;
    }
    await api.deleteBotTemplate(activeBot.id, selectedTemplate.id);
    message.success("机器人模板已删除");
    await loadTemplates(activeBot);
  };

  const sendBroadcast = async () => {
    if (!activeBot) {
      return;
    }
    const values = await broadcastForm.validateFields();
    const { templateName: _templateName, ...payload } = values;
    Modal.confirm({
      title: "确认群发？",
      content: `将发送给当前机器人下 ${customers.length} 个已互动且未拉黑的客户。发送后会写入消息记录。`,
      okText: "确认发送",
      cancelText: "取消",
      onOk: async () => {
        setSendingBroadcast(true);
        try {
          const result = await api.broadcastToBotCustomers(activeBot.id, {
            ...payload,
            buttons: payload.buttons ?? []
          });
          setBroadcastResult(result);
          message.success(`群发完成：成功 ${result.sent}，失败 ${result.failed}`);
          await loadCustomers(activeBot);
        } finally {
          setSendingBroadcast(false);
        }
      }
    });
  };

  const saveBroadcastTemplate = async () => {
    if (!activeBot) {
      return;
    }
    const values = await broadcastForm.validateFields();
    setSavingBroadcastTemplate(true);
    try {
      const saved = await api.createBotTemplate(activeBot.id, {
        name: values.templateName?.trim() || "群发消息模板",
        scene: "broadcast",
        content: values.content.trim(),
        imageUrl: values.imageUrl?.trim() ?? "",
        parseMode: values.parseMode ?? "plain",
        isDefault: false,
        buttons: values.buttons ?? [],
        timezone: "",
        workStart: "",
        workEnd: "",
        enabled: true
      });
      message.success("已保存到消息模板");
      await loadTemplates(activeBot, saved.id);
    } finally {
      setSavingBroadcastTemplate(false);
    }
  };

  const removeBot = async (id: string) => {
    await api.deleteBot(id);
    message.success("机器人及其绑定配置已删除");
    await loadBots();
  };

  const renderBotActions = (record: BotConfig, compact = false) => (
    <Space wrap className={compact ? "bot-card-actions" : undefined}>
      <Button type="primary" icon={<AppstoreOutlined />} onClick={() => openWorkbench(record)}>
        管理
      </Button>
      <Button icon={<EditOutlined />} onClick={() => openEdit(record)}>
        编辑
      </Button>
      <Popconfirm title="确认删除该机器人及其绑定数据？" onConfirm={() => removeBot(record.id)}>
        <Button danger icon={<DeleteOutlined />}>
          {compact ? "删除" : null}
        </Button>
      </Popconfirm>
    </Space>
  );

  const botColumns: ColumnsType<BotConfig> = [
    ...(isPlatformAdmin
      ? [
          {
            title: "所属用户",
            dataIndex: "tenantName",
            width: 170,
            render: (_: string | undefined, record: BotConfig) => (
              <Space direction="vertical" size={2}>
                <Typography.Text strong ellipsis>
                  {record.tenantName || record.tenantId || "-"}
                </Typography.Text>
                {record.tenantId ? <Typography.Text type="secondary">{record.tenantId}</Typography.Text> : null}
              </Space>
            )
          }
        ]
      : []),
    { title: "机器人", dataIndex: "name", width: 150, ellipsis: true },
    { title: "用户名", dataIndex: "username", width: 150, ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: BotConfig["status"]) => (
        <Tag color={value === "online" ? "success" : "default"}>{value === "online" ? "在线" : "暂停"}</Tag>
      )
    },
    { title: "Webhook 路径", dataIndex: "webhookPath", width: 240, ellipsis: true },
    { title: "最近同步", dataIndex: "latestSync", width: 160 },
    {
      title: "操作",
      width: 260,
      fixed: "right",
      render: (_, record) => renderBotActions(record)
    }
  ];

  const customerColumns: ColumnsType<BotCustomer> = [
    {
      title: "客户",
      dataIndex: "displayName",
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.displayName || record.chatId}</Typography.Text>
          <Typography.Text type="secondary">{record.username ? `@${record.username}` : record.chatId}</Typography.Text>
        </Space>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: BotCustomer["status"]) => (
        <Tag color={value === "active" ? "success" : "default"}>{value === "active" ? "可触达" : "不可达"}</Tag>
      )
    },
    { title: "消息数", dataIndex: "messageCount", width: 90 },
    {
      title: "最近消息",
      dataIndex: "lastMessage",
      render: (value?: string) => (
        <Typography.Paragraph className="message-log-content" ellipsis={{ rows: 2 }}>
          {value || "-"}
        </Typography.Paragraph>
      )
    },
    { title: "最近互动", dataIndex: "lastSeenAt", width: 180 }
  ];

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div className="page-toolbar-row">
        <Tabs
          className="filter-tabs"
          activeKey={botFilter}
          onChange={(key) => setBotFilter(key as "all" | BotConfig["status"])}
          items={botFilterTabs}
        />
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={loadBots}>
            刷新
          </Button>
          <Button type="primary" size="large" onClick={openCreate}>
            新建机器人
          </Button>
        </Space>
      </div>

      <Card className="panel-card bot-list-panel">
        {useMobileCards ? (
          <div className="bot-card-list">
            {loading ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : visibleBots.length ? (
              visibleBots.map((bot) => (
                <Card key={bot.id} className="bot-mobile-card" variant="borderless">
                  <div className="bot-card-heading">
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{bot.name}</Typography.Text>
                      <Typography.Text type="secondary">{bot.username}</Typography.Text>
                    </Space>
                    <Tag color={bot.status === "online" ? "success" : "default"}>{bot.status === "online" ? "在线" : "暂停"}</Tag>
                  </div>
                  <div className="bot-card-meta">
                    {isPlatformAdmin ? (
                      <div className="bot-card-meta-row">
                        <span>所属用户</span>
                        <Typography.Text ellipsis>{bot.tenantName || bot.tenantId || "-"}</Typography.Text>
                      </div>
                    ) : null}
                    <div className="bot-card-meta-row">
                      <span>Webhook</span>
                      <Typography.Text ellipsis>{bot.webhookPath || "-"}</Typography.Text>
                    </div>
                    <div className="bot-card-meta-row">
                      <span>最近同步</span>
                      <Typography.Text>{bot.latestSync || "-"}</Typography.Text>
                    </div>
                  </div>
                  {renderBotActions(bot, true)}
                </Card>
              ))
            ) : (
              <Empty description="暂无机器人" />
            )}
          </div>
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            dataSource={visibleBots}
            pagination={false}
            tableLayout="fixed"
            scroll={{ x: isPlatformAdmin ? 1220 : 1050 }}
            columns={botColumns}
          />
        )}
      </Card>

      <Drawer
        title={editingBot ? "编辑机器人" : "新建机器人"}
        width={460}
        open={botDrawerOpen}
        onClose={() => setBotDrawerOpen(false)}
        destroyOnClose
      >
        <Form layout="vertical" form={form} onFinish={submit} initialValues={{ status: "online" }}>
          <Form.Item label="机器人名称" name="name" rules={[{ required: true, message: "请输入机器人名称" }]}>
            <Input placeholder="客服主机器人" />
          </Form.Item>
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: "请输入 Telegram 用户名" }]}>
            <Input placeholder="@support_bridge_bot" />
          </Form.Item>
          <Form.Item
            label="Bot Token"
            name="token"
            extra={editingBot ? "留空表示不更新 Token。" : undefined}
            rules={editingBot ? [] : [{ required: true, message: "请输入 Bot Token" }]}
          >
            <Input.Password placeholder="123456:ABC..." />
          </Form.Item>
          <Form.Item label="Webhook 路径" name="webhookPath">
            <Input placeholder="/api/telegram/webhook/main" />
          </Form.Item>
          <Form.Item name="status" hidden>
            <Input />
          </Form.Item>
          <Form.Item label="启用状态">
            <Form.Item noStyle shouldUpdate>
              {() => (
                <Switch
                  checkedChildren="在线"
                  unCheckedChildren="暂停"
                  checked={form.getFieldValue("status") === "online"}
                  onChange={(checked) => form.setFieldValue("status", checked ? "online" : "paused")}
                />
              )}
            </Form.Item>
          </Form.Item>
          <Button type="primary" block size="large" htmlType="submit" loading={saving}>
            保存配置
          </Button>
        </Form>
      </Drawer>

      <Drawer
        title={activeBot ? `${activeBot.name} / 机器人工作台` : "机器人工作台"}
        width={1040}
        open={workbenchOpen}
        onClose={() => setWorkbenchOpen(false)}
        destroyOnClose
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          destroyOnHidden
          items={[
            {
              key: "support",
              label: (
                <span>
                  <TeamOutlined /> 客服绑定
                </span>
              ),
              children: (
                <Card className="panel-card workbench-card" loading={supportLoading}>
                  <Typography.Paragraph type="secondary">
                    客户消息只会转发到该机器人绑定的客服。开启多个客服后，新会话按权重分流；同一个客户后续消息保持原客服接待。
                  </Typography.Paragraph>
                  <Form form={supportForm} layout="vertical" onFinish={saveSupport} initialValues={{ agents: [{ ...defaultSupportAgent }] }}>
                    <Form.List name="agents">
                      {(fields, { add, remove }) => (
                        <Space direction="vertical" size={12} style={{ width: "100%" }}>
                          <Button icon={<PlusOutlined />} onClick={() => add({ ...defaultSupportAgent })}>
                            添加客服
                          </Button>
                          {fields.map(({ key, ...field }, index) => (
                            <Card
                              key={key}
                              size="small"
                              title={`客服 ${index + 1}`}
                              extra={
                                <Button danger type="link" onClick={() => remove(field.name)}>
                                  删除
                                </Button>
                              }
                            >
                              <Form.Item name={[field.name, "id"]} hidden>
                                <Input />
                              </Form.Item>
                              <Row gutter={12}>
                                <Col xs={24} md={8}>
                                  <Form.Item
                                    label="客服名称"
                                    name={[field.name, "name"]}
                                    rules={[{ required: true, message: "请输入客服名称" }]}
                                  >
                                    <Input placeholder="例如 售前客服" />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={8}>
                                  <Form.Item
                                    label="客服 Telegram ID"
                                    name={[field.name, "chatId"]}
                                    rules={[
                                      { required: true, message: "请输入客服 Telegram ID" },
                                      { pattern: /^-?\d+$/, message: "必须是数字 chat_id" }
                                    ]}
                                  >
                                    <Input placeholder="123456789" />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} md={4}>
                                  <Form.Item label="分流比例" name={[field.name, "weight"]} rules={[{ required: true }]}>
                                    <InputNumber min={0} max={10000} precision={0} style={{ width: "100%" }} />
                                  </Form.Item>
                                </Col>
                                <Col xs={12} md={2}>
                                  <Form.Item label="在线" name={[field.name, "online"]} valuePropName="checked">
                                    <Switch />
                                  </Form.Item>
                                </Col>
                                <Col xs={12} md={2}>
                                  <Form.Item label="启用" name={[field.name, "enabled"]} valuePropName="checked">
                                    <Switch />
                                  </Form.Item>
                                </Col>
                              </Row>
                            </Card>
                          ))}
                        </Space>
                      )}
                    </Form.List>
                    <Button type="primary" size="large" htmlType="submit" loading={savingSupport} style={{ marginTop: 18 }}>
                      保存客服绑定
                    </Button>
                  </Form>
                </Card>
              )
            },
            {
              key: "templates",
              label: (
                <span>
                  <MessageOutlined /> 消息模板
                </span>
              ),
              children: (
                <Row gutter={[16, 16]} className="bot-template-workbench">
                  <Col xs={24} lg={7}>
                    <Card
                      className="panel-card template-list-card"
                      loading={templateLoading}
                      title="机器人模板"
                      extra={
                        <Button type="link" onClick={createTemplate}>
                          新建
                        </Button>
                      }
                    >
                      <div className="template-list compact-list">
                        {templates.map((template) => (
                          <button
                            type="button"
                            key={template.id}
                            className={`template-list-item ${template.id === selectedTemplateId ? "active" : ""}`}
                            onClick={() => {
                              setSelectedTemplateId(template.id);
                              templateForm.setFieldsValue(toTemplateValues(template));
                            }}
                          >
                            <span>{template.name}</span>
                            <Space size={6}>
                              {template.isDefault ? <Tag color="blue">默认</Tag> : null}
                              <Tag color={template.enabled ? "success" : "default"}>{template.enabled ? "启用" : "停用"}</Tag>
                            </Space>
                          </button>
                        ))}
                      </div>
                    </Card>
                  </Col>
                  <Col xs={24} lg={7}>
                    <Card className="panel-card template-preview-card" title="预览">
                      <MessagePreview
                        imageUrl={templateValues.imageUrl}
                        content={templateValues.content}
                        buttons={templateValues.buttons}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} lg={10}>
                    <Card className="panel-card" title="模板内容">
                      <Form form={templateForm} layout="vertical" onFinish={saveTemplate} initialValues={emptyTemplate}>
                        <Row gutter={12}>
                          <Col xs={24} md={12}>
                            <Form.Item label="模板名称" name="name" rules={[{ required: true, message: "请输入模板名称" }]}>
                              <Input placeholder="欢迎语" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item label="场景" name="scene" rules={[{ required: true, message: "请选择场景" }]}>
                              <Select options={sceneOptions} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={12}>
                          <Col xs={24} md={12}>
                            <Form.Item label="图片外链" name="imageUrl">
                              <Input placeholder="https://example.com/image.png" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item label="解析模式" name="parseMode">
                              <Select
                                options={[
                                  { label: "plain", value: "plain" },
                                  { label: "HTML", value: "HTML" },
                                  { label: "MarkdownV2", value: "MarkdownV2" }
                                ]}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item label="文字内容" name="content" rules={[{ required: true, message: "请输入模板内容" }]}>
                          <Input.TextArea rows={6} />
                        </Form.Item>
                        {templateValues.scene === "off-hours" ? (
                          <Space direction="vertical" size={10} style={{ width: "100%" }}>
                            <Alert
                              type="info"
                              showIcon
                              message="非工作时间启用离线回复"
                              description="下面填写的是正常接待时间。客户在该时间段之外发送消息时，系统会自动发送这条离线回复。"
                            />
                            <Row gutter={12}>
                              <Col xs={24} md={8}>
                                <Form.Item label="时区" name="timezone">
                                  <Select
                                    options={[
                                      { label: "Asia/Singapore", value: "Asia/Singapore" },
                                      { label: "Asia/Shanghai", value: "Asia/Shanghai" },
                                      { label: "UTC", value: "UTC" }
                                    ]}
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={12} md={8}>
                                <Form.Item label="接待开始" name="workStart">
                                  <Input placeholder="09:00" />
                                </Form.Item>
                              </Col>
                              <Col xs={12} md={8}>
                                <Form.Item label="接待结束" name="workEnd">
                                  <Input placeholder="22:00" />
                                </Form.Item>
                              </Col>
                            </Row>
                          </Space>
                        ) : null}
                        <Form.List name="buttons">
                          {(fields, { add, remove }) => (
                            <Space direction="vertical" size={10} style={{ width: "100%" }}>
                              <div className="panel-label-row">
                                <Typography.Text strong>内联按钮</Typography.Text>
                                <Button icon={<PlusOutlined />} onClick={() => add({ text: "", url: "" })}>
                                  添加按钮
                                </Button>
                              </div>
                              {fields.map(({ key, ...field }) => (
                                <Row gutter={8} key={key} align="middle">
                                  <Col xs={24} md={8}>
                                    <Form.Item {...field} name={[field.name, "text"]} rules={[{ required: true, message: "按钮文字必填" }]}>
                                      <Input placeholder="按钮文字" />
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} md={14}>
                                    <Form.Item
                                      {...field}
                                      name={[field.name, "url"]}
                                      rules={[
                                        { required: true, message: "跳转链接必填" },
                                        { type: "url", message: "请输入有效 URL" }
                                      ]}
                                    >
                                      <Input placeholder="https://example.com" />
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} md={2}>
                                    <Button danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                  </Col>
                                </Row>
                              ))}
                            </Space>
                          )}
                        </Form.List>
                        <Row gutter={12} style={{ marginTop: 16 }}>
                          <Col xs={12}>
                            <Form.Item label="默认模板" name="isDefault" valuePropName="checked">
                              <Switch checkedChildren="默认" unCheckedChildren="普通" />
                            </Form.Item>
                          </Col>
                          <Col xs={12}>
                            <Form.Item label="启用" name="enabled" valuePropName="checked">
                              <Switch checkedChildren="启用" unCheckedChildren="停用" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Space>
                          <Button type="primary" htmlType="submit" loading={savingTemplate}>
                            保存模板
                          </Button>
                          {selectedTemplate ? (
                            <Popconfirm title="确认删除该模板？" onConfirm={removeTemplate}>
                              <Button danger>删除</Button>
                            </Popconfirm>
                          ) : null}
                        </Space>
                      </Form>
                    </Card>
                  </Col>
                </Row>
              )
            },
            {
              key: "customers",
              label: (
                <span>
                  <TeamOutlined /> 客户列表
                </span>
              ),
              children: (
                <Card className="panel-card workbench-card">
                  <div className="page-header-row customer-toolbar">
                    <Space wrap>
                      <Input.Search
                        placeholder="搜索 chat_id / 用户名 / 名称"
                        allowClear
                        value={customerKeyword}
                        onChange={(event) => setCustomerKeyword(event.target.value)}
                        onSearch={(value) => activeBot && loadCustomers(activeBot, value, customerStatus)}
                        style={{ width: 280 }}
                      />
                      <Select
                        value={customerStatus}
                        style={{ width: 120 }}
                        options={[
                          { label: "可触达", value: "active" },
                          { label: "不可达", value: "blocked" }
                        ]}
                        onChange={(value) => {
                          setCustomerStatus(value);
                          if (activeBot) {
                            loadCustomers(activeBot, customerKeyword, value).catch(() => message.error("客户列表加载失败"));
                          }
                        }}
                      />
                    </Space>
                    <Button icon={<ReloadOutlined />} onClick={() => activeBot && loadCustomers(activeBot)}>
                      刷新
                    </Button>
                  </div>
                  <Table
                    rowKey="id"
                    loading={customerLoading}
                    columns={customerColumns}
                    dataSource={customers}
                    pagination={{ pageSize: 10, showSizeChanger: false }}
                    scroll={{ x: 900 }}
                  />
                </Card>
              )
            },
            {
              key: "broadcast",
              label: (
                <span>
                  <SendOutlined /> 群发消息
                </span>
              ),
              children: (
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={10}>
                    <Card className="panel-card template-preview-card" title="群发预览">
                      <MessagePreview
                        imageUrl={broadcastValues.imageUrl}
                        content={broadcastValues.content}
                        buttons={broadcastValues.buttons}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} lg={14}>
                    <Card className="panel-card" title="自定义消息">
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Telegram 不提供主动获取全部关注者的接口，这里会发送给已点击 /start 或发送过消息的客户。"
                      />
                      {broadcastResult ? (
                        <Alert
                          type={broadcastResult.failed ? "warning" : "success"}
                          showIcon
                          style={{ marginBottom: 16 }}
                          message={`上次群发：总数 ${broadcastResult.total}，成功 ${broadcastResult.sent}，失败 ${broadcastResult.failed}，标记不可达 ${broadcastResult.blocked}`}
                        />
                      ) : null}
                      <Form form={broadcastForm} layout="vertical" initialValues={emptyBroadcast}>
                        <Row gutter={12}>
                          <Col xs={24} md={12}>
                            <Form.Item label="模板名称" name="templateName">
                              <Input placeholder="保存为模板时使用" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item label="图片外链" name="imageUrl">
                              <Input placeholder="https://example.com/image.png" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={12}>
                          <Col xs={24} md={12}>
                            <Form.Item label="解析模式" name="parseMode">
                              <Select
                                options={[
                                  { label: "plain", value: "plain" },
                                  { label: "HTML", value: "HTML" },
                                  { label: "MarkdownV2", value: "MarkdownV2" }
                                ]}
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item label="文字内容" name="content" rules={[{ required: true, message: "请输入群发内容" }]}>
                          <Input.TextArea rows={7} placeholder="请输入要发送给客户的内容" />
                        </Form.Item>
                        <Form.List name="buttons">
                          {(fields, { add, remove }) => (
                            <Space direction="vertical" size={10} style={{ width: "100%" }}>
                              <div className="panel-label-row">
                                <Typography.Text strong>内联按钮</Typography.Text>
                                <Button icon={<PlusOutlined />} onClick={() => add({ text: "", url: "" })}>
                                  添加按钮
                                </Button>
                              </div>
                              {fields.map(({ key, ...field }) => (
                                <Row gutter={8} key={key} align="middle">
                                  <Col xs={24} md={8}>
                                    <Form.Item {...field} name={[field.name, "text"]} rules={[{ required: true, message: "按钮文字必填" }]}>
                                      <Input placeholder="按钮文字" />
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} md={14}>
                                    <Form.Item
                                      {...field}
                                      name={[field.name, "url"]}
                                      rules={[
                                        { required: true, message: "跳转链接必填" },
                                        { type: "url", message: "请输入有效 URL" }
                                      ]}
                                    >
                                      <Input placeholder="https://example.com" />
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} md={2}>
                                    <Button danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                                  </Col>
                                </Row>
                              ))}
                            </Space>
                          )}
                        </Form.List>
                        <Space wrap style={{ marginTop: 18 }}>
                          <Button
                            type="primary"
                            size="large"
                            icon={<SendOutlined />}
                            loading={sendingBroadcast}
                            onClick={sendBroadcast}
                          >
                            发送给已互动客户
                          </Button>
                          <Button size="large" loading={savingBroadcastTemplate} onClick={saveBroadcastTemplate}>
                            保存为模板
                          </Button>
                        </Space>
                      </Form>
                    </Card>
                  </Col>
                </Row>
              )
            }
          ]}
        />
      </Drawer>
    </Space>
  );
}
