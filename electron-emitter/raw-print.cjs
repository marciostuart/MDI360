"use strict";
// Envia bytes crus para a impressora do Windows (winspool.drv), sem passar pelo driver grafico.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PS_SCRIPT = `
param([string]$PrinterName, [string]$FilePath)
$code = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOW di);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void Send(string printer, byte[] bytes) {
    IntPtr h; int written;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Nao foi possivel abrir a impressora " + printer);
    DOCINFOW di = new DOCINFOW(); di.pDocName = "MDI360 Senha"; di.pDataType = "RAW";
    try {
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter falhou");
      StartPagePrinter(h);
      IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, p, bytes.Length);
      WritePrinter(h, p, bytes.Length, out written);
      Marshal.FreeCoTaskMem(p);
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinter]::Send($PrinterName, $bytes)
`;

function rawPrint(printerName, buffer) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("A impressao ESC/POS direta funciona apenas no Windows."));
      return;
    }
    if (!printerName) {
      reject(new Error("Selecione a impressora nas configuracoes."));
      return;
    }
    const tmp = path.join(os.tmpdir(), `mdi360-senha-${Date.now()}.bin`);
    const ps = path.join(os.tmpdir(), `mdi360-rawprint-${Date.now()}.ps1`);
    fs.writeFileSync(tmp, buffer);
    fs.writeFileSync(ps, PS_SCRIPT, "utf8");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-PrinterName", printerName, "-FilePath", tmp],
      { windowsHide: true },
    );
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      fs.rm(tmp, { force: true }, () => {});
      fs.rm(ps, { force: true }, () => {});
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Falha ao imprimir (codigo ${code}).`));
    });
  });
}

module.exports = { rawPrint };
