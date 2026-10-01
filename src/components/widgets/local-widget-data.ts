import { createContext } from "react";

/** APK-only prepared snapshot. Providing it disables widget HTTP polling. */
export const LocalWidgetData = createContext<{ payload: unknown; now?: () => number } | null>(null);
