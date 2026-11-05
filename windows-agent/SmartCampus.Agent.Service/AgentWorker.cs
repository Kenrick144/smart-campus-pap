using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.IO.Pipes.AccessControl;
using Microsoft.Extensions.Hosting;

namespace SmartCampus.Agent.Service;

public sealed class AgentWorker(
    ILogger<AgentWorker> logger,
    AgentConfiguration configuration,
    SmartCampusApiClient api,
    WindowsSession windows,
    AgentStateStore stateStore) : BackgroundService
{
    private const string PipeName = "SmartCampusAgent";
    private readonly SemaphoreSlim _sessionLock = new(1, 1);
    private AgentSession? _activeSession;
    private string? _windowsUser;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            _ = configuration.Settings;
            var persisted = stateStore.Load();
            if (persisted is not null)
            {
                _activeSession = persisted.Session;
                _windowsUser = persisted.WindowsUser;
                logger.LogInformation("Recovered a previously active Smart Campus session.");
            }
            logger.LogInformation("Smart Campus PC Agent started for computer {ComputerId}.", configuration.Settings.ComputerId);
            await Task.WhenAll(ListenForCommandsAsync(stoppingToken), HeartbeatLoopAsync(stoppingToken));
        }
        catch (Exception exception)
        {
            logger.LogCritical(exception, "Smart Campus PC Agent could not start. Check provisioning and school IT configuration.");
            throw;
        }
    }

    private async Task ListenForCommandsAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            var security = new PipeSecurity();
            var users = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
            security.AddAccessRule(new PipeAccessRule(users, PipeAccessRights.ReadWrite, AccessControlType.Allow));
            await using var pipe = NamedPipeServerStreamAcl.Create(
                PipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous, 4096, 4096, security);

            await pipe.WaitForConnectionAsync(token);
            using var reader = new StreamReader(pipe, Encoding.UTF8, leaveOpen: true);
            using var writer = new StreamWriter(pipe, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
            var line = await reader.ReadLineAsync(token);
            if (string.IsNullOrWhiteSpace(line)) continue;

            PipeResponse result;
            try
            {
                var command = JsonSerializer.Deserialize<PipeCommand>(line) ?? throw new InvalidDataException("Pedido vazio.");
                result = await HandleCommandAsync(command, token);
            }
            catch (Exception exception)
            {
                logger.LogWarning("Launcher command rejected: {Message}", exception.Message);
                result = new PipeResponse(false, exception.Message);
            }

            await writer.WriteLineAsync(JsonSerializer.Serialize(result));
        }
    }

    private async Task<PipeResponse> HandleCommandAsync(PipeCommand command, CancellationToken token)
    {
        await _sessionLock.WaitAsync(token);
        try
        {
            var identity = windows.GetActiveConsoleIdentity();
            if (identity is null) return new PipeResponse(false, "Não foi detetada uma sessão Windows interativa.");
            var allowedDomain = configuration.Settings.AllowedDomain;
            if (!string.Equals(identity.Domain, allowedDomain, StringComparison.OrdinalIgnoreCase))
                return new PipeResponse(false, "Inicia sessão no Windows com a tua conta institucional.");

            if (string.Equals(command.Action, "start", StringComparison.OrdinalIgnoreCase))
            {
                if (_activeSession is not null && !string.Equals(identity.QualifiedName, _windowsUser, StringComparison.OrdinalIgnoreCase))
                {
                    await api.EndAsync(_activeSession.SessionId, "timeout", token);
                    _activeSession = null;
                    _windowsUser = null;
                    stateStore.Clear();
                }
                if (_activeSession is not null) return new PipeResponse(false, "Este computador já tem uma sessão Smart Campus ativa.");
                if (command.Code is null || command.Code.Length != 6 || command.Code.Any(c => c is < '0' or > '9'))
                    return new PipeResponse(false, "Introduz um código de seis dígitos.");
                var session = await api.StartAsync(command.Code, token);
                if (session is null || string.IsNullOrWhiteSpace(session.SessionId))
                    return new PipeResponse(false, "O servidor não devolveu uma sessão válida.");
                try { stateStore.Save(session, identity.QualifiedName); }
                catch
                {
                    await api.EndAsync(session.SessionId, "erro", token);
                    throw;
                }
                _activeSession = session;
                _windowsUser = identity.QualifiedName;
                logger.LogInformation("Smart Campus session started for role {Role}.", session.UserRole);
                return new PipeResponse(true, $"Sessão iniciada para {session.UserName}.", session);
            }

            if (string.Equals(command.Action, "logout", StringComparison.OrdinalIgnoreCase))
            {
                if (_activeSession is null) return new PipeResponse(false, "Não existe sessão Smart Campus ativa.");
                if (!string.Equals(identity.QualifiedName, _windowsUser, StringComparison.OrdinalIgnoreCase))
                    return new PipeResponse(false, "A sessão ativa pertence a outro utilizador Windows. Contacta o responsável IT.");
                var ended = await api.EndAsync(_activeSession.SessionId, "desligado", token);
                if (!ended) return new PipeResponse(false, "A sessão Smart Campus já não está ativa.");
                var loggedOff = windows.Logoff(identity.SessionId);
                _activeSession = null;
                _windowsUser = null;
                stateStore.Clear();
                if (!loggedOff) return new PipeResponse(false, "A sessão Smart Campus terminou, mas o Windows não confirmou o logout. Contacta o responsável IT.");
                return new PipeResponse(true, "Sessão terminada. O Windows vai fechar a sessão institucional.");
            }

            return new PipeResponse(false, "Comando desconhecido.");
        }
        finally { _sessionLock.Release(); }
    }

    private async Task HeartbeatLoopAsync(CancellationToken token)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(token))
        {
            await _sessionLock.WaitAsync(token);
            try
            {
                if (_activeSession is null) continue;
                var identity = windows.GetActiveConsoleIdentity();
                if (identity is null || !string.Equals(identity.QualifiedName, _windowsUser, StringComparison.OrdinalIgnoreCase))
                {
                    await api.EndAsync(_activeSession.SessionId, "timeout", token);
                    logger.LogWarning("Windows session changed or ended; Smart Campus session closed.");
                    _activeSession = null;
                    _windowsUser = null;
                    stateStore.Clear();
                    continue;
                }

                var active = await api.HeartbeatAsync(_activeSession.SessionId, token);
                if (!active)
                {
                    logger.LogWarning("Server reports no active Smart Campus session.");
                    _activeSession = null;
                    _windowsUser = null;
                    stateStore.Clear();
                }
            }
            catch (Exception exception)
            {
                logger.LogWarning("Heartbeat failed; will retry. {Message}", exception.Message);
            }
            finally { _sessionLock.Release(); }
        }
    }

    private sealed record PipeCommand(string Action, string? Code);
    private sealed record PipeResponse(bool Ok, string Message, AgentSession? Session = null);
}
