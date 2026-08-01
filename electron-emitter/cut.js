const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/**
 * Envia o comando ESC/POS de corte (GS V 65 3) direto para o spooler do
 * Windows em modo RAW. Necessário quando o driver da impressora não corta
 * automaticamente ao final do cupom (EPSON TM-T20 e similares).
 */
function sendCut(printerName) {
  return new Promise((resolve) => {
    if (process.platform !== "win32" || !printerName) return resolve(false);

    const script = path.join(os.tmpdir(), `mdi360-cut-${Date.now()}.ps1`);
    fs.writeFileSync(
      script,
      `$printer = '${printerName.replace(/'/g, "''")}'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential)] public class DOCINFO {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", CharSet=CharSet.Ansi, SetLastError=true)] public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", CharSet=CharSet.Ansi, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static bool SendBytes(string printer, byte[] bytes) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    DOCINFO di = new DOCINFO(); di.pDocName = "MDI360 CUT"; di.pDataType = "RAW";
    bool ok = StartDocPrinter(h, 1, di) && StartPagePrinter(h);
    if (ok) {
      IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, p, bytes.Length);
      int written; ok = WritePrinter(h, p, bytes.Length, out written);
      Marshal.FreeCoTaskMem(p);
      EndPagePrinter(h); EndDocPrinter(h);
    }
    ClosePrinter(h); return ok;
  }
}
'@
[RawPrinter]::SendBytes($printer, [byte[]](0x1B,0x64,0x03,0x1D,0x56,0x41,0x03)) | Out-Null
`,
      "utf8",
    );

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      (error) => {
        fs.rm(script, { force: true }, () => {});
        resolve(!error);
      },
    );
  });
}

module.exports = { sendCut };