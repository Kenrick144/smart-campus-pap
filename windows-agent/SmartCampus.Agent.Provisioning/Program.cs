using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("A configuração do PC Agent só pode ser executada no Windows.");
    return 1;
}

var values = ParseArgs(args);
if (values.ContainsKey("help") || !values.TryGetValue("computer-id", out var computerId) ||
    !values.TryGetValue("api-url", out var apiUrl) || !values.TryGetValue("allowed-domain", out var allowedDomain))
{
    Console.WriteLine("Smart Campus Agent Provisioning");
    Console.WriteLine("Uso: SmartCampus.Agent.Provisioning.exe --computer-id <UUID> --api-url <HTTPS_URL> --allowed-domain <DOMINIO_WINDOWS>");
    return 2;
}

if (!Guid.TryParse(computerId, out _) || !Uri.TryCreate(apiUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
{
    Console.Error.WriteLine("O identificador do PC ou URL HTTPS não é válido.");
    return 2;
}

using var identity = WindowsIdentity.GetCurrent();
var principal = new WindowsPrincipal(identity);
if (!principal.IsInRole(WindowsBuiltInRole.Administrator))
{
    Console.Error.WriteLine("Executa esta ferramenta como Administrador local.");
    return 5;
}

Console.Write("Cola a credencial de dispositivo apresentada uma única vez no enrollment: ");
var secret = ReadSecret();
if (secret.Length != 64 || !secret.All(Uri.IsHexDigit))
{
    Console.Error.WriteLine("\nA credencial deve ter 64 caracteres hexadecimais.");
    return 2;
}

var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SmartCampus");
Directory.CreateDirectory(root);
RunIcacls(root, "/inheritance:r", "/grant:r", "SYSTEM:(OI)(CI)F", "BUILTIN\\\\Administrators:(OI)(CI)F");
var secretPath = Path.Combine(root, "agent.secret");
var configPath = Path.Combine(root, "agent.json");
var clearBytes = Encoding.UTF8.GetBytes(secret);
var protectedBytes = ProtectedData.Protect(clearBytes, optionalEntropy: null, DataProtectionScope.LocalMachine);
CryptographicOperations.ZeroMemory(clearBytes);
secret = string.Empty;

File.WriteAllBytes(secretPath, protectedBytes);
var config = new
{
    ApiBaseUrl = uri.GetLeftPart(UriPartial.Authority),
    ComputerId = computerId,
    AllowedDomain = allowedDomain,
    SecretFile = secretPath
};
File.WriteAllText(configPath, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }), new UTF8Encoding(false));

RunIcacls(root, "/inheritance:r", "/grant:r", "SYSTEM:(OI)(CI)F", "BUILTIN\\Administrators:(OI)(CI)F");
RunIcacls(secretPath, "/inheritance:r", "/grant:r", "SYSTEM:F", "BUILTIN\\Administrators:F");
RunIcacls(configPath, "/inheritance:r", "/grant:r", "SYSTEM:F", "BUILTIN\\Administrators:F");

Console.WriteLine();
Console.WriteLine("Configuração protegida criada em ProgramData\\SmartCampus.");
Console.WriteLine("A credencial foi protegida com DPAPI (LocalMachine). Não a guardes noutro ficheiro.");
Console.WriteLine("Instala agora o serviço através de install-agent.ps1.");
return 0;

static Dictionary<string, string> ParseArgs(string[] args)
{
    var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    for (var i = 0; i < args.Length; i++)
    {
        if (args[i] == "--help") { result["help"] = "true"; continue; }
        if (!args[i].StartsWith("--", StringComparison.Ordinal) || i + 1 >= args.Length) continue;
        result[args[i][2..]] = args[++i];
    }
    return result;
}

static string ReadSecret()
{
    var builder = new StringBuilder();
    while (true)
    {
        var key = Console.ReadKey(intercept: true);
        if (key.Key == ConsoleKey.Enter) break;
        if (key.Key == ConsoleKey.Backspace)
        {
            if (builder.Length > 0) builder.Length--;
            continue;
        }
        if (!char.IsControl(key.KeyChar)) builder.Append(key.KeyChar);
    }
    Console.WriteLine();
    return builder.ToString().Trim();
}

static void RunIcacls(string path, params string[] arguments)
{
    var start = new ProcessStartInfo("icacls.exe") { UseShellExecute = false, CreateNoWindow = true };
    start.ArgumentList.Add(path);
    foreach (var argument in arguments) start.ArgumentList.Add(argument);
    using var process = Process.Start(start) ?? throw new InvalidOperationException("Não foi possível configurar permissões NTFS.");
    process.WaitForExit();
    if (process.ExitCode != 0) throw new InvalidOperationException("icacls falhou ao proteger os ficheiros do agente.");
}
