using System.Text.Json;

namespace SmartCampus.Agent.Service;

public sealed class AgentConfiguration
{
    private readonly Lazy<DeviceSettings> _settings = new(Load);

    public DeviceSettings Settings => _settings.Value;

    private static DeviceSettings Load()
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SmartCampus", "agent.json");
        if (!File.Exists(path))
            throw new FileNotFoundException("Smart Campus Agent is not provisioned. Run the provisioning tool as administrator.", path);

        var settings = JsonSerializer.Deserialize<DeviceSettings>(File.ReadAllText(path))
            ?? throw new InvalidDataException("Invalid Smart Campus Agent configuration.");
        if (!Uri.TryCreate(settings.ApiBaseUrl, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidDataException("Agent API must use HTTPS.");
        if (!Guid.TryParse(settings.ComputerId, out _))
            throw new InvalidDataException("Invalid computer identifier.");
        if (string.IsNullOrWhiteSpace(settings.AllowedDomain))
            throw new InvalidDataException("AllowedDomain must be configured by school IT before enabling sessions.");
        return settings;
    }
}

public sealed record DeviceSettings(string ApiBaseUrl, string ComputerId, string AllowedDomain, string SecretFile);
