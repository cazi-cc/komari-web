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
  Bell,
  Clock3,
  FlaskConical,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import React from "react";
import { toast } from "sonner";

interface UnlockQualityTask {
  id?: number;
  name: string;
  clients: string[];
  default_on: boolean;
  enabled: boolean;
  service: "chatgpt";
  interval: number;
  verify_interval: number;
  sample_count: number;
  timeout_ms: number;
  control_enabled: boolean;
  control_dns: string;
  fixed_enabled: boolean;
  fixed_address: string;
  relay_enabled: boolean;
  relay_clients: string[];
  relay_proxy_url: string;
  notifications_enabled: boolean;
}

const emptyTask = (): UnlockQualityTask => ({
  name: "ChatGPT 解锁线路",
  clients: [],
  default_on: true,
  enabled: true,
  service: "chatgpt",
  interval: 60,
  verify_interval: 900,
  sample_count: 1,
  timeout_ms: 10000,
  control_enabled: false,
  control_dns: "1.1.1.1",
  fixed_enabled: false,
  fixed_address: "167.148.203.139",
  relay_enabled: false,
  relay_clients: [],
  relay_proxy_url: "socks5://127.0.0.1:1080",
  notifications_enabled: true,
});

const UnlockQualityPage = () => (
  <NodeDetailsProvider>
    <UnlockQualityPageInner />
  </NodeDetailsProvider>
);

const UnlockQualityPageInner = () => {
  const { call } = useRPC2Call();
  const { nodeDetail, isLoading: nodesLoading, error: nodeError } =
    useNodeDetails();
  const [tasks, setTasks] = React.useState<UnlockQualityTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<UnlockQualityTask>(emptyTask());
  const [saving, setSaving] = React.useState(false);
  const [runningID, setRunningID] = React.useState<number | null>(null);
  const [deletingID, setDeletingID] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    try {
      const result = await call<undefined, UnlockQualityTask[]>(
        "admin:getUnlockQualityTasks",
      );
      setTasks(Array.isArray(result) ? result : []);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "读取解锁线路任务失败",
      );
    } finally {
      setLoading(false);
    }
  }, [call]);

  React.useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    const next = emptyTask();
    next.clients = nodeDetail.map((node) => node.uuid);
    setForm(next);
    setFormOpen(true);
  };

  const openEdit = (task: UnlockQualityTask) => {
    setForm({
      ...emptyTask(),
      ...task,
      clients: [...(task.clients || [])],
      relay_clients: [...(task.relay_clients || [])],
    });
    setFormOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("请输入任务名称");
      return;
    }
    if (form.clients.length === 0) {
      toast.error("请至少选择一个执行节点");
      return;
    }
    if (form.relay_enabled && form.relay_clients.length === 0) {
      toast.error("启用中转监测后，请至少选择一个中转节点");
      return;
    }
    setSaving(true);
    try {
      await call(
        form.id ? "admin:editUnlockQualityTask" : "admin:addUnlockQualityTask",
        form,
      );
      toast.success(form.id ? "解锁线路任务已更新" : "解锁线路任务已创建");
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (id: number) => {
    setRunningID(id);
    try {
      await call("admin:runUnlockQualityTaskNow", { id });
      toast.success("完整 ChatGPT 解锁校验已下发");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务下发失败");
    } finally {
      setRunningID(null);
    }
  };

  const remove = async (id: number) => {
    setDeletingID(id);
    try {
      await call("admin:deleteUnlockQualityTasks", { id: [id] });
      toast.success("解锁线路任务已删除");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingID(null);
    }
  };

  if (loading || nodesLoading) return <Loading />;
  if (nodeError) return <div className="p-4">{nodeError}</div>;

  return (
    <Flex direction="column" gap="4" className="p-4">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <div>
          <Text as="div" size="6" weight="bold">
            解锁线路质量
          </Text>
          <Text as="div" size="2" color="gray" mt="1">
            比较节点系统线路与 HTTP、HTTPS 或 SOCKS5 中转访问 ChatGPT
            的真实体验。
          </Text>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} />
          新建任务
        </Button>
      </Flex>

      <Callout.Root color="green" variant="surface">
        <Callout.Icon>
          <ShieldCheck size={18} />
        </Callout.Icon>
        <Callout.Text>
          公开接口不会返回检测域名、解析地址、DNS 地址或固定入口。检测不登录账号，
          不使用 API Key，也不会下载流媒体内容。
        </Callout.Text>
      </Callout.Root>

      <Callout.Root color="blue" variant="surface">
        <Callout.Icon>
          <Clock3 size={18} />
        </Callout.Icon>
        <Callout.Text>
          60 秒等整数周期可正常使用。系统会自动错开任务，并与 TCP 质量检测共用单任务重负载通道。
        </Callout.Text>
      </Callout.Root>

      <Grid columns={{ initial: "1", sm: "3" }} gap="3">
        <ServiceCard name="ChatGPT" status="已启用" color="green" />
        <ServiceCard name="Netflix" status="预留，未检测" color="gray" />
        <ServiceCard name="Disney+" status="预留，未检测" color="gray" />
      </Grid>

      {tasks.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-gray-11">
          尚未创建解锁线路任务。
        </div>
      ) : (
        <Grid columns={{ initial: "1", lg: "2" }} gap="3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <Flex direction="column" gap="3">
                <Flex justify="between" align="start" gap="3">
                  <div>
                    <Flex align="center" gap="2" wrap="wrap">
                      <Text weight="bold" size="4">{task.name}</Text>
                      <Badge color={task.enabled ? "green" : "gray"}>
                        {task.enabled ? "启用" : "暂停"}
                      </Badge>
                      <Badge color="blue">ChatGPT</Badge>
                      {task.relay_enabled && <Badge color="purple">中转监测</Badge>}
                    </Flex>
                    <Text as="div" size="2" color="gray" mt="1">
                      {task.clients.length} 个节点 · 每 {task.interval} 秒 ·
                      完整校验每 {Math.round(task.verify_interval / 60)} 分钟
                    </Text>
                  </div>
                  <Flex gap="1">
                    <IconButton
                      variant="soft"
                      color="green"
                      aria-label="立即完整检测"
                      title="立即完整检测"
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
                        <IconButton variant="soft" color="red" aria-label="删除任务">
                          <Trash2 size={16} />
                        </IconButton>
                      </Dialog.Trigger>
                      <Dialog.Content maxWidth="420px">
                        <Dialog.Title>删除解锁线路任务</Dialog.Title>
                        <Dialog.Description>
                          将同时删除历史检测、缓存快照和通知状态。
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
                  <Badge variant="soft">
                    <Clock3 size={13} /> {task.sample_count} 次/轮
                  </Badge>
                  {task.control_enabled && (
                    <Badge color="blue" variant="soft">对照线路已开启</Badge>
                  )}
                  {task.fixed_enabled && (
                    <Badge color="amber" variant="soft">固定入口诊断已开启</Badge>
                  )}
                  {task.relay_enabled && (
                    <Badge color="purple" variant="soft">
                      {task.relay_clients.length} 个中转节点
                    </Badge>
                  )}
                  {task.notifications_enabled && (
                    <Badge color="green" variant="soft">
                      <Bell size={13} /> 状态通知
                    </Badge>
                  )}
                </Flex>
              </Flex>
            </Card>
          ))}
        </Grid>
      )}

      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Content maxWidth="760px" className="max-h-[88vh] overflow-y-auto">
          <Dialog.Title>{form.id ? "编辑解锁线路任务" : "新建解锁线路任务"}</Dialog.Title>
          <Dialog.Description>
            高频分钟检测只访问 ChatGPT 主链路；完整校验会检查 Web、认证、API、
            静态资源和 Cloudflare 路由信息。
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
                        setForm((current) => ({
                          ...current,
                          clients,
                          relay_clients: current.relay_clients.filter((uuid) => clients.includes(uuid)),
                        }))
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
                description="关闭后保留历史数据，但不再下发检测。"
              />
              <ToggleRow
                checked={form.default_on}
                onCheckedChange={(default_on) =>
                  setForm((current) => ({ ...current, default_on }))
                }
                title="新节点默认加入"
                description="以后新增节点时自动加入本任务。"
              />

              <Grid columns={{ initial: "1", sm: "4" }} gap="3">
                <NumberField
                  label="检测周期（秒）"
                  value={form.interval}
                  min={60}
                  max={86400}
                  onChange={(interval) =>
                    setForm((current) => ({ ...current, interval }))
                  }
                />
                <NumberField
                  label="完整校验（秒）"
                  value={form.verify_interval}
                  min={300}
                  max={86400}
                  onChange={(verify_interval) =>
                    setForm((current) => ({ ...current, verify_interval }))
                  }
                />
                <NumberField
                  label="主链路样本"
                  value={form.sample_count}
                  min={1}
                  max={3}
                  onChange={(sample_count) =>
                    setForm((current) => ({ ...current, sample_count }))
                  }
                />
                <NumberField
                  label="超时（毫秒）"
                  value={form.timeout_ms}
                  min={1000}
                  max={30000}
                  onChange={(timeout_ms) =>
                    setForm((current) => ({ ...current, timeout_ms }))
                  }
                />
              </Grid>

              <ToggleRow
                checked={form.control_enabled}
                onCheckedChange={(control_enabled) =>
                  setForm((current) => ({ ...current, control_enabled }))
                }
                title="启用对照 DNS"
                description="默认关闭。开启后并行测量直连 DNS，用于计算 Smart DNS 提升值。"
              />
              {form.control_enabled && (
                <Field label="对照 DNS">
                  <TextField.Root
                    value={form.control_dns}
                    placeholder="1.1.1.1"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, control_dns: event.target.value }))
                    }
                  />
                </Field>
              )}

              <ToggleRow
                checked={form.fixed_enabled}
                onCheckedChange={(fixed_enabled) =>
                  setForm((current) => ({ ...current, fixed_enabled }))
                }
                title="启用固定入口诊断"
                description="默认关闭。保留正确的 HTTPS 域名和 SNI，只绕过 DNS；不参与评分。"
              />
              {form.fixed_enabled && (
                <Field label="固定入口 IP">
                  <TextField.Root
                    value={form.fixed_address}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, fixed_address: event.target.value }))
                    }
                  />
                </Field>
              )}

              <ToggleRow
                checked={form.relay_enabled}
                onCheckedChange={(relay_enabled) =>
                  setForm((current) => ({
                    ...current,
                    relay_enabled,
                    relay_clients: relay_enabled && current.relay_clients.length === 0
                      ? [...current.clients]
                      : current.relay_clients,
                  }))
                }
                title="启用中转访问质量"
                description="让指定节点通过本机或远程 HTTP/HTTPS/SOCKS5 代理访问 ChatGPT，并与系统线路对比。"
              />
              {form.relay_enabled && (
                <Flex direction="column" gap="3">
                  <Field label="使用中转的节点">
                    <Flex align="center" gap="2">
                      <NodeSelectorDialog
                        value={form.relay_clients}
                        onChange={(clients) =>
                          setForm((current) => ({
                            ...current,
                            relay_clients: clients.filter((uuid) => current.clients.includes(uuid)),
                          }))
                        }
                      />
                      <Text size="2" color="gray">
                        已选 {form.relay_clients.length}/{form.clients.length}
                      </Text>
                    </Flex>
                  </Field>
                  <Field label="中转代理地址（仅管理员和 Agent 可见）">
                    <TextField.Root
                      type="password"
                      value={form.relay_proxy_url}
                      placeholder="socks5://127.0.0.1:1080"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, relay_proxy_url: event.target.value }))
                      }
                    />
                    <Text size="1" color="gray">
                      支持 socks5://、socks5h://、http://、https://，必须填写端口；需要认证时可使用 user:password@host:port。
                    </Text>
                  </Field>
                </Flex>
              )}

              <Callout.Root color="amber" variant="surface">
                <Callout.Icon><FlaskConical size={18} /></Callout.Icon>
                <Callout.Text>
                  中转监测每轮会增加一组轻量 HTTPS 请求。代理地址及认证信息不会进入访客接口、公开快照或主题页面。
                </Callout.Text>
              </Callout.Root>

              <Flex justify="end" gap="2">
                <Dialog.Close><Button type="button" variant="soft">取消</Button></Dialog.Close>
                <Button type="submit" disabled={saving}>
                  {saving ? "保存中..." : "保存任务"}
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
};

const ServiceCard = ({
  name,
  status,
  color,
}: {
  name: string;
  status: string;
  color: "green" | "gray";
}) => (
  <Card>
    <Flex justify="between" align="center" gap="3">
      <Text weight="bold">{name}</Text>
      <Badge color={color}>{status}</Badge>
    </Flex>
  </Card>
);

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <Flex direction="column" gap="1">
    <Text size="2" weight="medium">{label}</Text>
    {children}
  </Flex>
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
      value={String(value)}
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
  <Flex justify="between" align="center" gap="4">
    <div>
      <Text as="div" weight="medium">{title}</Text>
      <Text as="div" size="2" color="gray">{description}</Text>
    </div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </Flex>
);

export default UnlockQualityPage;
