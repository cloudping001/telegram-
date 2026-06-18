import type { BotRecord, RoutingRuleRecord, SystemSettingsRecord, TemplateRecord } from "./types";

export const botSeed: BotRecord[] = [
  {
    id: "bot-main",
    name: "客服双向机器人",
    username: "@support_bridge_bot",
    status: "online",
    supportGroup: "",
    webhookPath: "/api/telegram/webhook/main",
    latestSync: "2026-06-18 00:08"
  }
];

export const routingSeed: RoutingRuleRecord[] = [
  {
    id: "route-personal-support",
    scene: "个人客服模式",
    source: "private chat",
    target: "support:personal",
    fallback: "转入客服配置中的个人 Telegram ID",
    enabled: true
  }
];

export const templateSeed: TemplateRecord[] = [
  {
    id: "tpl-welcome",
    name: "欢迎语",
    scene: "first-contact",
    content: "你好，欢迎咨询。请直接发送你的问题，我会尽快处理。",
    imageUrl: "",
    parseMode: "plain",
    isDefault: true,
    buttons: [],
    enabled: true,
    updatedAt: "2026-06-17 23:16"
  },
  {
    id: "tpl-offline",
    name: "离线回复",
    scene: "off-hours",
    content: "当前人工客服不在线，你的消息已收到，我会在工作时间尽快回复。",
    imageUrl: "",
    parseMode: "plain",
    isDefault: true,
    buttons: [],
    timezone: "Asia/Singapore",
    workStart: "09:00",
    workEnd: "22:00",
    enabled: true,
    updatedAt: "2026-06-17 21:42"
  }
];

export const settingsSeed: SystemSettingsRecord = {
  defaultLocale: "zh-CN",
  retentionDays: 90,
  uploadPolicy: "r2-sync",
  queueStrategy: "backoff",
  accessMode: "cf-access",
  timezone: "Asia/Singapore",
  workStart: "09:00",
  workEnd: "22:00"
};
