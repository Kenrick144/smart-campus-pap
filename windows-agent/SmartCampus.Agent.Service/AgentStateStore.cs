using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SmartCampus.Agent.Service;

public sealed class AgentStateStore
{
    private readonly string _path = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "SmartCampus", "active-session.bin");

    public void Save(AgentSession session, string windowsUser)
    {
        var clear = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new PersistedSession(session, windowsUser)));
        var encrypted = ProtectedData.Protect(clear, optionalEntropy: null, DataProtectionScope.LocalMachine);
        CryptographicOperations.ZeroMemory(clear);
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        File.WriteAllBytes(_path, encrypted);
    }

    public PersistedSession? Load()
    {
        if (!File.Exists(_path)) return null;
        var encrypted = File.ReadAllBytes(_path);
        var clear = ProtectedData.Unprotect(encrypted, optionalEntropy: null, DataProtectionScope.LocalMachine);
        try
        {
            return JsonSerializer.Deserialize<PersistedSession>(Encoding.UTF8.GetString(clear));
        }
        finally { CryptographicOperations.ZeroMemory(clear); }
    }

    public void Clear()
    {
        if (File.Exists(_path)) File.Delete(_path);
    }
}

public sealed record PersistedSession(AgentSession Session, string WindowsUser);
