import Loading from "@/components/loading";
import NodeSelectorDialog from "@/components/NodeSelectorDialog";
import {
  NodeDetailsProvider,
  useNodeDetails,
} from "@/contexts/NodeDetailsContext";
import { useRPC2Call } from "@/contexts/RPC2Context";
import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  Dialog,
  Flex,
  Grid,
  IconButton,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  Activity,
  Database,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";

interface CatalogOption {
  code: string;
  name: string;
}

interface TCPQualityCatalog {
  revision: string;
  generated_at: string;
  last_synced_at: string;
  provinces: CatalogOption[];
  isps: CatalogOption[];
  ip_versions: number[];
  target_count: number;
}

interface PingTask {
  id: number;
  name: string;
  type: string;
}

interface TCPQualityTask {
  id?: number;
  name: string;
  clients: string[];
  default_on: boolean;
  enabled: boolean;
  interval: number;
  province_codes: string[];
  isp_codes: string[];
  ip_versions: string[];
  icmp_task_ids: string[];
  standard_packets: number;
  large_enabled: boolean;
  large_packets: number;
  delay_ms: number;
  timeout_ms: number;
}

const emptyTask = (): TCPQualityTask => ({
  name: "",
  clients: [],
  default_on: false,
  enabled: true,
  interval: 900,
  province_codes: [],
  isp_codes: ["ct", "cu", "cm"],
  ip_versions: ["4"],
  icmp_task_ids: [],
  standard_packets: 30,
  large_enabled: false,
  large_packets: 30,
  delay_ms: 200,
  timeout_ms: 3000,
});

function minimumInterval(packetCount: number) {
  if (packetCount <= 1000) return 900;
  if (packetCount <= 10000) return 3600;
  return 21600;
}

function minutesLabel(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
  return `${seconds / 60} 分钟`;
}

const TCPQualityPage = () => (
  <NodeDetailsProvider>
    <TCPQualityPageInner />
  </NodeDetailsProvider>
);

const TCPQualityPageInner = () => {
  const { call } = useRPC2Call();
  const { nodeDetail, isLoading: nodesLoading, error: nodeError } =
    useNodeDetails();
  const [catalog, setCatalog] = React.useState<TCPQualityCatalog | null>(null);
  const [tasks, setTasks] = React.useState<TCPQualityTask[]>([]);
  const [pingTasks, setPingTasks] = React.useState<PingTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshingCatalog, setRefreshingCatalog] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<TCPQualityTask>(emptyTask());
  const [saving, setSaving] = React.useState(false);
  const [deletingID, setDeletingID] = React.useState<number | null>(null);
  const [runningID, setRunningID] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [catalogResult, taskResult, pingResponse] = await Promise.all([
        call<undefined, TCPQualityCatalog>("admin:getTCPQualityCatalog"),
        call<undefined, TCPQualityTask[]>("admin:getTCPQualityTasks"),
        fetch("/api/admin/ping/").then((response) => {
          if (!response.ok) throw new Error("读取延迟任务失败");
          return response.json();
        }),
      ]);
      setCatalog(catalogResult);
      setTasks(Array.isArray(taskResult) ? taskResult : []);
      setPingTasks(
        Array.isArray(pingResponse?.data)
          ? pingResponse.data.filter((item: PingTask) => item.type === "icmp")
          : [],
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取 TCP 质量配置失败");
    } finally {
      setLoading(false);
    }
  }, [call]);

  React.useEffect(() => {
    load();
  }, [load]);

  const selectedTargetCount =
    form.province_codes.length *
    form.isp_codes.length *
    form.ip_versions.length;
  const estimatedPackets =
    selectedTargetCount *
    (form.standard_packets +
      (form.large_enabled ? form.large_packets : 0));
  const requiredInterval = minimumInterval(estimatedPackets);

  const openAdd = () => {
    const next = emptyTask();
    if (catalog?.provinces[0]) {
      next.province_codes = [catalog.provinces[0].code];
    }
    setForm(next);
    setFormOpen(true);
  };

  const openEdit = (task: TCPQualityTask) => {
    setForm({
      ...emptyTask(),
      ...task,
      clients: [...(task.clients || [])],
      province_codes: [...(task.province_codes || [])],
      isp_codes: [...(task.isp_codes || [])],
      ip_versions: [...(task.ip_versions || [])],
      icmp_task_ids: [...(task.icmp_task_ids || [])],
    });
    setFormOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("请输入任务名称");
      return;
    }
    if (!form.default_on && form.clients.length === 0) {
      toast.error("请至少选择一个执行节点");
      return;
    }
    if (selectedTargetCount === 0) {
      toast.error("请至少选择一个省份、运营商和 IP 版本");
      return;
    }
    const payload = {
      ...form,
      interval: Math.max(form.interval, requiredInterval),
    };
    setSaving(true);
    try {
      await call(
        form.id ? "admin:editTCPQualityTask" : "admin:addTCPQualityTask",
        payload,
      );
      toast.success(form.id ? "TCP 质量任务已更新" : "TCP 质量任务已创建");
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    setDeletingID(id);
    try {
      await call("admin:deleteTCPQualityTasks", { id: [id] });
      toast.success("TCP 质量任务已删除");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingID(null);
    }
  };

  const refreshCatalog = async () => {
    setRefreshingCatalog(true);
    try {
      const result = await call<undefined, TCPQualityCatalog>(
        "admin:refreshTCPQualityCatalog",
      );
      setCatalog(result);
      toast.success("国内测试节点目录已更新");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "目录更新失败");
    } finally {
      setRefreshingCatalog(false);
    }
  };

  const runNow = async (id: number) => {
    setRunningID(id);
    try {
      await call("admin:runTCPQualityTaskNow", { id });
      toast.success("检测任务已下发；同一节点上的重叠运行会自动跳过");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务下发失败");
    } finally {
      setRunningID(null);
    }
  };

  if (loading || nodesLoading) return <Loading />;
  if (nodeError) return <div className="p-4">{nodeError}</div>;

  return (
    <Flex direction="column" gap="4" className="p-4">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <div>
          <Text as="div" size="6" weight="bold">
            TCP 连接质量
          </Text>
          <Text as="div" size="2" color="gray" mt="1">
            按国内省份与运营商检测 TCP SYN 首包响应，不执行 Speedtest。
          </Text>
        </div>
        <Flex gap="2">
          <Button
            variant="soft"
            onClick={refreshCatalog}
            disabled={refreshingCatalog}
          >
            <RefreshCw size={16} />
            更新节点目录
          </Button>
          <Button onClick={openAdd}>
            <Plus size={16} />
            新建任务
          </Button>
        </Flex>
      </Flex>

      <Callout.Root color="green" variant="surface">
        <Callout.Icon>
          <ShieldCheck size={18} />
        </Callout.Icon>
        <Callout.Text>
          访客结果只显示省份、运营商和 IP 版本。测试目标的 IP、域名与端口只在后端和
          Agent 之间传递，不会进入公开接口。
        </Callout.Text>
      </Callout.Root>

      <Callout.Root color="blue" variant="surface">
        <Callout.Icon>
          <Activity size={18} />
        </Callout.Icon>
        <Callout.Text>
          相同检测周期的 TCP 任务会自动均匀错峰；每个 Agent 同时只运行一个 TCP 或解锁质量任务，避免瞬时抢占节点资源。
        </Callout.Text>
      </Callout.Root>

      <Grid columns={{ initial: "1", sm: "3" }} gap="3">
        <Card>
          <Flex align="center" gap="3">
            <Database size={20} />
            <div>
              <Text as="div" size="1" color="gray">目录版本</Text>
              <Text as="div" weight="bold">{catalog?.revision || "未同步"}</Text>
            </div>
          </Flex>
        </Card>
        <Card>
          <Flex align="center" gap="3">
            <Activity size={20} />
            <div>
              <Text as="div" size="1" color="gray">可选目标</Text>
              <Text as="div" weight="bold">{catalog?.target_count || 0} 个</Text>
            </div>
          </Flex>
        </Card>
        <Card>
          <div>
            <Text as="div" size="1" color="gray">上次同步</Text>
            <Text as="div" weight="bold">
              {catalog?.last_synced_at
                ? new Date(catalog.last_synced_at).toLocaleString()
                : "尚未同步"}
            </Text>
          </div>
        </Card>
      </Grid>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-gray-11">
          尚未创建 TCP 质量任务。
        </div>
      ) : (
        <Grid columns={{ initial: "1", lg: "2" }} gap="3">
          {tasks.map((task) => {
            const targets =
              task.province_codes.length *
              task.isp_codes.length *
              task.ip_versions.length;
            const packets =
              targets *
              (task.standard_packets +
                (task.large_enabled ? task.large_packets : 0));
            return (
              <Card key={task.id}>
                <Flex direction="column" gap="3">
                  <Flex justify="between" align="start" gap="3">
                    <div>
                      <Flex align="center" gap="2">
                        <Text weight="bold" size="4">{task.name}</Text>
                        <Badge color={task.enabled ? "green" : "gray"}>
                          {task.enabled ? "启用" : "暂停"}
                        </Badge>
                        {task.large_enabled && (
                          <Badge color="amber">大小包实验</Badge>
                        )}
                      </Flex>
                      <Text as="div" size="2" color="gray" mt="1">
                        {targets} 个目标 · 每节点约 {packets} 包 · 每{" "}
                        {minutesLabel(task.interval)}
                      </Text>
                    </div>
                    <Flex gap="1">
                      <IconButton
                        variant="soft"
                        color="green"
                        aria-label="立即检测"
                        title="立即检测"
                        disabled={!task.enabled || runningID === task.id}
                        onClick={() => task.id && runNow(task.id)}
                      >
                        <Play size={16} />
                      </IconButton>
                      <IconButton
                        variant="soft"
                        aria-label="编辑任务"
                        onClick={() => openEdit(task)}
                      >
                        <Pencil size={16} />
                      </IconButton>
                      <Dialog.Root>
                        <Dialog.Trigger>
                          <IconButton
                            variant="soft"
                            color="red"
                            aria-label="删除任务"
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Dialog.Trigger>
                        <Dialog.Content maxWidth="420px">
                          <Dialog.Title>删除 TCP 质量任务</Dialog.Title>
                          <Dialog.Description>
                            将同时删除该任务的历史运行与预计算快照，操作不可恢复。
                          </Dialog.Description>
                          <Flex justify="end" gap="2" mt="4">
                            <Dialog.Close><Button variant="soft">取消</Button></Dialog.Close>
                            <Button
                              color="red"
                              disabled={deletingID === task.id}
                              onClick={() => task.id && remove(task.id)}
                            >
                              删除
                            </Button>
                          </Flex>
                        </Dialog.Content>
                      </Dialog.Root>
                    </Flex>
                  </Flex>
                  <Flex gap="2" wrap="wrap">
                    {task.province_codes.map((code) => (
                      <Badge key={code} variant="soft">
                        {catalog?.provinces.find((item) => item.code === code)?.name || code}
                      </Badge>
                    ))}
                    {task.isp_codes.map((code) => (
                      <Badge key={code} color="blue" variant="soft">
                        {catalog?.isps.find((item) => item.code === code)?.name || code}
                      </Badge>
                    ))}
                    {task.ip_versions.map((version) => (
                      <Badge key={version} color="purple" variant="soft">IPv{version}</Badge>
                    ))}
                  </Flex>
                  <Text size="2" color="gray">
                    执行节点 {task.clients.length} 个
                    {task.default_on ? "，新节点默认加入" : ""}
                    {task.icmp_task_ids.length
                      ? `；综合评分引用 ${task.icmp_task_ids.length} 个 ICMP 任务`
                      : "；仅生成 TCP 质量分"}
                  </Text>
                </Flex>
              </Card>
            );
          })}
        </Grid>
      )}

      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Content maxWidth="760px" className="max-h-[88vh] overflow-y-auto">
          <Dialog.Title>{form.id ? "编辑 TCP 质量任务" : "新建 TCP 质量任务"}</Dialog.Title>
          <Dialog.Description>
            “首次响应丢失率”对应 TcpQuality 所称的“重传率”，不是操作系统 TCP
            栈统计的真实重传次数。
          </Dialog.Description>
          <form onSubmit={save}>
            <Flex direction="column" gap="4" mt="4">
              <Grid columns={{ initial: "1", sm: "2" }} gap="3">
                <Field label="任务名称">
                  <TextField.Root
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </Field>
                <Field label="执行节点">
                  <Flex align="center" gap="2">
                    <NodeSelectorDialog
                      value={form.clients}
                      onChange={(clients) =>
                        setForm((current) => ({ ...current, clients }))
                      }
                    />
                    <Text size="2" color="gray">
                      已选 {form.clients.length}/{nodeDetail.length}
                    </Text>
                  </Flex>
                </Field>
              </Grid>

              <ToggleRow
                checked={form.enabled}
                onCheckedChange={(enabled) =>
                  setForm((current) => ({ ...current, enabled }))
                }
                title="启用任务"
                description="关闭后保留历史数据，但不再下发新检测。"
              />
              <ToggleRow
                checked={form.default_on}
                onCheckedChange={(default_on) =>
                  setForm((current) => ({ ...current, default_on }))
                }
                title="新节点默认加入"
                description="只影响以后新接入的节点，不自动改动现有选择。"
              />

              <ChoiceGroup
                title="省份"
                options={catalog?.provinces || []}
                values={form.province_codes}
                onChange={(province_codes) =>
                  setForm((current) => ({ ...current, province_codes }))
                }
              />
              <ChoiceGroup
                title="运营商"
                options={catalog?.isps || []}
                values={form.isp_codes}
                onChange={(isp_codes) =>
                  setForm((current) => ({ ...current, isp_codes }))
                }
              />
              <ChoiceGroup
                title="IP 版本"
                options={(catalog?.ip_versions || []).map((version) => ({
                  code: String(version),
                  name: `IPv${version}`,
                }))}
                values={form.ip_versions}
                onChange={(ip_versions) =>
                  setForm((current) => ({ ...current, ip_versions }))
                }
              />

              <Grid columns={{ initial: "1", sm: "3" }} gap="3">
                <NumberField
                  label="标准包数量"
                  value={form.standard_packets}
                  min={10}
                  max={200}
                  onChange={(standard_packets) =>
                    setForm((current) => ({ ...current, standard_packets }))
                  }
                />
                <NumberField
                  label="包间隔（毫秒）"
                  value={form.delay_ms}
                  min={50}
                  max={5000}
                  onChange={(delay_ms) =>
                    setForm((current) => ({ ...current, delay_ms }))
                  }
                />
                <NumberField
                  label="单包超时（毫秒）"
                  value={form.timeout_ms}
                  min={500}
                  max={15000}
                  onChange={(timeout_ms) =>
                    setForm((current) => ({ ...current, timeout_ms }))
                  }
                />
              </Grid>

              <ToggleRow
                checked={form.large_enabled}
                onCheckedChange={(large_enabled) =>
                  setForm((current) => ({ ...current, large_enabled }))
                }
                title="启用大小包实验"
                description="使用 120–480B 与 900–1200B SYN 负载组合，只作为实验性辅助指标。"
              />
              {form.large_enabled && (
                <NumberField
                  label="大小包实验数量"
                  value={form.large_packets}
                  min={10}
                  max={100}
                  onChange={(large_packets) =>
                    setForm((current) => ({ ...current, large_packets }))
                  }
                />
              )}

              <Field label="综合评分引用的 ICMP 任务">
                <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
                  {pingTasks.length === 0 ? (
                    <Text size="2" color="gray">没有可选的 ICMP 延迟任务。</Text>
                  ) : pingTasks.map((task) => {
                    const id = String(task.id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.icmp_task_ids.includes(id)}
                          onCheckedChange={() =>
                            setForm((current) => ({
                              ...current,
                              icmp_task_ids: toggleValue(current.icmp_task_ids, id),
                            }))
                          }
                        />
                        {task.name}
                      </label>
                    );
                  })}
                </div>
              </Field>

              <Grid columns={{ initial: "1", sm: "2" }} gap="3">
                <NumberField
                  label="调度周期（分钟）"
                  value={Math.round(form.interval / 60)}
                  min={15}
                  max={10080}
                  onChange={(minutes) =>
                    setForm((current) => ({ ...current, interval: minutes * 60 }))
                  }
                />
                <div className="rounded-md border p-3">
                  <Text as="div" size="2" weight="bold">资源估算</Text>
                  <Text as="div" size="2" color="gray" mt="1">
                    {selectedTargetCount} 个目标，每节点约 {estimatedPackets} 包。
                  </Text>
                  <Text as="div" size="2" color={form.interval < requiredInterval ? "red" : "green"}>
                    最低周期 {minutesLabel(requiredInterval)}
                    {form.interval < requiredInterval ? "，保存时会自动调整" : ""}
                  </Text>
                </div>
              </Grid>

              <Flex justify="end" gap="2">
                <Dialog.Close><Button type="button" variant="soft">取消</Button></Dialog.Close>
                <Button type="submit" disabled={saving}>
                  {saving ? "保存中…" : "保存任务"}
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-2">
    <Text size="2" weight="bold">{label}</Text>
    {children}
  </label>
);

const NumberField = ({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) => (
  <Field label={label}>
    <TextField.Root
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </Field>
);

const ToggleRow = ({
  checked,
  onCheckedChange,
  title,
  description,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title: string;
  description: string;
}) => (
  <Flex justify="between" align="center" gap="3" className="rounded-md border p-3">
    <div>
      <Text as="div" size="2" weight="bold">{title}</Text>
      <Text as="div" size="1" color="gray">{description}</Text>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </Flex>
);

const ChoiceGroup = ({
  title,
  options,
  values,
  onChange,
}: {
  title: string;
  options: CatalogOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) => (
  <Field label={title}>
    <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-4 lg:grid-cols-6">
      {options.map((option) => (
        <label key={option.code} className="flex min-h-8 items-center gap-2 text-sm">
          <Checkbox
            checked={values.includes(option.code)}
            onCheckedChange={() => onChange(toggleValue(values, option.code))}
          />
          <span>{option.name}</span>
        </label>
      ))}
    </div>
  </Field>
);

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export default TCPQualityPage;
