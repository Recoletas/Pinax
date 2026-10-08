// Windows 原生文件夹选择器（本机能力）：服务端进程 spawn PowerShell，弹真实系统「选择文件夹」对话框——
// 对话框出现在用户屏幕上（服务端与浏览器同机），选中后 stdout 回绝对路径。
// 两步面：start（spawn，立返 pickId）→ result 轮询（完成/取消）。失败标 failed → 前端回落内置浏览器。
// 实现走 shell 的 IFileOpenDialog(FOS_PICKFOLDERS)，即资源管理器同款现代选择器（导航窗格 + 地址栏 + 「文件夹」输入框）。
// 不用 WinForms FolderBrowserDialog：powershell.exe 里即便 EnableVisualStyles + AutoUpgradeEnabled 仍退回
// SHBrowseForFolder 老树形框（实测 vis=True class=#32770 title="Browse For Folder"），无地址栏、不能手输路径。
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const picks = new Map()
const PICK_TTL_MS = 10 * 60_000

function clip(value) {
  return String(value || '').slice(0, 260)
}

// 接口方法必须与 COM vtable 逐槽对齐：IModalWindow 只有 Show/SetFocus，没有 SetFileTypeIndex——
// 多声明一个方法会让后面所有槽位错位，调用即 AccessViolation。
const PICKER_CSHARP = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class PinaxFolderPicker {
  const uint FOS_PICKFOLDERS = 0x0020;
  const uint FOS_FORCEFILESYSTEM = 0x0040;
  const uint SIGDN_FILESYSPATH = 0x80058000;
  static readonly Guid IID_IShellItem = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");

  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  class FileOpenDialogRCW { }

  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    [PreserveSig] int GetParent(out IntPtr ppsi);
    [PreserveSig] int GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int GetAttributes(uint mask, out uint attributes);
    [PreserveSig] int Compare(IntPtr psi, uint hint, out int order);
  }

  [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    [PreserveSig] int SetFocus(IntPtr parent);
    [PreserveSig] int SetFileTypes(uint count, IntPtr rgFilterSpec);
    [PreserveSig] int GetFileTypeIndex(out uint index);
    [PreserveSig] int Advise(IntPtr sink, out uint cookie);
    [PreserveSig] int Unadvise(uint cookie);
    [PreserveSig] int SetOptions(uint options);
    [PreserveSig] int GetOptions(out uint options);
    [PreserveSig] int SetDefaultFolder([MarshalAs(UnmanagedType.Interface)] IShellItem item);
    [PreserveSig] int SetFolder([MarshalAs(UnmanagedType.Interface)] IShellItem item);
    [PreserveSig] int GetFolder(out IntPtr item);
    [PreserveSig] int GetCurrentSelection(out IntPtr item);
    [PreserveSig] int SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    [PreserveSig] int GetFileName(out IntPtr name);
    [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    [PreserveSig] int SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    [PreserveSig] int SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    [PreserveSig] int GetResult([MarshalAs(UnmanagedType.Interface)] out IShellItem item);
    [PreserveSig] int AddPlace(IntPtr item, uint visibility);
    [PreserveSig] int SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string ext);
    [PreserveSig] int Close(int hr);
    [PreserveSig] int SetClientGuid(ref Guid guid);
    [PreserveSig] int ClearClientData();
    [PreserveSig] int SetFilter(IntPtr sink);
    [PreserveSig] int GetResults(out IntPtr enumItems);
    [PreserveSig] int GetItemType(out uint type);
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(
    [MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr pbc, ref Guid riid,
    [MarshalAs(UnmanagedType.Interface)] out IShellItem item);

  // 对话框抢前台：powershell 是后台隐藏进程，Windows 禁止它 SetForegroundWindow，对话框会开在浏览器窗口背后
  // （用户侧症状就是「点了没反应」）。做法是临时把自己 attach 到当前前台线程，再 TOPMOST→NOTOPMOST 顶一次。
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, System.Text.StringBuilder s, int max);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern void SwitchToThisWindow(IntPtr h, bool unknown);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);

  static IntPtr FindOwnDialog(uint ownPid) {
    IntPtr hit = IntPtr.Zero;
    // 每次新建委托：缓存到静态字段会让它永远写进第一次调用的捕获变量，后续调用一律返回 0
    EnumWindowsProc cb = delegate (IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid != ownPid || !IsWindowVisible(h)) return true;
      var cls = new System.Text.StringBuilder(64);
      GetClassName(h, cls, 64);
      if (cls.ToString() != "#32770") return true;
      hit = h;
      return false;
    };
    EnumWindows(cb, IntPtr.Zero);
    GC.KeepAlive(cb);
    return hit;
  }

  static void ForceForegroundLater() {
    uint ownPid = (uint)System.Diagnostics.Process.GetCurrentProcess().Id;
    var thread = new System.Threading.Thread(delegate () {
      uint fgPid = 0;
      // 反复压：common item dialog 初始化完成后会自己重设窗口样式，只压一次会被它冲掉
      for (int i = 0; i < 30; i++) {
        System.Threading.Thread.Sleep(120);
        IntPtr hwnd = FindOwnDialog(ownPid);
        if (hwnd == IntPtr.Zero) continue;
        uint fgThread = GetWindowThreadProcessId(GetForegroundWindow(), out fgPid);
        uint myThread = GetCurrentThreadId();
        bool attached = fgThread != 0 && fgThread != myThread && AttachThreadInput(fgThread, myThread, true);
        SetWindowPos(hwnd, new IntPtr(-1), 0, 0, 0, 0, 0x1 | 0x2 | 0x40); // HWND_TOPMOST + NOSIZE|NOMOVE|SHOWWINDOW
        BringWindowToTop(hwnd);
        ShowWindow(hwnd, 5); // SW_SHOW
        SetForegroundWindow(hwnd);
        SwitchToThisWindow(hwnd, true);
        if (attached) AttachThreadInput(fgThread, myThread, false);
        // 满 1 秒才收手：更早退出时用户还没看到弹框就失去置顶保障，更晚会抢回用户主动切走的窗口
        if (GetForegroundWindow() == hwnd && i >= 8) return;
      }
    });
    thread.IsBackground = true;
    thread.Start();
  }

  public static string Pick(string initial, string title) {
    var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
    dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
    if (!string.IsNullOrEmpty(title)) dialog.SetTitle(title);
    if (!string.IsNullOrEmpty(initial) && Directory.Exists(initial)) {
      IShellItem start;
      Guid iid = IID_IShellItem;
      try {
        SHCreateItemFromParsingName(initial, IntPtr.Zero, ref iid, out start);
        if (start != null) dialog.SetFolder(start);
      } catch { }
    }
    ForceForegroundLater();
    if (dialog.Show(IntPtr.Zero) != 0) return null;
    IShellItem picked;
    if (dialog.GetResult(out picked) != 0 || picked == null) return null;
    string path;
    if (picked.GetDisplayName(SIGDN_FILESYSPATH, out path) != 0) return null;
    return path;
  }
}
`

/** 拉起 Windows 原生文件夹选择对话框（非阻塞）。返回 pickId；结果经 result 轮询读取。 */
export function startFolderPick({ initial = '', description = '选择项目文件夹' } = {}) {
  const pickId = randomUUID().slice(0, 12)
  const result = { done: false, path: null, cancelled: false, failed: false }
  picks.set(pickId, result)
  // 参数一律 base64 传：node 在 Windows 上拼命令行会把路径里的反斜杠吃掉（实测 'D:\x' 到 PowerShell 变成 'D:x'），
  // 且 base64 字符集不含引号/反引号，比手写转义更稳
  const initialB64 = Buffer.from(clip(initial), 'utf8').toString('base64')
  const descriptionB64 = Buffer.from(clip(description), 'utf8').toString('base64')
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    `Add-Type -TypeDefinition @'${PICKER_CSHARP}'@`,
    `$initial = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${initialB64}'))`,
    `$title = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${descriptionB64}'))`,
    '$picked = [PinaxFolderPicker]::Pick($initial, $title)',
    'if ($picked) { [Console]::Out.Write($picked) }'
  ].join('\n')
  const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  child.on('error', () => { result.done = true; result.failed = true; result.cancelled = true })
  child.on('close', () => {
    result.done = true
    const selected = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || ''
    if (selected) result.path = selected
    else {
      if (stderr.trim()) result.failed = true
      result.cancelled = true
    }
  })
  const cleaner = setTimeout(() => { result.done = true; if (!result.path) result.cancelled = true; picks.delete(pickId) }, PICK_TTL_MS)
  cleaner.unref?.()
  return { pickId, pid: child.pid ?? null }
}

/** 轮询读取选择结果：{ done:false } 进行中；done + path=选中；done + cancelled=取消。取走即清理。 */
export function getFolderPickResult(pickId) {
  const result = picks.get(String(pickId || ''))
  if (!result) return { done: true, cancelled: true, missing: true }
  if (!result.done) return { done: false }
  picks.delete(String(pickId || ''))
  return { done: true, path: result.path, cancelled: Boolean(result.cancelled), failed: Boolean(result.failed) }
}
