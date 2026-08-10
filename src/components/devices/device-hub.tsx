import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  CalendarClock,
  Camera,
  Download,
  Eraser,
  Loader2,
  Monitor,
  PlaySquare,
  Save,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getDeviceHub,
  removeDeviceSchedule,
  saveDeviceSchedule,
  sendWhatsappOtp,
  updateDeviceHub,
  verifyWhatsappOtp,
} from "@/lib/devices/device-hub.functions";
import { sendDeviceCommand } from "@/lib/devices/devices.functions";
import type { ScheduleRuleType } from "@/lib/schedules/rules";

type OperatingWindow = { weekdays: number[]; startMinute: number; endMinute: number };
type DeviceMode = "display" | "issuer" | "caller";
type DeviceForm = {
  name: string;
  defaultPlaylistId: string;
  audioEnabled: boolean;
  transitionEffect: "none" | "fade";
  enabledModes: DeviceMode[];
  operatingHours: OperatingWindow[];
  offlineAlertsEnabled: boolean;
  recoveryAlertsEnabled: boolean;
  offlineToleranceMinutes: number;
};
type RuleConfig = {
  startAt?: string;
  endAt?: string;
  date?: string;
  startMinute?: number;
  endMinute?: number;
  weekdays?: number[];
  day?: number;
  month?: number;
};

const week = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const minute = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
const time = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function DeviceHub({ deviceId }: { deviceId: string }) {
  const queryClient = useQueryClient();
  const getFn = useServerFn(getDeviceHub);
  const updateFn = useServerFn(updateDeviceHub);
  const scheduleFn = useServerFn(saveDeviceSchedule);
  const removeFn = useServerFn(removeDeviceSchedule);
  const commandFn = useServerFn(sendDeviceCommand);
  const sendOtpFn = useServerFn(sendWhatsappOtp);
  const verifyOtpFn = useServerFn(verifyWhatsappOtp);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [reportFrom, setReportFrom] = useState(monthAgo);
  const [reportTo, setReportTo] = useState(today);
  const query = useQuery({
    queryKey: ["device-hub", deviceId, reportFrom, reportTo],
    queryFn: () =>
      getFn({
        data: {
          deviceId,
          from: reportFrom || undefined,
          to: reportTo || undefined,
        },
      }),
    refetchInterval: 30000,
  });
  const [form, setForm] = useState<DeviceForm | null>(null);
  const [ruleType, setRuleType] = useState<ScheduleRuleType>("date_time_range");
  const [playlistId, setPlaylistId] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("18:00");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [day, setDay] = useState(1);
  const [month, setMonth] = useState(1);
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [phoneScope, setPhoneScope] = useState<"organization" | "device">("organization");
  useEffect(() => {
    if (!query.data || form) return;
    const d = query.data.device;
    setForm({
      name: d.name,
      defaultPlaylistId: d.defaultPlaylistId ?? "",
      audioEnabled: d.audioEnabled,
      transitionEffect: d.transitionEffect === "fade" ? "fade" : "none",
      enabledModes: d.enabledModes.filter(
        (mode): mode is DeviceMode => mode === "display" || mode === "issuer" || mode === "caller",
      ),
      operatingHours: d.operatingHours ?? [],
      offlineAlertsEnabled: d.offlineAlertsEnabled,
      recoveryAlertsEnabled: d.recoveryAlertsEnabled,
      offlineToleranceMinutes: d.offlineToleranceMinutes,
    });
    setPlaylistId(query.data.playlists[0]?.id ?? "");
    setPhone(d.alertWhatsapp ?? query.data.organization.alertWhatsapp ?? "");
  }, [query.data, form]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["device-hub", deviceId] });
  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Aguarde o carregamento do terminal.");
      return updateFn({
        data: { ...form, deviceId, defaultPlaylistId: form.defaultPlaylistId || null },
      });
    },
    onSuccess: async () => {
      toast.success("Configurações salvas.");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });
  const addSchedule = useMutation({
    mutationFn: () => {
      const base: RuleConfig & { type: ScheduleRuleType } = { type: ruleType };
      if (ruleType === "date_time_range") {
        if (date) base.startAt = new Date(`${date}T${start}:00`).toISOString();
        if (endDate) base.endAt = new Date(`${endDate}T${end}:00`).toISOString();
      }
      if (ruleType === "specific_date_time") {
        base.date = date;
        base.startMinute = minute(start);
        base.endMinute = minute(end);
      }
      if (ruleType === "daily_time") {
        base.startMinute = minute(start);
        base.endMinute = minute(end);
      }
      if (ruleType === "weekdays") {
        base.weekdays = weekdays;
        base.startMinute = minute(start);
        base.endMinute = minute(end);
      }
      if (ruleType === "month_day") base.day = day;
      if (ruleType === "month") base.month = month;
      return scheduleFn({ data: { deviceId, playlistId, rule: base, isActive: true } });
    },
    onSuccess: async () => {
      toast.success("Agendamento adicionado.");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Revise os campos."),
  });
  const removeScheduleMutation = useMutation({
    mutationFn: (scheduleId: string) => removeFn({ data: { deviceId, scheduleId } }),
    onSuccess: refresh,
  });
  const command = useMutation({
    mutationFn: (kind: "screenshot" | "restart" | "clear_cache") =>
      commandFn({ data: { deviceId, kind } }),
    onSuccess: () => toast.success("Comando enviado para o terminal."),
  });
  const sendOtp = useMutation({
    mutationFn: () => sendOtpFn({ data: { deviceId, phone, scope: phoneScope } }),
    onSuccess: () => {
      setOtpSent(true);
      toast.success("Código enviado pelo WhatsApp.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no envio."),
  });
  const verifyOtp = useMutation({
    mutationFn: () => verifyOtpFn({ data: { deviceId, phone, code: otp, scope: phoneScope } }),
    onSuccess: async () => {
      toast.success("WhatsApp confirmado.");
      setOtpSent(false);
      setOtp("");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Código inválido."),
  });
  const totalPlays = useMemo(() => query.data?.playback.length ?? 0, [query.data]);
  const exportReport = () => {
    if (!query.data?.playback.length) {
      toast.error("Não há exibições neste período.");
      return;
    }
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = query.data.playback.map((row) =>
      [
        new Date(row.startedAt).toLocaleString("pt-BR"),
        row.playlistName ?? "",
        row.mediaName ?? "",
        row.mediaKind ?? "",
        Math.round(row.durationMs / 1000),
      ]
        .map(escape)
        .join(";"),
    );
    const blob = new Blob(
      ["\ufeffData e hora;Lista;Conteúdo;Tipo;Duração (s)\n", ...rows.map((row) => `${row}\n`)],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `exibicoes-${device.name}-${reportFrom}-${reportTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  if (query.isPending || !form)
    return (
      <div className="grid min-h-72 place-items-center">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  if (!query.data) return <p>Terminal não encontrado.</p>;
  const { device, online, playlists, schedules, playback } = query.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" asChild>
          <Link to="/studio/terminais">← Terminais</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{device.name}</h1>
          <p className="text-sm text-muted-foreground">
            Configuração e monitoramento deste terminal
          </p>
        </div>
        <Badge className="ml-auto" variant={online ? "default" : "destructive"}>
          {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
          {online ? " Online" : " Offline"}
        </Badge>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="size-4" />
          Salvar
        </Button>
      </div>
      <Tabs defaultValue="status">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="status">Configurações e status</TabsTrigger>
          <TabsTrigger value="schedules">Agendamentos</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="reports">Relatório de Exibição</TabsTrigger>
        </TabsList>
        <TabsContent value="status" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="size-5" />
                Configurações básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Nome">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Lista padrão">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={form.defaultPlaylistId}
                  onChange={(e) => setForm({ ...form, defaultPlaylistId: e.target.value })}
                >
                  <option value="">Sem lista padrão</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="size-5" />
                Reprodução de mídias
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <Toggle
                label="Áudio da reprodução"
                checked={form.audioEnabled}
                onChange={(checked) => setForm({ ...form, audioEnabled: checked })}
              />
              <Field label="Transição entre conteúdos">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={form.transitionEffect}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      transitionEffect: e.target.value === "fade" ? "fade" : "none",
                    })
                  }
                >
                  <option value="none">Corte direto</option>
                  <option value="fade">Suave (fade)</option>
                </select>
              </Field>
              <p className="text-sm text-muted-foreground md:col-span-2">
                Essas opções afetam a reprodução de mídias neste terminal. A inicialização
                automática e a prevenção de suspensão são controladas pelo aplicativo instalado.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Status e informações</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              <Info label="Estado" value={online ? "Online e funcionando" : "Offline"} />
              <Info
                label="Última comunicação"
                value={
                  device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString("pt-BR") : "Nunca"
                }
              />
              <Info label="Versão do aplicativo" value={device.appVersion ?? "Não informada"} />
              <Info label="Formato" value={device.canvasPreset} />
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button variant="outline" onClick={() => command.mutate("screenshot")}>
                  <Camera className="size-4" />
                  Capturar tela
                </Button>
                <Button variant="outline" onClick={() => command.mutate("restart")}>
                  Reiniciar aplicativo
                </Button>
                <Button variant="outline" onClick={() => command.mutate("clear_cache")}>
                  <Eraser className="size-4" />
                  Limpar cache
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="schedules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-5" />
                Adicionar agendamento
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Field label="Lista">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                >
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo">
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as ScheduleRuleType)}
                >
                  <option value="date_time_range">Período de dias e horas</option>
                  <option value="daily_time">Período de horas do dia</option>
                  <option value="specific_date_time">Horas em dia específico</option>
                  <option value="weekdays">Dia da semana</option>
                  <option value="month_day">Dia do mês</option>
                  <option value="month">Mês</option>
                </select>
              </Field>
              {["date_time_range", "specific_date_time"].includes(ruleType) && (
                <Field label={ruleType === "date_time_range" ? "Data inicial" : "Data"}>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              )}
              {ruleType === "date_time_range" && (
                <Field label="Data final">
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </Field>
              )}
              {["date_time_range", "specific_date_time", "daily_time", "weekdays"].includes(
                ruleType,
              ) && (
                <>
                  <Field label="Início">
                    <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                  </Field>
                  <Field label="Fim">
                    <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                  </Field>
                </>
              )}
              {ruleType === "weekdays" && (
                <div className="md:col-span-3">
                  <Label>Dias</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {week.map((label, index) => (
                      <Button
                        key={label}
                        type="button"
                        size="sm"
                        variant={weekdays.includes(index) ? "default" : "outline"}
                        onClick={() =>
                          setWeekdays((days) =>
                            days.includes(index)
                              ? days.filter((d) => d !== index)
                              : [...days, index],
                          )
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {ruleType === "month_day" && (
                <Field label="Dia">
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={day}
                    onChange={(e) => setDay(Number(e.target.value))}
                  />
                </Field>
              )}
              {ruleType === "month" && (
                <Field label="Mês">
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  />
                </Field>
              )}
              <div className="flex items-end">
                <Button
                  onClick={() => addSchedule.mutate()}
                  disabled={!playlistId || addSchedule.isPending}
                >
                  Adicionar agendamento
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {schedules.map((s) => (
              <Card key={s.id}>
                <CardContent className="flex items-center gap-3 py-4">
                  <PlaySquare className="size-5 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.playlistName}</p>
                    <p className="text-xs text-muted-foreground">
                      {scheduleLabel(s.ruleType as ScheduleRuleType, s.ruleConfig as RuleConfig)}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeScheduleMutation.mutate(s.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-5" />
                Alertas via WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Toggle
                label="Avisar quando este terminal ficar offline"
                checked={form.offlineAlertsEnabled}
                onChange={(checked) => setForm({ ...form, offlineAlertsEnabled: checked })}
              />
              <Toggle
                label="Avisar quando a conexão voltar"
                checked={form.recoveryAlertsEnabled}
                onChange={(checked) => setForm({ ...form, recoveryAlertsEnabled: checked })}
              />
              <Field label="Tolerância antes do alerta (minutos)">
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={form.offlineToleranceMinutes}
                  onChange={(e) =>
                    setForm({ ...form, offlineToleranceMinutes: Number(e.target.value) })
                  }
                />
              </Field>
              <div className="rounded-lg border p-4">
                <Label>Destinatário do WhatsApp</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-2"
                    value={phoneScope}
                    onChange={(e) => setPhoneScope(e.target.value as "organization" | "device")}
                  >
                    <option value="organization">Padrão da empresa</option>
                    <option value="device">Somente este terminal</option>
                  </select>
                  <Input
                    className="max-w-xs"
                    placeholder="(33) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    onClick={() => sendOtp.mutate()}
                    disabled={sendOtp.isPending}
                  >
                    Enviar código
                  </Button>
                </div>
                {otpSent && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      className="max-w-40"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    />
                    <Button onClick={() => verifyOtp.mutate()} disabled={otp.length !== 6}>
                      Confirmar
                    </Button>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  O número só será usado após a confirmação com o código recebido no próprio
                  WhatsApp.
                </p>
              </div>
              <OperatingHours
                value={form.operatingHours}
                onChange={(operatingHours) => setForm({ ...form, operatingHours })}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Relatório deste terminal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <Field label="De">
                  <Input
                    type="date"
                    value={reportFrom}
                    onChange={(event) => setReportFrom(event.target.value)}
                  />
                </Field>
                <Field label="Até">
                  <Input
                    type="date"
                    value={reportTo}
                    onChange={(event) => setReportTo(event.target.value)}
                  />
                </Field>
                <Button variant="outline" onClick={exportReport}>
                  <Download className="size-4" /> Exportar CSV
                </Button>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                {totalPlays} exibições registradas no período selecionado.
              </p>
              <div className="max-h-[520px] space-y-2 overflow-y-auto">
                {playback.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap gap-x-3 rounded-lg border p-3 text-sm"
                  >
                    <span className="font-medium">
                      {new Date(row.startedAt).toLocaleString("pt-BR")}
                    </span>
                    <span>{row.mediaName ?? "Conteúdo removido"}</span>
                    <span className="text-muted-foreground">
                      {row.playlistName ?? "Sem lista"} · {Math.round(row.durationMs / 1000)}s
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
function scheduleLabel(type: ScheduleRuleType, config: RuleConfig) {
  if (type === "date_time_range") {
    const from = config.startAt ? new Date(config.startAt).toLocaleString("pt-BR") : "desde sempre";
    const to = config.endAt ? new Date(config.endAt).toLocaleString("pt-BR") : "sem data final";
    return `Período: ${from} até ${to}`;
  }
  if (type === "specific_date_time")
    return `${config.date}, ${time(config.startMinute ?? 0)}–${time(config.endMinute ?? 1440)}`;
  if (type === "daily_time")
    return `Todos os dias, ${time(config.startMinute ?? 0)}–${time(config.endMinute ?? 1440)}`;
  if (type === "weekdays")
    return `${(config.weekdays ?? []).map((d: number) => week[d]).join(", ")}, ${time(config.startMinute ?? 0)}–${time(config.endMinute ?? 1440)}`;
  if (type === "month_day") return `Todo dia ${config.day} do mês`;
  return `Todo mês ${config.month}`;
}
function OperatingHours({
  value,
  onChange,
}: {
  value: OperatingWindow[];
  onChange: (value: OperatingWindow[]) => void;
}) {
  const add = () =>
    onChange([...value, { weekdays: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 1080 }]);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Horário de funcionamento</Label>
          <p className="text-xs text-muted-foreground">
            Usado somente para não alertar quando o terminal deveria estar desligado.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          Adicionar horário
        </Button>
      </div>
      <div className="mt-3 space-y-3">
        {value.map((window, i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex flex-wrap gap-1">
              {week.map((label, d) => (
                <Button
                  key={label}
                  type="button"
                  size="sm"
                  variant={window.weekdays.includes(d) ? "default" : "outline"}
                  onClick={() =>
                    onChange(
                      value.map((w, j) =>
                        j === i
                          ? {
                              ...w,
                              weekdays: w.weekdays.includes(d)
                                ? w.weekdays.filter((x: number) => x !== d)
                                : [...w.weekdays, d],
                            }
                          : w,
                      ),
                    )
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="time"
                value={time(window.startMinute)}
                onChange={(e) =>
                  onChange(
                    value.map((w, j) =>
                      j === i ? { ...w, startMinute: minute(e.target.value) } : w,
                    ),
                  )
                }
              />
              <span>até</span>
              <Input
                type="time"
                value={time(window.endMinute)}
                onChange={(e) =>
                  onChange(
                    value.map((w, j) =>
                      j === i ? { ...w, endMinute: minute(e.target.value) } : w,
                    ),
                  )
                }
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
