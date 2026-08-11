import Loading from "@/components/loading";
import { SettingCardLabel, SettingCardShortTextInput, SettingCardSwitch } from "@/components/admin/SettingCard";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { updateSettingsWithToast, useSettings } from "@/lib/api";
import { Badge, Flex, Switch, Table, Text } from "@radix-ui/themes";
import { Bell, ShieldCheck } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface UnlockQualityTask {
  id: number;
  name: string;
  clients: string[];
  default_on: boolean;
  enabled: boolean;
  service: string;
  interval: number;
  verify_interval: number;
  sample_count: number;
  timeout_ms: number;
  control_enabled: boolean;
  control_dns: string;
  fixed_enabled: boolean;
  fixed_address: string;
  notifications_enabled: boolean;
}

const UnlockNotificationPage = () => {
  const { call } = useRPC2Call();
  const { t } = useTranslation();
  const { settings, loading: settingsLoading, error } = useSettings();
  const [tasks, setTasks] = React.useState<UnlockQualityTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingID, setSavingID] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    try {
      const result = await call<undefined, UnlockQualityTask[]>("admin:getUnlockQualityTasks");
      setTasks(Array.isArray(result) ? result : []);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "读取线路任务失败");
    } finally {
      setLoading(false);
    }
  }, [call]);

  React.useEffect(() => { load(); }, [load]);

  if (loading || settingsLoading) return <Loading />;
  if (error) return <Text color="red">{error}</Text>;

  const toggleTask = async (task: UnlockQualityTask, enabled: boolean) => {
    setSavingID(task.id);
    try {
      await call("admin:editUnlockQualityTask", {
        ...task,
        notifications_enabled: enabled,
      });
      setTasks((current) => current.map((item) =>
        item.id === task.id ? { ...item, notifications_enabled: enabled } : item
      ));
      toast.success(`${task.name} 通知已${enabled ? "开启" : "关闭"}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setSavingID(null);
    }
  };

  return (
    <Flex direction="column" gap="4" className="p-1 md:p-4">
      <Flex align="center" gap="2">
        <ShieldCheck size={22} />
        <div>
          <Text as="div" size="5" weight="bold">线路通知</Text>
          <Text as="div" size="2" color="gray">
            总开关控制全部线路任务；任务开关只影响对应服务，检测、评分和网页展示不会停止。
          </Text>
        </div>
      </Flex>

      <SettingCardLabel>全局策略</SettingCardLabel>
      <SettingCardSwitch
        title="解锁线路异常与恢复通知"
        description="关闭后所有线路任务都不发送状态消息，但各任务的独立开关会保留。"
        defaultChecked={settings.unlock_quality_notification_enabled !== false}
        onChange={(checked) => updateSettingsWithToast(
          { unlock_quality_notification_enabled: checked },
          t,
        )}
      />
      <SettingCardShortTextInput
        type="number"
        min={1}
        max={10}
        title="连续确认轮数"
        description="连续异常或连续恢复达到该轮数才通知，推荐 2–3 轮。"
        defaultValue={settings.unlock_quality_notification_consecutive_rounds ?? 2}
        OnSave={async (value) => {
          const rounds = Number(value);
          if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
            toast.error("请输入 1–10 之间的整数");
            return;
          }
          await updateSettingsWithToast(
            { unlock_quality_notification_consecutive_rounds: rounds },
            t,
          );
        }}
      />

      <SettingCardLabel>任务开关</SettingCardLabel>
      {tasks.length === 0 ? (
        <Text color="gray">暂无解锁线路任务。</Text>
      ) : (
        <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--gray-a5)" }}>
          <Table.Root variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>任务</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>服务</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>检测状态</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">发送通知</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {tasks.map((task) => (
                <Table.Row key={task.id}>
                  <Table.RowHeaderCell>
                    <Flex align="center" gap="2"><Bell size={15} />{task.name}</Flex>
                  </Table.RowHeaderCell>
                  <Table.Cell>{task.service === "chatgpt" ? "ChatGPT" : task.service}</Table.Cell>
                  <Table.Cell>
                    <Badge color={task.enabled ? "green" : "gray"}>
                      {task.enabled ? "运行中" : "已停用"}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Switch
                      checked={task.notifications_enabled}
                      disabled={savingID === task.id}
                      onCheckedChange={(checked) => toggleTask(task, checked)}
                      aria-label={`${task.name} 通知`}
                    />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </div>
      )}
    </Flex>
  );
};

export default UnlockNotificationPage;
