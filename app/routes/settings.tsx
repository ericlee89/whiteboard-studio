import { useSearchParams } from "react-router";
import { useT } from "@agent-native/core/client/i18n";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell";
import {
  AccountSettingsCard,
  SettingsTabsPage,
  useAgentSettingsTabs,
} from "../components/agent-native/toolkit/app/settings";

import { APP_TITLE } from "@/lib/app-config";

import changelog from "../../CHANGELOG.md?raw";

export function meta() {
  return [{ title: `Settings - ${APP_TITLE}` }];
}

/**
 * 只留两个入口：模型（agent）和密钥（keys）。
 *
 * 这套框架的设置页原本还带集成、MCP、用量、组织、工作区、更新日志，
 * 对「填个 Key 就能出片」的使用者来说全是干扰。想看全部时加 ?all=1。
 */
const HIDDEN_TABS = [
  "general",
  "account",
  "team",
  "whats-new",
  "integrations",
  "mcp",
  "usage",
  "organization",
  "workspace",
  "labs",
];

export default function SettingsRoute() {
  const t = useT();
  const agentSettingsTabs = useAgentSettingsTabs();
  const [params] = useSearchParams();
  const showAll = params.get("all") === "1";
  useSetPageTitle(t("settings.title"));

  return (
    <SettingsTabsPage
      account={<AccountSettingsCard />}
      extraTabs={agentSettingsTabs}
      hideTabs={showAll ? [] : HIDDEN_TABS}
      whatsNewMarkdown={changelog}
    />
  );
}
