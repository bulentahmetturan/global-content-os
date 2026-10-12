param(
  [Parameter(Mandatory=$true)][ValidateSet('Status','Read','Enroll')][string]$Mode,
  [Parameter(Mandatory=$true)][ValidateSet('CLOUDFLARE_READ','GCOS_OPS_READ','DOSSIER_OPS_READ')][string]$Alias
)
$ErrorActionPreference = 'Stop'

$source = @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class GcosOperatorCredentialStore {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct Credential {
        public UInt32 Flags;
        public UInt32 Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
        public FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
    }

    [DllImport("Advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
    [DllImport("Advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
    private static extern bool CredWrite(ref Credential credential, UInt32 flags);
    [DllImport("Advapi32.dll", EntryPoint="CredFree", SetLastError=false)]
    private static extern void CredFree(IntPtr credential);

    public static bool Exists(string target) {
        IntPtr p;
        if (!CredRead(target, 1, 0, out p)) {
            if (Marshal.GetLastWin32Error() == 1168) return false;
            throw new InvalidOperationException("CREDENTIAL_STORE_UNAVAILABLE");
        }
        CredFree(p);
        return true;
    }

    public static string Read(string target) {
        IntPtr p;
        if (!CredRead(target, 1, 0, out p)) {
            if (Marshal.GetLastWin32Error() == 1168) return null;
            throw new InvalidOperationException("CREDENTIAL_STORE_UNAVAILABLE");
        }
        try {
            var c = (Credential)Marshal.PtrToStructure(p, typeof(Credential));
            if (c.CredentialBlob == IntPtr.Zero || c.CredentialBlobSize == 0 || (c.CredentialBlobSize % 2) != 0 || c.CredentialBlobSize > 5120)
                throw new InvalidOperationException("CREDENTIAL_BLOB_INVALID");
            return Marshal.PtrToStringUni(c.CredentialBlob, checked((int)c.CredentialBlobSize / 2));
        } finally { CredFree(p); }
    }

    public static bool Write(string target, IntPtr blob, UInt32 blobSize) {
        var c = new Credential {
            Type = 1, TargetName = target, Comment = "GCOS local operator bridge",
            CredentialBlobSize = blobSize, CredentialBlob = blob, Persist = 2,
            AttributeCount = 0, Attributes = IntPtr.Zero, TargetAlias = null,
            UserName = "GCOS operator"
        };
        return CredWrite(ref c, 0);
    }
}
'@
Add-Type -TypeDefinition $source -Language CSharp

if ($Mode -eq 'Enroll' -and [Environment]::UserInteractive -eq $false) {
  [Console]::Error.WriteLine('INTERACTIVE_CONSOLE_REQUIRED')
  exit 9
}

$targets = @{
  CLOUDFLARE_READ = 'GCOS.OperatorBridge.CLOUDFLARE_READ'
  GCOS_OPS_READ = 'GCOS.OperatorBridge.GCOS_OPS_READ'
  DOSSIER_OPS_READ = 'GCOS.OperatorBridge.DOSSIER_OPS_READ'
}
$target = $targets[$Alias]

try {
  if ($Mode -eq 'Status') {
    if ([GcosOperatorCredentialStore]::Exists($target)) { [Console]::Out.WriteLine('PRESENT') }
    else { [Console]::Out.WriteLine('MISSING') }
    exit 0
  }
  if ($Mode -eq 'Read') {
    $value = [GcosOperatorCredentialStore]::Read($target)
    if ($null -eq $value) { [Console]::Out.WriteLine('MISSING'); exit 4 }
    [Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value)))
    exit 0
  }
  if ([GcosOperatorCredentialStore]::Exists($target)) {
    [Console]::Error.WriteLine('ALREADY_PRESENT_NOT_OVERWRITTEN')
    exit 5
  }
  $secret = Read-Host "Enter existing $Alias credential (input hidden)" -AsSecureString
  if ($secret.Length -lt 1 -or $secret.Length -gt 2500) {
    [Console]::Error.WriteLine('CREDENTIAL_LENGTH_REJECTED')
    exit 6
  }
  $memory = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secret)
  try {
    $written = [GcosOperatorCredentialStore]::Write($target, $memory, [UInt32]($secret.Length * 2))
    if (-not $written) { [Console]::Error.WriteLine('CREDENTIAL_STORE_WRITE_FAILED'); exit 7 }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($memory)
    $secret.Dispose()
  }
  [Console]::Out.WriteLine('ENROLLED')
} catch {
  [Console]::Error.WriteLine('CREDENTIAL_STORE_OPERATION_FAILED')
  exit 8
}
