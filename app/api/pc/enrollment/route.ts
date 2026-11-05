import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase-admin";

export const runtime = "nodejs";

const ADMIN_ROLES = new Set(["Administrador", "Administrador Adjunto"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizeAdministrator(request: NextRequest) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { response: NextResponse.json({ error: "Sessão não autenticada." }, { status: 401 }) };

  const admin = getSupabaseAdmin();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    return { response: NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) };
  }

  const { data: user, error } = await admin
    .from("users")
    .select("id, role, status")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!user || user.status !== "Ativo" || !ADMIN_ROLES.has(user.role)) {
    return { response: NextResponse.json({ error: "Apenas Administrador ou Administrador Adjunto podem gerir computadores." }, { status: 403 }) };
  }

  return { admin, user };
}

function migrationRequired() {
  return NextResponse.json(
    { error: "A migração do QR permanente ainda não foi aplicada à base de dados. O registo está temporariamente bloqueado." },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdministrator(request);
    if ("response" in auth) return auth.response;

    const [{ data: rooms, error: roomsError }, { data: computers, error: computersError }, { data: credentials, error: credentialsError }] = await Promise.all([
      auth.admin.from("salas").select("id, nome").order("nome"),
      auth.admin.from("computadores").select("id, nome, numero_inventario, estado, sala_id, qr_public_id").order("nome"),
      auth.admin.from("pc_device_credentials").select("computador_id, revoked_at"),
    ]);

    if (roomsError) throw roomsError;
    if (computersError) {
      if (computersError.message.includes("qr_public_id")) return migrationRequired();
      throw computersError;
    }
    if (credentialsError) throw credentialsError;

    const credentialByComputer = new Map((credentials ?? []).map((item) => [item.computador_id, !item.revoked_at]));
    return NextResponse.json({
      rooms: rooms ?? [],
      computers: (computers ?? []).map((computer) => ({
        ...computer,
        agent_enrolled: credentialByComputer.get(computer.id) ?? false,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("PC enrollment list failed:", error);
    return NextResponse.json({ error: "Não foi possível carregar os computadores." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let createdComputerId: string | null = null;
  try {
    const auth = await authorizeAdministrator(request);
    if ("response" in auth) return auth.response;

    const body = await request.json() as {
      nome?: string;
      sala_id?: string;
      numero_inventario?: string;
      marca?: string;
      modelo?: string;
    };

    const nome = body.nome?.trim();
    const salaId = body.sala_id?.trim();
    const inventory = body.numero_inventario?.trim() || null;
    const marca = body.marca?.trim() || null;
    const modelo = body.modelo?.trim() || null;

    if (!nome || nome.length > 100 || !salaId || !UUID_PATTERN.test(salaId)) {
      return NextResponse.json({ error: "Indica um nome válido e seleciona uma sala." }, { status: 400 });
    }
    if ([inventory, marca, modelo].some((value) => value && value.length > 100)) {
      return NextResponse.json({ error: "Os campos de inventário, marca e modelo têm limite de 100 caracteres." }, { status: 400 });
    }

    const { data: room, error: roomError } = await auth.admin
      .from("salas")
      .select("id")
      .eq("id", salaId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) return NextResponse.json({ error: "A sala selecionada não existe." }, { status: 400 });

    const { data: computer, error: computerError } = await auth.admin
      .from("computadores")
      .insert({
        nome,
        sala_id: salaId,
        numero_inventario: inventory,
        marca,
        modelo,
        estado: "Operacional",
      })
      .select("id, nome, numero_inventario, estado, sala_id, qr_public_id")
      .single();

    if (computerError) {
      if (computerError.message.includes("qr_public_id")) return migrationRequired();
      throw computerError;
    }
    createdComputerId = computer.id;

    // The raw device secret is returned once. Only its SHA-256 hash is persisted.
    const deviceSecret = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(deviceSecret, "utf8").digest("hex");
    const { error: credentialError } = await auth.admin
      .from("pc_device_credentials")
      .insert({ computador_id: computer.id, token_hash: tokenHash });

    if (credentialError) {
      await auth.admin.from("computadores").delete().eq("id", computer.id);
      createdComputerId = null;
      throw credentialError;
    }

    const origin = request.nextUrl.origin;
    return NextResponse.json({
      computer,
      qr_url: `${origin}/pc/${computer.qr_public_id}`,
      device_secret: deviceSecret,
      secret_notice: "Copia agora esta credencial. Não será apresentada novamente.",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (createdComputerId) {
      try {
        const admin = getSupabaseAdmin();
        await admin.from("computadores").delete().eq("id", createdComputerId);
      } catch { /* Preserve the original error. */ }
    }
    console.error("PC enrollment failed:", error);
    return NextResponse.json({ error: "Não foi possível registar o computador. Confirma se a migração está aplicada e se os dados são válidos." }, { status: 500 });
  }
}
