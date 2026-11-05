using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SmartCampus.Agent.Service;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options => options.ServiceName = "SmartCampusPCAgent");
builder.Services.AddSingleton<AgentConfiguration>();
builder.Services.AddSingleton<DeviceSecretStore>();
builder.Services.AddSingleton<SmartCampusApiClient>();
builder.Services.AddSingleton<WindowsSession>();
builder.Services.AddHostedService<AgentWorker>();
await builder.Build().RunAsync();
