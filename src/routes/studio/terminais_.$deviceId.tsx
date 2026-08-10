import { createFileRoute } from "@tanstack/react-router";

import { DeviceHub } from "@/components/devices/device-hub";

export const Route = createFileRoute("/studio/terminais_/$deviceId")({
  head: () => ({ meta: [{ title: "Configuração do terminal | MDI 360" }] }),
  component: TerminalPage,
});

function TerminalPage() {
  const { deviceId } = Route.useParams();
  return <DeviceHub deviceId={deviceId} />;
}
