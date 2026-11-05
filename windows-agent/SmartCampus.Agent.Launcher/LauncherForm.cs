using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace SmartCampus.Agent.Launcher;

public sealed class LauncherForm : Form
{
    private readonly TextBox _code = new() { MaxLength = 6, Font = new Font("Segoe UI", 20), Width = 190, TextAlign = HorizontalAlignment.Center };
    private readonly Button _start = new() { Text = "Iniciar utilização", AutoSize = true };
    private readonly Button _logout = new() { Text = "Terminar sessão e sair do Windows", AutoSize = true, Enabled = false };
    private readonly Label _status = new() { AutoSize = true, MaximumSize = new Size(430, 0), Text = "A aguardar autorização do Smart Campus." };

    public LauncherForm()
    {
        Text = "Smart Campus — Computador da escola";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        ClientSize = new Size(470, 300);

        var title = new Label { Text = "Acesso ao computador", Font = new Font("Segoe UI", 18, FontStyle.Bold), AutoSize = true };
        var help = new Label { Text = "Lê o QR permanente do computador no telemóvel, inicia sessão no Smart Campus e introduz aqui o código de seis dígitos.", AutoSize = true, MaximumSize = new Size(420, 0) };
        var layout = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, Padding = new Padding(22), WrapContents = false, AutoScroll = true };
        layout.Controls.Add(title);
        layout.Controls.Add(help);
        layout.Controls.Add(new Label { Text = "Código temporário", AutoSize = true, Margin = new Padding(0, 12, 0, 2) });
        layout.Controls.Add(_code);
        layout.Controls.Add(_start);
        layout.Controls.Add(_logout);
        layout.Controls.Add(_status);
        Controls.Add(layout);

        _code.KeyPress += (_, eventArgs) =>
        {
            if (!char.IsControl(eventArgs.KeyChar) && !char.IsDigit(eventArgs.KeyChar)) eventArgs.Handled = true;
        };
        _start.Click += async (_, _) => await SendCommandAsync("start");
        _logout.Click += async (_, _) => await SendCommandAsync("logout");
    }

    private async Task SendCommandAsync(string action)
    {
        _start.Enabled = false;
        _logout.Enabled = false;
        _status.Text = "A comunicar com o serviço Smart Campus…";
        try
        {
            using var pipe = new NamedPipeClientStream(".", "SmartCampusAgent", PipeDirection.InOut, PipeOptions.Asynchronous);
            await pipe.ConnectAsync(4000);
            using var writer = new StreamWriter(pipe, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
            using var reader = new StreamReader(pipe, Encoding.UTF8, leaveOpen: true);
            var command = JsonSerializer.Serialize(new { Action = action, Code = action == "start" ? _code.Text : null });
            await writer.WriteLineAsync(command);
            var line = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(20));
            if (string.IsNullOrWhiteSpace(line)) throw new InvalidOperationException("O serviço não devolveu uma resposta.");
            var result = JsonSerializer.Deserialize<PipeResponse>(line) ?? throw new InvalidOperationException("Resposta inválida do serviço.");
            _status.Text = result.Message;
            if (result.Ok && action == "start")
            {
                _code.Clear();
                _logout.Enabled = true;
            }
            if (result.Ok && action == "logout") Close();
            if (!result.Ok) _start.Enabled = true;
        }
        catch (Exception exception)
        {
            _status.Text = "Não foi possível contactar o serviço Smart Campus. Confirma que o agente está instalado e em execução. " + exception.Message;
            _start.Enabled = true;
        }
        finally
        {
            if (!IsDisposed && !_logout.Enabled && _start.Enabled == false) _start.Enabled = true;
        }
    }

    private sealed record PipeResponse(bool Ok, string Message);
}
