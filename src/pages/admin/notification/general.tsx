import Loading from "@/components/loading";
import {
  SettingCardLabel,
  SettingCardShortTextInput,
  SettingCardSwitch,
} from "@/components/admin/SettingCard";
import { updateSettingsWithToast, useSettings } from "@/lib/api";
import { Callout, Flex, Text } from "@radix-ui/themes";
import { BellRing, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const GeneralNotification = () => {
  const { t } = useTranslation();
  const { settings, loading, error } = useSettings();

  if (loading) return <Loading />;
  if (error) return <Text color="red">{error}</Text>;

  const save = (values: Record<string, unknown>) =>
    updateSettingsWithToast(values, t);
  const enabledByDefault = (key: string) => settings[key] !== false;

  return (
    <Flex direction="column" gap="4" className="p-1 md:p-4">
      <Flex align="center" gap="2">
        <BellRing size={22} />
        <div>
          <Text as="div" size="5" weight="bold">通知总览</Text>
          <Text as="div" size="2" color="gray">
            集中控制每一种通知；关闭某类通知不会删除其节点、任务或历史配置。
          </Text>
        </div>
      </Flex>

      {!settings.notification_enabled && (
        <Callout.Root color="amber" variant="surface">
          <Callout.Icon><Info size={18} /></Callout.Icon>
          <Callout.Text>
            通知总开关当前已关闭。下列类型开关会被保留，但任何消息都不会发送。
          </Callout.Text>
        </Callout.Root>
      )}

      <SettingCardLabel>账户与费用</SettingCardLabel>
      <SettingCardSwitch
        title="管理员登录"
        description="有新的后台登录会话时提醒，并附带来源 IP、归属地和设备信息。"
        defaultChecked={enabledByDefault("login_notification")}
        onChange={(checked) => save({ login_notification: checked })}
      />
      <SettingCardSwitch
        title="节点到期"
        description="节点临近到期时发送提醒。"
        defaultChecked={enabledByDefault("expire_notification_enabled")}
        onChange={(checked) => save({ expire_notification_enabled: checked })}
      />
      <SettingCardShortTextInput
        type="number"
        min={0}
        max={365}
        title="到期提前提醒天数"
        description="每天检查一次；0 表示仅在到期当天提醒。"
        defaultValue={settings.expire_notification_lead_days ?? 7}
        OnSave={async (value) => {
          const days = Number(value);
          if (!Number.isInteger(days) || days < 0 || days > 365) {
            toast.error("请输入 0–365 之间的整数");
            return;
          }
          await save({ expire_notification_lead_days: days });
        }}
      />
      <SettingCardSwitch
        title="自动续费成功"
        description="Komari 自动延长节点到期时间后发送结果。"
        defaultChecked={enabledByDefault("renewal_notification_enabled")}
        onChange={(checked) => save({ renewal_notification_enabled: checked })}
      />

      <SettingCardLabel>节点状态与资源</SettingCardLabel>
      <SettingCardSwitch
        title="离线与恢复在线"
        description="统一控制节点离线告警和随后恢复在线的消息；节点范围和宽限期在“离线通知”中配置。"
        defaultChecked={enabledByDefault("node_status_notification_enabled")}
        onChange={(checked) => save({ node_status_notification_enabled: checked })}
      />
      <SettingCardSwitch
        title="负载告警"
        description="统一控制 CPU、内存、负载等阈值告警；具体规则在“负载通知”中配置。"
        defaultChecked={enabledByDefault("load_notification_enabled")}
        onChange={(checked) => save({ load_notification_enabled: checked })}
      />
      <SettingCardSwitch
        title="流量用量阈值"
        description="节点流量使用率跨过设定档位时提醒。"
        defaultChecked={enabledByDefault("traffic_notification_enabled")}
        onChange={(checked) => save({ traffic_notification_enabled: checked })}
      />
      <SettingCardShortTextInput
        type="number"
        min={1}
        max={100}
        step={1}
        title="流量首次提醒阈值（%）"
        description="达到该百分比后首次提醒，之后每增加 5% 再提醒一次。"
        defaultValue={settings.traffic_limit_percentage ?? 80}
        OnSave={async (value) => {
          const percentage = Number(value);
          if (!Number.isFinite(percentage) || percentage < 1 || percentage > 100) {
            toast.error("请输入 1–100 之间的百分比");
            return;
          }
          await save({ traffic_limit_percentage: percentage });
        }}
      />
      <SettingCardSwitch
        title="流量日报、周报和月报"
        description="统一控制定时流量汇总；报告周期和节点范围在“流量报告”中配置。"
        defaultChecked={enabledByDefault("traffic_report_notification_enabled")}
        onChange={(checked) => save({ traffic_report_notification_enabled: checked })}
      />

      <SettingCardLabel>访问与线路</SettingCardLabel>
      <SettingCardSwitch
        title="新访客"
        description="新 IP 首次访问时提醒；管理员、私有地址和白名单不会触发。"
        defaultChecked={Boolean(settings.visitor_notification_enabled)}
        onChange={(checked) => save({ visitor_notification_enabled: checked })}
      />
      <SettingCardSwitch
        title="解锁线路异常与恢复"
        description="所有 ChatGPT 等解锁线路任务的总开关；每个任务仍可在“线路通知”中单独关闭。"
        defaultChecked={enabledByDefault("unlock_quality_notification_enabled")}
        onChange={(checked) => save({ unlock_quality_notification_enabled: checked })}
      />
      <SettingCardShortTextInput
        type="number"
        min={1}
        max={10}
        title="线路状态连续确认轮数"
        description="连续达到指定轮数才发送异常或恢复消息。轮数越高，越不容易因偶发故障误报。"
        defaultValue={settings.unlock_quality_notification_consecutive_rounds ?? 2}
        OnSave={async (value) => {
          const rounds = Number(value);
          if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
            toast.error("请输入 1–10 之间的整数");
            return;
          }
          await save({ unlock_quality_notification_consecutive_rounds: rounds });
        }}
      />
    </Flex>
  );
};

export default GeneralNotification;
