using System.Runtime.InteropServices;

namespace SmartCampus.Agent.Service;

public sealed class WindowsSession
{
    private const int WTSUserName = 5;
    private const int WTSDomainName = 7;
    private const int WTS_CURRENT_SESSION = -1;

    public WindowsIdentityInfo? GetActiveConsoleIdentity()
    {
        var sessionId = WTSGetActiveConsoleSessionId();
        if (sessionId == uint.MaxValue) return null;
        var user = Query(sessionId, WTSUserName);
        var domain = Query(sessionId, WTSDomainName);
        if (string.IsNullOrWhiteSpace(user)) return null;
        return new WindowsIdentityInfo(sessionId, domain ?? string.Empty, user);
    }

    public bool Logoff(uint sessionId) => WTSLogoffSession(IntPtr.Zero, sessionId, false);

    private static string? Query(uint sessionId, int infoClass)
    {
        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId, infoClass, out var buffer, out var bytes) || buffer == IntPtr.Zero)
            return null;
        try { return Marshal.PtrToStringUni(buffer); }
        finally { WTSFreeMemory(buffer); }
    }

    [DllImport("kernel32.dll")]
    private static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("wtsapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSQuerySessionInformation(IntPtr server, uint sessionId, int infoClass, out IntPtr buffer, out int bytesReturned);

    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSLogoffSession(IntPtr server, uint sessionId, [MarshalAs(UnmanagedType.Bool)] bool wait);
}

public sealed record WindowsIdentityInfo(uint SessionId, string Domain, string UserName)
{
    public string QualifiedName => string.IsNullOrWhiteSpace(Domain) ? UserName : $"{Domain}\\{UserName}";
}
