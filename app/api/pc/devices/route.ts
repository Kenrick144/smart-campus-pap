import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getPcAuthContext, hashDeviceToken, isPcAdmin, writePcLog } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!isPcAdmin(context.role)) {
    return NextResponse.json({ error: "Apenas a administração pode gerir as ligações dos computadores." }, { status: 403 });
  }

  const [{ data: devices, error: deviceError }, { data: computers, error: computerError }] = await Promise.all([
    context.admin.from("pc_device_credentials").select("id, computador_id, created_at, last_seen_at, revoked_at").order("created_at", { ascending: false }),
    context.admin.from("computadores").select("id, nome, numero_inventario, sala_id, estado"),
  ]);

  if (deviceError || computerError) {
    console.error("Erro ao carregar dispositivos PC:", deviceError?.message, computerError?.message);
    return NextResponse.json({ error: "Não foi possível consultar as ligações dos computadores." }, { status: 500 });
  }

  const byId = new Map((computers ?? []).map((computer) => [computer.id, computer]));
  const now = Date.now();
  return NextResponse.json({
    devices: (devices ?? []).map((device) => {
      const computer = byId.get(device.computador_id);
      const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
      return {
        id: device.id,
        computerId: device.computador_id,
        computerName: computer?.nome ?? "Computador removido",
        inventoryNumber: computer?.numero_inventario ?? "",
        state: computer?.estado ?? "Desconhecido",
        createdAt: device.created_at,
        lastSeenAt: device.last_seen_at,
        revokedAt: device.revoked_at,
        connected: !device.revoked_at && lastSeen > 0 && now - lastSeen < 2 * 60 * 1000,
      };
    }),
  });
}

export async function POST(request: Request) {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!isPcAdmin(context.role)) {
    return NextResponse.json({ error: "Apenas a administração pode registar computadores." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { computerId?: string };
  const computerId = typeof body.computerId === "string" ? body.computerId : "";
  if (!computerId) return NextResponse.json({ error: "Seleciona um computador." }, { status: 400 });

  const { data: computer, error: computerError } = await context.admin
    .from("computadores")
    .select("id, nome, estado")
    .eq("id", computerId)
    .maybeSingle();

  if (computerError || !computer) {
    return NextResponse.json({ error: "O computador selecionado não existe." }, { status: 404 });
  }
  if (computer.estado === "Inativo" || computer.estado === "Avariado" || computer.estado === "Em manutenção") {
    return NextResponse.json({ error: "Só podes preparar a ligação de um computador operacional." }, { status: 409 });
  }

  // O segredo é apresentado apenas uma vez. Na base de dados fica guardado exclusivamente o hash.
  const token = randomBytes(32).toString("hex");
  const { data: device, error } = await context.admin
    .from("pc_device_credentials")
    .upsert({
      computador_id: computerId,
      token_hash: hashDeviceToken(token),
      created_at: new Date().toISOString(),
      last_seen_at: null,
      revoked_at: null,
    }, { onConflict: "computador_id" })
    .select("id, computador_id, created_at")
    .single();

  if (error || !device) {
    console.error("Erro ao registar credencial do PC:", error?.message);
    return NextResponse.json({ error: "Não foi possível preparar a ligação deste computador." }, { status: 500 });
  }

  await writePcLog(
    context.admin,
    context.userId,
    "Preparar ligação do computador",
    "pc_device_credentials",
    device.id,
    "Foi emitida uma credencial de ligação para " + computer.nome + "."
  );

  return NextResponse.json({
    deviceId: device.id,
    computerId,
    computerName: computer.nome,
    token,
    message: "Guarda este token num local seguro. Só é apresentado uma vez e será necessário durante a instalação do Smart Campus PC Agent.",
  }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { context, response } = await getPcAuthContext();
  if (!context) return response ?? NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!isPcAdmin(context.role)) {
    return NextResponse.json({ error: "Apenas a administração pode revogar ligações." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { computerId?: string };
  const computerId = typeof body.computerId === "string" ? body.computerId : "";
  if (!computerId) return NextResponse.json({ error: "Seleciona um computador." }, { status: 400 });

  const { data, error } = await context.admin
    .from("pc_device_credentials")
    .update({ revoked_at: new Date().toISOString() })
    .eq("computador_id", computerId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Não foi possível revogar a ligação." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Não existe uma ligação ativa para este computador." }, { status: 404 });

  await writePcLog(
    context.admin,
    context.userId,
    "Revogar ligação do computador",
    "pc_device_credentials",
    data.id,
    "Foi revogada a credencial do computador " + computerId + "."
  );
  return NextResponse.json({ success: true });
}
