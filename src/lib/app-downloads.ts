const RELEASES = "https://github.com/marciostuart/MDI360/releases/download";

export const APP_DOWNLOADS = {
  android: `${RELEASES}/android-latest/mdi360-android.apk`,
  windows: `${RELEASES}/desktop-latest/MDI360-Emissor-Windows-x64.exe`,
  linuxDeb: `${RELEASES}/desktop-latest/MDI360-Emissor-MiniOS-x64.deb`,
  linuxAppImage: `${RELEASES}/desktop-latest/MDI360-Emissor-MiniOS-x64.AppImage`,
  roku: "/mdi360-roku.zip",
} as const;
