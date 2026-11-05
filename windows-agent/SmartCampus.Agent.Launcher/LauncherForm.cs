using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace SmartCampus.Agent.Launcher;

public sealed class LauncherForm : Form
{
    private readonly TextBox _code = new()
    {
        MaxLength = 6,
        Font = new Font("Segoe UI", 26, FontStyle.Bold),
        Width = 260,
        TextAlign = HorizontalAlignment.Center,
        PlaceholderText = "000000"
    };
    private readonly Button _start = new() { Text = "AUTORIZAR COMPUTADOR", AutoSize = true, Height = 48 };
    private readonly Button _logout = new() { Text = "Terminar sessão Windows", AutoSize = true, Height = 42 };
    private readonly Button _shutdown = new() { Text = "Desligar computador", AutoSize = true, Height = 42 };
    private readonly Label _status = new()
    {
        AutoSize = true,
        MaximumSize = new Size(720, 0),
        TextAlign = ContentAlignment.MiddleCenter,
        Text = "Este computador está bloqueado até ser introduzido um código temporário válido."
    };
    private bool _allowClose;

    public LauncherForm()
    {
        Text = "Smart Campus PC Agent";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        TopMost = true;
        ShowInTaskbar = false;
        BackColor = Color.FromArgb(10, 20, 38);
        ForeColor = Color.White;
        KeyPreview = true;

        var title = new Label
        {
            Text = "SMART CAMPUS",
            Font = new Font("Segoe UI", 15, FontStyle.Bold),
            ForeColor = Color.FromArgb(130, 180, 255),
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleCenter
        };
        var heading = new Label
        {
            Text = "Acesso ao computador",
            Font = new Font("Segoe UI", 30, FontStyle.Bold),
            AutoSize = true,
            TextAlign = ContentAlignment.MiddleCenter
        };
        var help = new Label
        {
            Text = "Lê o QR permanente deste computador no telemóvel, inicia sessão no Smart Campus e introduz o código temporário de seis dígitos.",
            Font = new Font("Segoe UI", 12),
            AutoSize = true,
            MaximumSize = new Size(720, 0),
            TextAlign = ContentAlignment.MiddleCenter
        };
        var codeLabel = new Label
        {
            Text = "CÓDIGO TEMPORÁRIO",
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
            ForeColor = Color.FromArgb(190, 205, 225),
            AutoSize = true
        };
        var note = new Label
        {
            Text = "Válido durante 10 minutos · Utilização única",
            Font = new Font("Segoe UI", 10),
            ForeColor = Color.FromArgb(170, 185, 205),
            AutoSize = true
        };

        StylePrimaryButton(_start);
        StyleSecondaryButton(_logout);
        StyleSecondaryButton(_shutdown);
        _status.Font = new Font("Segoe UI", 11);
        _status.ForeColor = Color.FromArgb(210, 220, 235);

        var buttons = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Anchor = AnchorStyles.None,
            BackColor = Color.Transparent
        };
        buttons.Controls.Add(_start);
        buttons.Controls.Add(_logout);
        buttons.Controls.Add(_shutdown);

        var content = new TableLayoutPanel
        {
            ColumnCount = 1,
            RowCount = 10,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            BackColor = Color.Transparent,
            Anchor = AnchorStyles.None,
            Padding = new Padding(24)
        };
        content.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        content.Controls.Add(title, 0, 0);
        content.Controls.Add(heading, 0, 1);
        content.Controls.Add(help, 0, 2);
        content.Controls.Add(codeLabel, 0, 3);
        content.Controls.Add(_code, 0, 4);
        content.Controls.Add(note, 0, 5);
        content.Controls.Add(buttons, 0, 6);
        content.Controls.Add(_status, 0, 7);

        var host = new Panel { Dock = DockStyle.Fill, BackColor = BackColor };
        host.Controls.Add(content);
        content.Location = new Point(
            Math.Max(0, (ClientSize.Width - content.PreferredSize.Width) / 2),
            Math.Max(0, (ClientSize.Height - content.PreferredSize.Height) / 2));
        host.Resize += (_, _) => content.Location = new Point(
            Math.Max(0, (host.ClientSize.Width - content.PreferredSize.Width) / 2),
            Math.Max(0, (host.ClientSize.Height - content.PreferredSize.Height) / 2));
        Controls.Add(host);

        _code.KeyPress += (_, eventArgs) =>
        {
            if (!char.IsControl(eventArgs.KeyChar) && !char.IsDigit(eventArgs.KeyChar))
                eventArgs.Handled = true;
        };
        _start.Click += async (_, _) => await SendCommandAsync("start");
        _logout.Click += async (_, _) => await SendCommandAsync("logout");
        _shutdown.Click += async (_, _) => await SendCommandAsync("shutdown");
        FormClosing += (_, eventArgs) =>
        {
            if (!_allowClose) eventArgs.Cancel = true;
        };
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        // Prevent ordinary app-level exit shortcuts. Secure attention (Ctrl+Alt+Del)
        // remains controlled by Windows and must never be intercepted by this app.
        if (keyData == (Keys.Alt | Keys.F4) || keyData == Keys.Escape)
            return true;
        return base.ProcessCmdKey(ref msg, keyData);
    }

    private static void StylePrimaryButton(Button button)
    {
        button.BackColor = Color.FromArgb(37, 99, 235);
        button.ForeColor = Color.White;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.Font = new Font("Segoe UI", 11, FontStyle.Bold);
        button.Padding = new Padding(24, 10, 24, 10);
        button.Margin = new Padding(0, 16, 0, 8);
        button.Cursor = Cursors.Hand;
    }

    private static void StyleSecondaryButton(Button button)
    {
        button.BackColor = Color.FromArgb(27, 42, 64);
        button.ForeColor = Color.White;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Color.FromArgb(75, 95, 125);
        button.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        button.Padding = new Padding(18, 8, 18, 8);
        button.Margin = new Padding(0, 6, 0, 6);
        button.Cursor = Cursors.Hand;
    }

    private async Task SendCommandAsync(string action)
    {
        _start.Enabled = false;
        _logout.Enabled = false;
        _shutdown.Enabled = false;
        _status.Text = "A comunicar com o serviço Smart Campus…";
        try
        {
            using var pipe = new NamedPipeClientStream(".", "SmartCampusAgent", PipeDirection.InOut, PipeOptions.Asynchronous);
            await pipe.ConnectAsync(4000);
            using var writer = new StreamWriter(pipe, new UTF8Encoding(false), leaveOpen: true) { AutoFlush = true };
            using var reader = new StreamReader(pipe, Encoding.UTF8, leaveOpen: true);
            var command = JsonSerializer.Serialize(new { Action = action, Code = action == "start" ? _code.Text : null });
            await writer.WriteLineAsync(command);
            var line = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(25));
            if (string.IsNullOrWhiteSpace(line))
                throw new InvalidOperationException("O serviço não devolveu uma resposta.");
            var result = JsonSerializer.Deserialize<PipeResponse>(line)
                ?? throw new InvalidOperationException("Resposta inválida do serviço.");
            _status.Text = result.Message;

            if (result.Ok && action == "start")
            {
                _code.Clear();
                _logout.Enabled = true;
                _shutdown.Enabled = true;
                _start.Enabled = true;
                return;
            }

            if (result.Ok && action is "logout" or "shutdown")
            {
                _allowClose = true;
                Close();
                return;
            }

            _start.Enabled = true;
            _logout.Enabled = true;
            _shutdown.Enabled = true;
        }
        catch (Exception exception)
        {
            _status.Text = "Não foi possível contactar o serviço Smart Campus. Confirma que o agente está instalado e em execução. " + exception.Message;
            _start.Enabled = true;
            _logout.Enabled = true;
            _shutdown.Enabled = true;
        }
    }

    private sealed record PipeResponse(bool Ok, string Message);
}
