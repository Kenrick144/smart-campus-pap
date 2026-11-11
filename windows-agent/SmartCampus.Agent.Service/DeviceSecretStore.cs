using System.Security.Cryptography;
using System.Text;

namespace SmartCampus.Agent.Service;

public sealed class DeviceSecretStore(AgentConfiguration configuration)
{
    public string Load()
    {
        var path = configuration.Settings.SecretFile;
        var protectedBytes = File.ReadAllBytes(path);
        var secretBytes = ProtectedData.Unprotect(protectedBytes, optionalEntropy: null, DataProtectionScope.LocalMachine);
        var secret = Encoding.UTF8.GetString(secretBytes);
        CryptographicOperations.ZeroMemory(secretBytes);
        if (secret.Length < 64) throw new InvalidDataException("Device credential is invalid.");
        return secret;
    }
}
