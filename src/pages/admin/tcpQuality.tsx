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
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";
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
  targets: CatalogTarget[];
}

interface CatalogTarget {
  key: string;
  address: string;
  port: number;
  province: string;
  province_code: string;
  isp: string;
  isp_code: string;
  ip_version: number;
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
  icmp_interval: number;
  standard_packets: number;
  large_enabled: boolean;
  large_packets: number;
  delay_ms: number;
  timeout_ms: number;
}

interface DiagnosticResult {
  target_key: string;
  mode: string;
  samples_sent: number;
  samples_received: number;
  loss_ratio: number;
  p50_latency_ms?: number;
  p95_latency_ms?: number;
  error_code?: string;
}

interface DiagnosticRun {
  client: string;
  finished_at: string;
  results: DiagnosticResult[];
}

interface TCPQualityDiagnostic {
  id: number;
  name: string;
  target_key: string;
  province: string;
  isp: string;
  ip_version: string;
  clients: string[];
  large_enabled: boolean;
  created_at: string;
  expires_at: string;
  runs: DiagnosticRun[];
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
  icmp_interval: 60,
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
  const [diagnostics, setDiagnostics] = React.useState<TCPQualityDiagnostic[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshingCatalog, setRefreshingCatalog] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<TCPQualityTask>(emptyTask());
  const [saving, setSaving] = React.useState(false);
  const [deletingID, setDeletingID] = React.useState<number | null>(null);
  const [runningID, setRunningID] = React.useState<number | null>(null);
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [catalogProvince, setCatalogProvince] = React.useState("all");
  const [catalogISP, setCatalogISP] = React.useState("all");
  const [catalogIPVersion, setCatalogIPVersion] = React.useState("all");
  const [diagnosticOpen, setDiagnosticOpen] = React.useState(false);
  const [diagnosticTarget, setDiagnosticTarget] = React.useState<CatalogTarget | null>(null);
  const [diagnosticClients, setDiagnosticClients] = React.useState<string[]>([]);
  const [diagnosticLargeEnabled, setDiagnosticLargeEnabled] = React.useState(false);
  const [diagnosticRunning, setDiagnosticRunning] = React.useState(false);
  const [selectedCatalogKeys, setSelectedCatalogKeys] = React.useState<string[]>([]);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchClients, setBatchClients] = React.useState<string[]>([]);
  const [batchDefaultOn, setBatchDefaultOn] = React.useState(false);
  const [batchICMPInterval, setBatchICMPInterval] = React.useState(60);
  const [batchTCPIntervalMinutes, setBatchTCPIntervalMinutes] = React.useState(15);
  const [batchSaving, setBatchSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [catalogResult, taskResult, diagnosticResult] = await Promise.all([
        call<undefined, TCPQualityCatalog>("admin:getTCPQualityCatalog"),
        call<undefined, TCPQualityTask[]>("admin:getTCPQualityTasks"),
        call<undefined, TCPQualityDiagnostic[]>("admin:getTCPQualityDiagnostics"),
      ]);
      setCatalog(catalogResult);
      setTasks(Array.isArray(taskResult) ? taskResult : []);
      setDiagnostics(Array.isArray(diagnosticResult) ? diagnosticResult : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "读取 TCP 质量配置失败");
    } finally {
      setLoading(false);
    }
  }, [call]);

  React.useEffect(() => {
    load();
  }, [load]);

  const selectedTarget = (catalog?.targets || []).find(
    (target) =>
      form.province_codes.length === 1 &&
      form.isp_codes.length === 1 &&
      form.ip_versions.length === 1 &&
      target.province_code === form.province_codes[0] &&
      target.isp_code === form.isp_codes[0] &&
      String(target.ip_version) === form.ip_versions[0],
  );
  const configuredTargetKeys = new Set(
    tasks
      .filter((task) => task.province_codes.length === 1 && task.isp_codes.length === 1 && task.ip_versions.length === 1)
      .map((task) => `${task.province_codes[0]}-${task.isp_codes[0]}-v${task.ip_versions[0]}`),
  );
  const selectedTargetCount = selectedTarget ? 1 : 0;
  const estimatedPackets =
    selectedTargetCount *
    (form.standard_packets +
      (form.large_enabled ? form.large_packets : 0));
  const requiredInterval = minimumInterval(estimatedPackets);

  const openAdd = () => {
    const next = emptyTask();
    if (catalog?.targets[0]) {
      const target = catalog.targets[0];
      next.province_codes = [target.province_code];
      next.isp_codes = [target.isp_code];
      next.ip_versions = [String(target.ip_version)];
      next.name = `${target.province}${target.isp}v${target.ip_version}`;
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
      toast.error("请选择一个当前可用的 TCP 节点目录目标");
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

  const selectCatalogTarget = (target: CatalogTarget) => {
    setForm((current) => ({
      ...current,
      name: current.name.trim() ? current.name : `${target.province}${target.isp}v${target.ip_version}`,
      province_codes: [target.province_code],
      isp_codes: [target.isp_code],
      ip_versions: [String(target.ip_version)],
    }));
  };

  const openAddForTarget = (target: CatalogTarget) => {
    const next = emptyTask();
    next.name = `${target.province}${target.isp}v${target.ip_version}`;
    next.province_codes = [target.province_code];
    next.isp_codes = [target.isp_code];
    next.ip_versions = [String(target.ip_version)];
    setForm(next);
    setFormOpen(true);
  };

  const nodeName = (uuid: string) =>
    nodeDetail.find((node) => node.uuid === uuid)?.name || uuid;

  const targetEndpoint = (target: CatalogTarget) =>
    `${target.ip_version === 6 ? `[${target.address}]` : target.address}:${target.port}`;

  const filteredCatalogTargets = (catalog?.targets || []).filter((target) => {
    if (catalogProvince !== "all" && target.province_code !== catalogProvince) return false;
    if (catalogISP !== "all" && target.isp_code !== catalogISP) return false;
    if (catalogIPVersion !== "all" && String(target.ip_version) !== catalogIPVersion) return false;
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return true;
    return [target.province, target.isp, `ipv${target.ip_version}`, target.address]
      .some((value) => value.toLowerCase().includes(query));
  });

  const openDiagnostic = (target: CatalogTarget) => {
    setDiagnosticTarget(target);
    setDiagnosticClients([]);
    setDiagnosticLargeEnabled(false);
    setDiagnosticOpen(true);
  };

  const runDiagnostic = async () => {
    if (!diagnosticTarget || diagnosticClients.length === 0) {
      toast.error("请至少选择一个执行节点");
      return;
    }
    setDiagnosticRunning(true);
    try {
      await call("admin:runTCPQualityCatalogDiagnostic", {
        target_key: diagnosticTarget.key,
        clients: diagnosticClients,
        large_enabled: diagnosticLargeEnabled,
      });
      toast.success("独立检测已下发，结果将在节点完成后显示并保留 24 小时");
      setDiagnosticOpen(false);
      window.setTimeout(() => void load(), 2500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "独立检测下发失败");
    } finally {
      setDiagnosticRunning(false);
    }
  };

  const toggleCatalogSelection = (key: string) => {
    setSelectedCatalogKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const createBatchTasks = async () => {
    const targets = (catalog?.targets || []).filter(
      (target) => selectedCatalogKeys.includes(target.key) && !configuredTargetKeys.has(target.key),
    );
    if (targets.length === 0) {
      toast.error("请先勾选至少一个目录目标");
      return;
    }
    if (!batchDefaultOn && batchClients.length === 0) {
      toast.error("请至少选择一个执行节点，或开启新节点默认加入");
      return;
    }
    setBatchSaving(true);
    let created = 0;
    try {
      for (const target of targets) {
        await call("admin:addTCPQualityTask", {
          ...emptyTask(),
          name: `${target.province}${target.isp}v${target.ip_version}`,
          clients: batchClients,
          default_on: batchDefaultOn,
          interval: batchTCPIntervalMinutes * 60,
          icmp_interval: batchICMPInterval,
          province_codes: [target.province_code],
          isp_codes: [target.isp_code],
          ip_versions: [String(target.ip_version)],
        });
        created += 1;
      }
      toast.success(`已创建 ${created} 套 ICMP + TCP 综合任务`);
      setSelectedCatalogKeys([]);
      setBatchOpen(false);
      await load();
    } catch (error) {
      toast.error(`${created ? `已成功创建 ${created} 项；` : ""}${error instanceof Error ? error.message : "批量创建失败"}`);
      if (created) await load();
    } finally {
      setBatchSaving(false);
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
            网络质量
          </Text>
          <Text as="div" size="2" color="gray" mt="1">
            每个目录目标形成一套 ICMP + TCP 综合评分，不执行 Speedtest。
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

      <Flex gap="2" wrap="wrap">
        <Button asChild variant="soft" color="gray">
          <Link to="/admin/ping">基础延迟与可用性</Link>
        </Button>
        <Button variant="solid">TCP 综合任务与节点目录</Button>
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
          ICMP、TCP 与解锁任务共用持久化错峰计划；增删任务只为新任务选择空闲相位，不会把现有任务重新挤到同一时刻。
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
            const targets = 1;
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
                        1 个目录目标 · 每节点约 {packets} 包 · 每{" "}
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
                            TCP 历史与评分快照会删除；自动绑定的 ICMP 任务会保留并降级为普通延迟任务。
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
                      ? `；已自动绑定 ICMP（每 ${task.icmp_interval || 60} 秒）`
                      : "；ICMP 绑定待后端修复"}
                  </Text>
                </Flex>
              </Card>
            );
          })}
        </Grid>
      )}

      <Card>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <div>
              <Text as="div" size="4" weight="bold">TCP 节点目录</Text>
              <Text as="div" size="2" color="gray" mt="1">
                目录由 TcpQuality 上游同步。IP 与端口仅在管理员后台可见。
              </Text>
            </div>
            <Flex align="center" gap="2">
              <Badge variant="soft">{filteredCatalogTargets.length} / {catalog?.target_count || 0}</Badge>
              <Button size="2" disabled={!selectedCatalogKeys.length} onClick={() => setBatchOpen(true)}>
                <Plus size={15} />批量创建（{selectedCatalogKeys.length}）
              </Button>
            </Flex>
          </Flex>
          <Grid columns={{ initial: "1", sm: "2", lg: "4" }} gap="2">
            <TextField.Root
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="搜索地区、运营商或 IP"
            >
              <TextField.Slot><Search size={15} /></TextField.Slot>
            </TextField.Root>
            <select className="h-10 rounded-md border border-gray-6 bg-transparent px-3 text-sm" value={catalogProvince} onChange={(event) => setCatalogProvince(event.target.value)}>
              <option value="all">全部地区</option>
              {(catalog?.provinces || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select className="h-10 rounded-md border border-gray-6 bg-transparent px-3 text-sm" value={catalogISP} onChange={(event) => setCatalogISP(event.target.value)}>
              <option value="all">全部运营商</option>
              {(catalog?.isps || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            <select className="h-10 rounded-md border border-gray-6 bg-transparent px-3 text-sm" value={catalogIPVersion} onChange={(event) => setCatalogIPVersion(event.target.value)}>
              <option value="all">全部 IP 版本</option>
              {(catalog?.ip_versions || []).map((version) => <option key={version} value={String(version)}>IPv{version}</option>)}
            </select>
          </Grid>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-gray-3 text-left text-gray-11">
                <tr>
                  <th className="w-10 px-3 py-2 font-medium" aria-label="选择"></th>
                  <th className="px-3 py-2 font-medium">地区</th>
                  <th className="px-3 py-2 font-medium">运营商</th>
                  <th className="px-3 py-2 font-medium">协议</th>
                  <th className="px-3 py-2 font-medium">目标地址</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalogTargets.map((target) => (
                  <tr key={target.key} className="border-t border-gray-5">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--accent-9)]"
                        checked={selectedCatalogKeys.includes(target.key)}
                        disabled={configuredTargetKeys.has(target.key)}
                        aria-label={`选择 ${target.province}${target.isp} IPv${target.ip_version}`}
                        onChange={() => toggleCatalogSelection(target.key)}
                      />
                    </td>
                    <td className="px-3 py-2">{target.province}</td>
                    <td className="px-3 py-2">{target.isp}</td>
                    <td className="px-3 py-2">IPv{target.ip_version}</td>
                    <td className="px-3 py-2 font-mono text-xs">{targetEndpoint(target)}</td>
                    <td className="px-3 py-2">
                      <Flex justify="end" gap="2">
                        <Button size="1" variant="soft" disabled={configuredTargetKeys.has(target.key)} onClick={() => openAddForTarget(target)}>
                          <Plus size={14} />{configuredTargetKeys.has(target.key) ? "已建任务" : "创建综合任务"}
                        </Button>
                        <Button size="1" variant="soft" color="green" onClick={() => openDiagnostic(target)}>
                          <Play size={14} />独立检测
                        </Button>
                      </Flex>
                    </td>
                  </tr>
                ))}
                {filteredCatalogTargets.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-11">没有符合筛选条件的目标</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="3">
          <Flex justify="between" align="center" gap="3">
            <div>
              <Text as="div" size="4" weight="bold">最近独立检测</Text>
              <Text as="div" size="2" color="gray" mt="1">仅管理员可见，配置与结果自动保留 24 小时。</Text>
            </div>
            <Button variant="soft" size="2" onClick={() => void load()}><RefreshCw size={15} />刷新结果</Button>
          </Flex>
          {diagnostics.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-gray-11">暂无独立检测记录</div>
          ) : diagnostics.map((diagnostic) => (
            <div key={diagnostic.id} className="rounded-md border p-3">
              <Flex justify="between" align="start" gap="3" wrap="wrap">
                <div>
                  <Text as="div" weight="bold">{diagnostic.province || diagnostic.name} · {diagnostic.isp} · IPv{diagnostic.ip_version}</Text>
                  <Text as="div" size="1" color="gray" mt="1">
                    {new Date(diagnostic.created_at).toLocaleString()} · {diagnostic.clients.length} 个节点
                  </Text>
                </div>
                <Badge color={diagnostic.runs.length ? "green" : "amber"}>{diagnostic.runs.length ? "已有结果" : "等待节点返回"}</Badge>
              </Flex>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {diagnostic.runs.map((run) => (
                  <div key={`${run.client}-${run.finished_at}`} className="rounded-md bg-gray-3 p-3 text-sm">
                    <Text as="div" weight="bold">{nodeName(run.client)}</Text>
                    <Text as="div" size="1" color="gray">{new Date(run.finished_at).toLocaleString()}</Text>
                    {run.results.map((result) => (
                      <Text key={`${result.target_key}-${result.mode}`} as="div" size="2" mt="2">
                        {result.mode === "large" ? "大小包" : "标准 SYN"}：首次响应丢失 {(result.loss_ratio * 100).toFixed(1)}% · P50 {result.p50_latency_ms?.toFixed(1) || "--"} ms · P95 {result.p95_latency_ms?.toFixed(1) || "--"} ms
                        {result.error_code ? ` · ${result.error_code}` : ""}
                      </Text>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Flex>
      </Card>

      <Dialog.Root open={batchOpen} onOpenChange={setBatchOpen}>
        <Dialog.Content maxWidth="560px">
          <Dialog.Title>批量创建综合网络任务</Dialog.Title>
          <Dialog.Description>
            已选 {selectedCatalogKeys.length} 个目录目标，将分别创建同等数量的一目标评分任务。
          </Dialog.Description>
          <Flex direction="column" gap="4" mt="4">
            <Field label="执行节点">
              <Flex align="center" gap="2">
                <NodeSelectorDialog value={batchClients} onChange={setBatchClients} />
                <Text size="2" color="gray">已选 {batchClients.length}/{nodeDetail.length}</Text>
              </Flex>
            </Field>
            <ToggleRow
              checked={batchDefaultOn}
              onCheckedChange={setBatchDefaultOn}
              title="新节点默认加入"
              description="只影响以后接入的节点；当前节点仍按上方选择执行。"
            />
            <Grid columns={{ initial: "1", sm: "2" }} gap="3">
              <NumberField label="ICMP 周期（秒）" value={batchICMPInterval} min={5} max={86400} onChange={setBatchICMPInterval} />
              <NumberField label="TCP 周期（分钟）" value={batchTCPIntervalMinutes} min={15} max={10080} onChange={setBatchTCPIntervalMinutes} />
            </Grid>
            <Flex justify="end" gap="2">
              <Dialog.Close><Button variant="soft">取消</Button></Dialog.Close>
              <Button disabled={batchSaving} onClick={createBatchTasks}>{batchSaving ? "创建中…" : "创建任务"}</Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={diagnosticOpen} onOpenChange={setDiagnosticOpen}>
        <Dialog.Content maxWidth="520px">
          <Dialog.Title>独立 TCP 检测</Dialog.Title>
          <Dialog.Description>
            {diagnosticTarget ? `${diagnosticTarget.province} · ${diagnosticTarget.isp} · IPv${diagnosticTarget.ip_version}` : "目录目标"}
          </Dialog.Description>
          <Flex direction="column" gap="4" mt="4">
            <Field label="执行节点">
              <Flex align="center" gap="2">
                <NodeSelectorDialog value={diagnosticClients} onChange={setDiagnosticClients} />
                <Text size="2" color="gray">已选 {diagnosticClients.length}/{nodeDetail.length}</Text>
              </Flex>
            </Field>
            <ToggleRow
              checked={diagnosticLargeEnabled}
              onCheckedChange={setDiagnosticLargeEnabled}
              title="同时检测实验性大小包"
              description="默认关闭；开启后会额外发送大小 SYN 探测包。"
            />
            <Flex justify="end" gap="2">
              <Dialog.Close><Button variant="soft">取消</Button></Dialog.Close>
              <Button disabled={diagnosticRunning} onClick={runDiagnostic}>{diagnosticRunning ? "下发中…" : "开始检测"}</Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

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

              <Field label="TCP 节点目录目标">
                <select
                  className="h-10 w-full rounded-md border border-gray-6 bg-transparent px-3 text-sm"
                  value={selectedTarget?.key || ""}
                  onChange={(event) => {
                    const target = catalog?.targets.find((item) => item.key === event.target.value);
                    if (target) selectCatalogTarget(target);
                  }}
                  required
                >
                  <option value="">请选择一个目标</option>
                  {(catalog?.targets || []).map((target) => (
                    <option key={target.key} value={target.key} disabled={configuredTargetKeys.has(target.key) && selectedTarget?.key !== target.key}>
                      {target.province} · {target.isp} · IPv{target.ip_version}{configuredTargetKeys.has(target.key) && selectedTarget?.key !== target.key ? "（已建任务）" : ""}
                    </option>
                  ))}
                </select>
                <Text size="1" color="gray">
                  系统会为同一目标自动创建或维护同名 ICMP 任务，并一起纳入综合评分。
                </Text>
              </Field>

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

              <Grid columns={{ initial: "1", sm: "3" }} gap="3">
                <NumberField
                  label="ICMP 检测周期（秒）"
                  value={form.icmp_interval || 60}
                  min={5}
                  max={86400}
                  onChange={(icmp_interval) =>
                    setForm((current) => ({ ...current, icmp_interval }))
                  }
                />
                <NumberField
                  label="TCP 检测周期（分钟）"
                  value={Math.round(form.interval / 60)}
                  min={15}
                  max={10080}
                  onChange={(minutes) =>
                    setForm((current) => ({ ...current, interval: minutes * 60 }))
                  }
                />
                <div className="rounded-md border p-3">
                  <Text as="div" size="2" weight="bold">TCP 资源估算</Text>
                  <Text as="div" size="2" color="gray" mt="1">
                    单目标，每节点约 {estimatedPackets} 包；ICMP 每次仅发少量探测包。
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

export default TCPQualityPage;
