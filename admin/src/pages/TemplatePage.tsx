import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { MessageTemplate, MessageTemplateInput, TemplateButton } from "../types";

const sceneOptions = [
  { label: "欢迎语", value: "first-contact" },
  { label: "离线回复", value: "off-hours" },
  { label: "关闭会话", value: "conversation-close" },
  { label: "快捷回复", value: "quick-reply" }
];

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

function buttonRows(buttons: TemplateButton[] = []) {
  const rows: TemplateButton[][] = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  return rows;
}

function toFormValues(template: MessageTemplate): MessageTemplateInput {
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

export default function TemplatePage() {
  const [form] = Form.useForm<MessageTemplateInput>();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const formValues = Form.useWatch([], form) ?? emptyTemplate;

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? null,
    [selectedId, templates]
  );

  const filteredTemplates = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) {
      return templates;
    }

    return templates.filter(
      (item) =>
        item.name.toLowerCase().includes(text) ||
        item.scene.toLowerCase().includes(text) ||
        item.content.toLowerCase().includes(text)
    );
  }, [keyword, templates]);

  const loadTemplates = async (preferredId?: string) => {
    setLoading(true);
    try {
      const rows = await api.templates();
      setTemplates(rows);
      const next = rows.find((item) => item.id === preferredId) ?? rows[0] ?? null;
      setSelectedId(next?.id ?? null);
      form.setFieldsValue(next ? toFormValues(next) : emptyTemplate);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates().catch(() => message.error("模板列表加载失败"));
  }, []);

  const selectTemplate = (template: MessageTemplate) => {
    setSelectedId(template.id);
    form.setFieldsValue(toFormValues(template));
  };

  const createTemplate = () => {
    setSelectedId(null);
    form.setFieldsValue({
      ...emptyTemplate,
      name: "新模板",
      content: ""
    });
  };

  const submit = async (values: MessageTemplateInput) => {
    setSaving(true);
    try {
      const payload = {
        ...emptyTemplate,
        ...values,
        buttons: values.buttons ?? []
      };
      const saved = selectedTemplate
        ? await api.updateTemplate(selectedTemplate.id, payload)
        : await api.createTemplate(payload);
      message.success("消息模板已保存");
      await loadTemplates(saved.id);
    } finally {
      setSaving(false);
    }
  };

  const removeTemplate = async () => {
    if (!selectedTemplate) {
      return;
    }

    await api.deleteTemplate(selectedTemplate.id);
    message.success("消息模板已删除");
    await loadTemplates();
  };

  const watchedButtons = formValues.buttons ?? [];
  const watchedScene = formValues.scene;

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div className="page-header-row">
        <div>
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            消息模板
          </Typography.Title>
          <Typography.Text type="secondary">
            配置欢迎语、离线回复、图文内容和 Telegram 内联跳转按钮。
          </Typography.Text>
        </div>
        <Button type="primary" size="large" onClick={createTemplate}>
          新建模板
        </Button>
      </div>

      <Row gutter={[20, 20]} align="stretch">
        <Col xs={24} xl={6}>
          <Card className="panel-card template-list-card" loading={loading} title="已保存模板">
            <Input.Search
              placeholder="搜索模板名称或场景"
              allowClear
              onSearch={setKeyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ marginBottom: 14 }}
            />
            <div className="template-list">
              {filteredTemplates.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  className={`template-list-item ${template.id === selectedId ? "active" : ""}`}
                  onClick={() => selectTemplate(template)}
                >
                  <span>{template.name}</span>
                  <Space size={6}>
                    {template.isDefault ? <Tag color="blue">默认</Tag> : null}
                    <Tag color={template.enabled ? "success" : "default"}>
                      {template.enabled ? "启用" : "停用"}
                    </Tag>
                  </Space>
                </button>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={7}>
          <Card
            className="panel-card template-preview-card"
            title="消息预览"
            extra={
              <Button type="default" onClick={() => form.submit()} loading={saving}>
                保存
              </Button>
            }
          >
            <div className="telegram-preview">
              <div className="telegram-message">
                {formValues.imageUrl ? (
                  <img className="telegram-preview-image" src={formValues.imageUrl} alt="template" />
                ) : null}
                <div className="telegram-preview-text">
                  {formValues.content || "模板内容会显示在这里"}
                </div>
                {watchedButtons.length ? (
                  <div className="telegram-button-grid">
                    {buttonRows(watchedButtons).map((row, rowIndex) => (
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
          </Card>
        </Col>

        <Col xs={24} xl={11}>
          <Card className="panel-card" title="消息文案">
            <Form layout="vertical" form={form} onFinish={submit} initialValues={emptyTemplate}>
              <Form.Item
                label="模板名称"
                name="name"
                rules={[{ required: true, message: "请输入模板名称" }]}
              >
                <Input placeholder="欢迎语" />
              </Form.Item>
              <Row gutter={14}>
                <Col xs={24} md={12}>
                  <Form.Item
                    label="触发场景"
                    name="scene"
                    rules={[{ required: true, message: "请选择触发场景" }]}
                  >
                    <Select options={sceneOptions} />
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
              <Form.Item label="图片外链" name="imageUrl">
                <Input placeholder="https://example.com/image.png" />
              </Form.Item>
              <Form.Item
                label="文字内容"
                name="content"
                rules={[{ required: true, message: "请输入模板内容" }]}
              >
                <Input.TextArea rows={8} placeholder="请输入要发送给客户的内容" />
              </Form.Item>

              {watchedScene === "off-hours" ? (
                <Row gutter={14}>
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
                    <Form.Item
                      label="工作开始"
                      name="workStart"
                      rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "格式 HH:mm" }]}
                    >
                      <Input placeholder="09:00" />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item
                      label="工作结束"
                      name="workEnd"
                      rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: "格式 HH:mm" }]}
                    >
                      <Input placeholder="22:00" />
                    </Form.Item>
                  </Col>
                </Row>
              ) : null}

              <Form.List name="buttons">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <div className="panel-label-row">
                      <Typography.Text strong>内联按钮</Typography.Text>
                      <Button icon={<PlusOutlined />} onClick={() => add({ text: "", url: "" })}>
                        添加按钮
                      </Button>
                    </div>
                    {fields.map(({ key, ...field }) => (
                      <Row gutter={10} key={key} align="middle">
                        <Col xs={24} md={9}>
                          <Form.Item
                            {...field}
                            name={[field.name, "text"]}
                            rules={[{ required: true, message: "按钮文字必填" }]}
                          >
                            <Input placeholder="按钮文字" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={13}>
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

              <Row gutter={14} style={{ marginTop: 18 }}>
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
                <Button type="primary" htmlType="submit" size="large" loading={saving}>
                  保存模板
                </Button>
                {selectedTemplate ? (
                  <Popconfirm title="确认删除该模板？" onConfirm={removeTemplate}>
                    <Button danger size="large">
                      删除
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            </Form>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
