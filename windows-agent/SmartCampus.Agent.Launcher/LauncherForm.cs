using System.Drawing.Drawing2D;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace SmartCampus.Agent.Launcher;

public sealed class LauncherForm : Form
{
    private readonly TextBox _code = new()
    {
        MaxLength = 6,
        Font = new Font("Segoe UI", 30, FontStyle.Bold),
        Tag = 30f,
        Width = 620,
        Height = 104,
        TextAlign = HorizontalAlignment.Center,
        BackColor = Color.White,
        ForeColor = Color.FromArgb(18, 27, 48),
        BorderStyle = BorderStyle.None,
        PlaceholderText = "______"
    };

    private readonly Button _start = new() { Text = "AUTORIZAR COMPUTADOR", Height = 104, Dock = DockStyle.Fill };
    private readonly Button _logout = new() { Text = "Terminar sessão Windows", Height = 104, Dock = DockStyle.Fill };
    private readonly Button _shutdown = new() { Text = "Desligar computador", Height = 104, Dock = DockStyle.Fill };
    private readonly Label _status = new()
    {
        AutoSize = true,
        MaximumSize = new Size(820, 0),
        TextAlign = ContentAlignment.MiddleCenter,
        Text = ""
    };
    private bool _allowClose;
    private readonly RoundedPanel _card;

    public LauncherForm()
    {
        Text = "Smart Campus PC Agent";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        TopMost = true;
        ShowInTaskbar = false;
        BackColor = Color.Black;
        ForeColor = Color.White;
        KeyPreview = true;
        MinimumSize = new Size(640, 720);

        _card = new RoundedPanel
        {
            BackColor = Color.FromArgb(12, 21, 43),
            CornerRadius = 34,
            Padding = new Padding(36, 30, 36, 30),
            Width = 1010,
            Height = 1120,
            Anchor = AnchorStyles.None
        };

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 7,
            BackColor = Color.Transparent,
            Padding = new Padding(0),
            Margin = new Padding(0)
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 112));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 205));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 120));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 18));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 132));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 154));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 154));

        var title = new Label
        {
            Text = "SMART CAMPUS",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 38, FontStyle.Bold),
            Tag = 38f,
            ForeColor = Color.FromArgb(126, 174, 255),
            TextAlign = ContentAlignment.MiddleCenter
        };
        var heading = new Label
        {
            Text = "Acesso ao\ncomputador",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 54, FontStyle.Bold),
            Tag = 54f,
            ForeColor = Color.White,
            TextAlign = ContentAlignment.MiddleCenter
        };
        var help = new Label
        {
            Text = "Introduz o teu código temporário",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 29, FontStyle.Regular),
            Tag = 29f,
            ForeColor = Color.FromArgb(211, 220, 237),
            TextAlign = ContentAlignment.MiddleCenter
        };

        var codeHost = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.White,
            Padding = new Padding(24, 8, 24, 8),
            Margin = new Padding(0, 8, 0, 16)
        };
        _code.Dock = DockStyle.Fill;
        _code.Margin = new Padding(0);
        codeHost.Controls.Add(_code);

        StylePrimaryButton(_start);
        StyleSecondaryButton(_logout);
        StyleSecondaryButton(_shutdown);

        layout.Controls.Add(title, 0, 0);
        layout.Controls.Add(heading, 0, 1);
        layout.Controls.Add(help, 0, 2);
        layout.Controls.Add(codeHost, 0, 3);
        layout.Controls.Add(_start, 0, 4);
        layout.Controls.Add(_logout, 0, 5);
        layout.Controls.Add(_shutdown, 0, 6);
        _card.Controls.Add(layout);
        Controls.Add(_card);

        Resize += (_, _) => CenterCard();
        Shown += (_, _) => CenterCard();
        CenterCard();

        _code.KeyPress += (_, eventArgs) =>
        {
            if (!char.IsControl(eventArgs.KeyChar) && !char.IsDigit(eventArgs.KeyChar))
                eventArgs.Handled = true;
        };
        _code.TextChanged += (_, _) =>
        {
            if (_code.Text.Length > 6)
                _code.Text = _code.Text[..6];
        };
        _start.Click += async (_, _) => await SendCommandAsync("start");
        _logout.Click += async (_, _) => await SendCommandAsync("logout");
        _shutdown.Click += async (_, _) => await SendCommandAsync("shutdown");
        FormClosing += (_, eventArgs) =>
        {
            if (!_allowClose) eventArgs.Cancel = true;
        };
    }

    private void CenterCard()
    {
        var width = Math.Min(1010, Math.Max(560, ClientSize.Width - 64));
        var height = Math.Min(1120, Math.Max(700, ClientSize.Height - 32));
        _card.Size = new Size(width, height);
        _card.Location = new Point(
            Math.Max(0, (ClientSize.Width - _card.Width) / 2),
            Math.Max(0, (ClientSize.Height - _card.Height) / 2));
        var scale = Math.Min(width / 1010f, height / 1120f);
        foreach (Control control in _card.Controls)
            ScaleControlTree(control, scale);
    }

    private static void ScaleControlTree(Control control, float scale)
    {
        foreach (Control child in control.Controls)
        {
            if (child is Label label && label.Tag is float labelBaseSize)
                label.Font = new Font("Segoe UI", Math.Max(14, labelBaseSize * scale), label.Font.Style);
            else if (child is Button button)
                button.Font = new Font("Segoe UI", Math.Max(12, 29 * scale), FontStyle.Bold);
            else if (child is TextBox textBox && textBox.Tag is float textBaseSize)
                textBox.Font = new Font("Segoe UI", Math.Max(18, textBaseSize * scale), FontStyle.Bold);
            ScaleControlTree(child, scale);
        }
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        // Keep Windows secure-attention and system security shortcuts under Windows control.
        if (keyData == (Keys.Alt | Keys.F4) || keyData == Keys.Escape)
            return true;
        return base.ProcessCmdKey(ref msg, keyData);
    }

    private static void StylePrimaryButton(Button button)
    {
        button.BackColor = Color.FromArgb(38, 99, 235);
        button.ForeColor = Color.White;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.Font = new Font("Segoe UI", 29, FontStyle.Bold);
        button.Margin = new Padding(0, 10, 0, 12);
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
    }

    private static void StyleSecondaryButton(Button button)
    {
        button.BackColor = Color.FromArgb(12, 21, 43);
        button.ForeColor = Color.White;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Color.FromArgb(76, 94, 126);
        button.FlatAppearance.BorderSize = 2;
        button.Font = new Font("Segoe UI", 27, FontStyle.Bold);
        button.Margin = new Padding(0, 10, 0, 12);
        button.Cursor = Cursors.Hand;
        button.UseVisualStyleBackColor = false;
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
                SetButtonsEnabled(true);
                return;
            }

            if (result.Ok && action is "logout" or "shutdown")
            {
                _allowClose = true;
                Close();
                return;
            }

            SetButtonsEnabled(true);
        }
        catch (Exception exception)
        {
            _status.Text = "Não foi possível contactar o serviço Smart Campus. Confirma que o agente está instalado e em execução. " + exception.Message;
            SetButtonsEnabled(true);
        }
    }

    private void SetButtonsEnabled(bool enabled)
    {
        _start.Enabled = enabled;
        _logout.Enabled = enabled;
        _shutdown.Enabled = enabled;
    }

    private sealed record PipeResponse(bool Ok, string Message);

    private sealed class RoundedPanel : Panel
    {
        public int CornerRadius { get; set; } = 30;

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var path = new GraphicsPath();
            var d = CornerRadius * 2;
            path.AddArc(0, 0, d, d, 180, 90);
            path.AddArc(Width - d - 1, 0, d, d, 270, 90);
            path.AddArc(Width - d - 1, Height - d - 1, d, d, 0, 90);
            path.AddArc(0, Height - d - 1, d, d, 90, 90);
            path.CloseFigure();
            Region = new Region(path);
        }
    }
}