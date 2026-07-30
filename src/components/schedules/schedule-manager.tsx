import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listDevices } from "@/lib/devices/devices.functions";
import { listPlaylists } from "@/lib/playlists/playlists.functions";
import { createSchedule, deleteSchedule, listSchedules } from "@/lib/schedules/schedules.functions";
import { WEEKDAYS, minutesToTime, timeToMinutes } from "@/lib/schedules/weekdays";

export function ScheduleManager() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSchedules);
  const createFn = useServerFn(createSchedule);
  const deleteFn = useServerFn(deleteSchedule);
  const devicesFn = useServerFn(listDevices);
  const playlistsFn = useServerFn(listPlaylists);

  const [deviceId, setDeviceId] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("22:00");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [priority, setPriority] = useState(0);

  const schedules = useQuery({ queryKey: ["schedules"], queryFn: () => listFn({}) });
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => devicesFn({}) });
  const playlists = useQuery({ queryKey: ["playlists"], queryFn: () => playlistsFn({}) });

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          deviceId,
          playlistId,
          weekdayMask: days.reduce((mask, bit) => mask | (1 << bit), 0),
          startMinute: timeToMinutes(start),
          endMinute: timeToMinutes(end),
          priority,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Programação criada.");
    },
    onError: () => toast.error("Verifique os dados: fim precisa ser depois do início."),
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) => deleteFn({ data: { scheduleId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Programação removida.");
    },
  });

  const canSubmit = Boolean(deviceId && playlistId && days.length > 0);

  if (schedules.data && !schedules.data.configured) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Conecte o banco de dados (DATABASE_URL) para usar a agenda.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div>
            <Label>Tela</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Escolha a tela" />
              </SelectTrigger>
              <SelectContent>
                {(devices.data?.items ?? []).map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Playlist</Label>
            <Select value={playlistId} onValueChange={setPlaylistId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Escolha a playlist" />
              </SelectTrigger>
              <SelectContent>
                {(playlists.data?.items ?? []).map((playlist) => (
                  <SelectItem key={playlist.id} value={playlist.id}>
                    {playlist.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="start">Início</Label>
            <Input
              id="start"
              type="time"
              className="mt-1"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="end">Fim</Label>
            <Input
              id="end"
              type="time"
              className="mt-1"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Dias da semana</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const active = days.includes(day.bit);
                return (
                  <button
                    key={day.bit}
                    type="button"
                    onClick={() =>
                      setDays((current) =>
                        current.includes(day.bit)
                          ? current.filter((bit) => bit !== day.bit)
                          : [...current, day.bit],
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="priority"
              checked={priority > 0}
              onCheckedChange={(checked) => setPriority(checked ? 10 : 0)}
            />
            <Label htmlFor="priority" className="text-sm text-muted-foreground">
              Prioridade alta (vence outras programações no mesmo horário)
            </Label>
          </div>

          <div className="flex items-end justify-end">
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Programar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {schedules.isPending ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (schedules.data?.items.length ?? 0) === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <CalendarClock className="mx-auto mb-3 size-8 opacity-40" />
              Nenhuma programação ainda. Escolha uma tela, uma playlist e o horário.
            </CardContent>
          </Card>
        ) : (
          schedules.data!.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4"
            >
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium">{item.deviceName}</p>
                <p className="text-xs text-muted-foreground">{item.playlistName}</p>
              </div>
              <Badge variant="secondary">
                {minutesToTime(item.startMinute)} — {minutesToTime(item.endMinute)}
              </Badge>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.filter((day) => ((item.weekdayMask >> day.bit) & 1) === 1).map((day) => (
                  <span
                    key={day.bit}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {day.short}
                  </span>
                ))}
              </div>
              {item.priority > 0 ? <Badge>Prioridade</Badge> : null}
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => deleteMutation.mutate(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}