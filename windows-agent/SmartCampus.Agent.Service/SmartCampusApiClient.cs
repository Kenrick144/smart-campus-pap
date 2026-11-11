using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SmartCampus.Agent.Service;

public sealed class SmartCampusApiClient(AgentConfiguration configuration, DeviceSecretStore secretStore, ILogger<SmartCampusApiClient> logger)
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private string? _secret;

    private string Secret => _secret ??= secretStore.Load();

    public async Task<AgentSession?> StartAsync(string code, CancellationToken cancellationToken)
    {
        var settings = configuration.Settings;
        using var request = CreateRequest(HttpMethod.Post, "/api/pc/agent/start");
        request.Content = JsonContent.Create(new { computer_id = settings.ComputerId, code });
        using var response = await _http.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<StartResponse>(cancellationToken: cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new AgentApiException(payload?.Error ?? "O Smart Campus recusou o início da sessão.");
        return payload?.Session ?? throw new AgentApiException("Resposta de sessão inválida.");
    }

    public async Task<bool> HeartbeatAsync(string sessionId, CancellationToken cancellationToken)
    {
        var settings = configuration.Settings;
        using var request = CreateRequest(HttpMethod.Post, "/api/pc/agent/heartbeat");
        request.Content = JsonContent.Create(new { computer_id = settings.ComputerId, session_id = sessionId });
        using var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode is System.Net.HttpStatusCode.Conflict or System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.NotFound) return false;
        if (!response.IsSuccessStatusCode)
        {
            logger.LogWarning("Heartbeat rejected with HTTP {StatusCode}; the agent will retry.", (int)response.StatusCode);
            return (int)response.StatusCode >= 500;
        }
        var payload = await response.Content.ReadFromJsonAsync<HeartbeatResponse>(cancellationToken: cancellationToken);
        return payload?.Active == true;
    }

    public async Task<bool> EndAsync(string sessionId, string reason, CancellationToken cancellationToken)
    {
        var settings = configuration.Settings;
        using var request = CreateRequest(HttpMethod.Post, "/api/pc/agent/end");
        request.Content = JsonContent.Create(new { computer_id = settings.ComputerId, session_id = sessionId, reason });
        using var response = await _http.SendAsync(request, cancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<EndResponse>(cancellationToken: cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new AgentApiException(payload?.Error ?? "Não foi possível terminar a sessão.");
        return payload?.Ended == true;
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string path)
    {
        var baseUrl = configuration.Settings.ApiBaseUrl.TrimEnd('/');
        var request = new HttpRequestMessage(method, baseUrl + path);
        request.Headers.TryAddWithoutValidation("x-pc-agent-key", Secret);
        return request;
    }

    private sealed record StartResponse([property: JsonPropertyName("session")] AgentSession? Session, [property: JsonPropertyName("error")] string? Error);
    private sealed record HeartbeatResponse([property: JsonPropertyName("active")] bool Active);
    private sealed record EndResponse([property: JsonPropertyName("ended")] bool Ended, [property: JsonPropertyName("error")] string? Error);
}

public sealed record AgentSession(
    [property: JsonPropertyName("session_id")] string SessionId,
    [property: JsonPropertyName("user_id")] string UserId,
    [property: JsonPropertyName("user_name")] string UserName,
    [property: JsonPropertyName("user_role")] string UserRole,
    [property: JsonPropertyName("computador_id")] string ComputerId,
    [property: JsonPropertyName("computador_nome")] string ComputerName,
    [property: JsonPropertyName("started_at")] DateTimeOffset StartedAt);

public sealed class AgentApiException(string message) : Exception(message);
