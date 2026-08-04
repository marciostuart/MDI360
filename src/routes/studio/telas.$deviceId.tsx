import { createFileRoute } from "@tanstack/react-router";
import { DeviceHub } from "@/components/devices/device-hub";

export const Route = createFileRoute("/studio/telas/$deviceId")({
  head: () => ({ meta: [{ title: "Configuração da TV | MDI 360" }] }),
  component: DevicePage,
});

function DevicePage() {
  const { deviceId } = Route.useParams();
  return <DeviceHub deviceId={deviceId} />;
}
