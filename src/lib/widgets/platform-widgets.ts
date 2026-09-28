export const PLATFORM_WIDGET_TYPES = ["currency", "news", "lottery"] as const;
export type PlatformWidgetType = (typeof PLATFORM_WIDGET_TYPES)[number];

export const PLATFORM_WIDGET_SETTINGS_KEY = "platform-widgets";
export const PLATFORM_WIDGET_TAG = "__platform-managed-widget";

export function isPlatformWidgetType(
  value: string | null | undefined,
): value is PlatformWidgetType {
  return PLATFORM_WIDGET_TYPES.includes(value as PlatformWidgetType);
}
