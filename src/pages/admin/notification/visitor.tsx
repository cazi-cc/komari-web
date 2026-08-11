import Loading from "@/components/loading";
import { SettingCard, SettingCardLabel } from "@/components/admin/SettingCard";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { Button, Flex, Switch, Text, TextArea, TextField } from "@radix-ui/themes";
import { Save, ShieldCheck } from "lucide-react";
import React from "react";
import { toast } from "sonner";

interface VisitorSecuritySettings {
  notification_enabled: boolean;
  notification_cooldown_minutes: number;
  notification_whitelist: string;
  ip_blocklist: string;
}

const VisitorNotificationPage = () => {
  const { call } = useRPC2Call();
  const [settings, setSettings] = React.useState<VisitorSecuritySettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    call<undefined, VisitorSecuritySettings>("admin:getVisitorSecuritySettings")
      .then(setSettings)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "读取访客通知设置失败"));
  }, [call]);

  if (!settings && !error) return <Loading />;
  if (error || !settings) return <Text color="red">{error || "读取设置失败"}</Text>;

  const save = async () => {
    setSaving(true);
    try {
      const result = await call<VisitorSecuritySettings, VisitorSecuritySettings>(
        "admin:updateVisitorSecuritySettings",
        settings,
      );
      setSettings(result);
      toast.success("访客通知与访问控制设置已保存");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Flex direction="column" gap="4" className="p-1 md:p-4">
      <div>
        <Text as="div" size="5" weight="bold">访客通知</Text>
        <Text as="div" size="2" color="gray">
          控制新访客提醒、重复提醒间隔和 IP 规则。IP 定位只是数据库估算，不能精确到住址。
        </Text>
      </div>

      <SettingCardLabel>提醒规则</SettingCardLabel>
      <SettingCard
        title="新访客通知"
        description="仅匿名公网访客会触发；已登录管理员、私有地址和免通知名单会被忽略。"
      >
        <SettingCard.Action>
          <Switch
            checked={settings.notification_enabled}
            onCheckedChange={(notification_enabled) =>
              setSettings((current) => current && ({ ...current, notification_enabled }))
            }
          />
        </SettingCard.Action>
      </SettingCard>
      <SettingCard
        title="同一 IP 提醒间隔"
        description="默认 1440 分钟，即同一 IP 在 24 小时内只提醒一次。允许 1–10080 分钟。"
      >
        <TextField.Root
          type="number"
          min={1}
          max={10080}
          value={settings.notification_cooldown_minutes}
          onChange={(event) => setSettings({
            ...settings,
            notification_cooldown_minutes: Number(event.target.value),
          })}
          className="mt-2 w-full"
        />
      </SettingCard>

      <SettingCardLabel>IP 规则</SettingCardLabel>
      <SettingCard
        title="免通知 IP 白名单"
        description="名单内访客仍可访问并记录，但不会发送新访客通知。支持单个 IPv4、IPv6 或 CIDR，每行一条。"
      >
        <TextArea
          value={settings.notification_whitelist}
          onChange={(event) => setSettings({ ...settings, notification_whitelist: event.target.value })}
          placeholder={"例如：203.0.113.8\n2001:db8::/32"}
          resize="vertical"
          className="mt-2 min-h-32 w-full font-mono"
        />
      </SettingCard>
      <SettingCard
        title="封禁 IP 名单"
        description="名单内地址无法访问网站。保存时会阻止把当前管理员 IP 加入名单，避免误锁后台。"
      >
        <TextArea
          value={settings.ip_blocklist}
          onChange={(event) => setSettings({ ...settings, ip_blocklist: event.target.value })}
          placeholder={"例如：198.51.100.25\n2001:db8:1::/48"}
          resize="vertical"
          className="mt-2 min-h-32 w-full font-mono"
        />
      </SettingCard>

      <Flex justify="end">
        <Button onClick={save} disabled={saving}>
          {saving ? <ShieldCheck size={16} /> : <Save size={16} />}
          {saving ? "正在保存" : "保存设置"}
        </Button>
      </Flex>
    </Flex>
  );
};

export default VisitorNotificationPage;
