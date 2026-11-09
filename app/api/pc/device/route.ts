import { NextResponse } from "next/server";
import { hashDeviceToken, hashTemporaryCode, writePcLog } from "../_lib";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDevice(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
  if (!match) return { admin: null, device: null };

  const admin = createAdminClient();
  const { data: device, error } = await admin
    .from("pc_device_credentials")
    .select("id, computador_id, revoked_at")
    .eq("token_hash", hashDeviceToken(match[1]))
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !device) return { admin, device: null };
  await admin.from("pc_device_credentials")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", device.id);
  return { admin, device };
}

export async function GET(request: Request) {
  const { admin, device } = await getDevice(request);
  if (!admin || !device) {
    return NextResponse.json({ error: "Credencial do computador inválida ou revogada." }, { status: 401 });
  }

  const { data: session, error } = await admin
    .from("sessoes_computador")
    .select("id, aluno_id, started_at, heartbeat_at")
    .eq("computador_id", device.computador_id)
    .is("ended_at", null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Não foi possível consultar a sessão deste PC." }, { status: 500 });

  if (session && new Date(session.heartbeat_at).getTime() < Date.now() - 2 * 60 * 1000) {
    await admin.from("sessoes_computador")
      .update({ ended_at: new Date().toISOString(), ended_reason: "timeout" })
      .eq("id", session.id)
      .is("ended_at", null);
    return NextResponse.json({ active: false, reason: "timeout" });
  }

  if (!session) return NextResponse.json({ active: false });

  const [{ data: computer }, { data: student }] = await Promise.all([
    admin.from("computadores").select("id, nome, estado").eq("id", device.computador_id).maybeSingle(),
    admin.from("users").select("name").eq("id", session.aluno_id).maybeSingle(),
  ]);

  return NextResponse.json({
    active: true,
    sessionId: session.id,
    studentId: session.aluno_id,
    studentName: student?.name ?? "Aluno",
    computerId: computer?.id,
    computerName: computer?.nome ?? "Computador",
    startedAt: session.started_at,
    heartbeatAt: session.heartbeat_at,
  });
}

export async function POST(request: Request) {
  const { admin, device } = await getDevice(request);
  if (!admin || !device) {
    return NextResponse.json({ error: "Credencial do computador inválida ou revogada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    code?: string;
    sessionId?: string;
  };
  const action = body.action ?? "";

  if (action === "start") {
    const code = typeof body.code === "string" ? body.code.replace(/\\s+/g, "") : "";
    if (!/^\\d{8}$/.test(code)) {
      return NextResponse.json({ error: "Introduz um código válido de 8 algarismos." }, { status: 400 });
    }

    const { data, error } = await admin.rpc("start_pc_session_guarded", {
      p_computador_id: device.computador_id,
      p_codigo_hash: hashTemporaryCode(code),
      p_device_credential_id: device.id,
    });

    if (error) {
      console.error("Erro ao iniciar sessão de computador:", error.message);
      return NextResponse.json({ error: "Não foi possível iniciar a sessão." }, { status: 500 });
    }

    const result = data as {
      ok?: boolean;
      error?: string;
      retry_at?: string | null;
      attempts_remaining?: number;
      session_id?: string;
      aluno_id?: string;
      aluno_nome?: string;
      computador_id?: string;
      computador_nome?: string;
      started_at?: string;
    } | null;

    if (!result?.ok) {
      const codeError = result?.error ?? "UNKNOWN";
      if (codeError === "INVALID_OR_EXPIRED_CODE") {
        return NextResponse.json({
          error: "Código inválido, expirado, cancelado ou já utilizado.",
          attemptsRemaining: result?.attempts_remaining ?? null,
        }, { status: 401 });
      }
      if (codeError === "DEVICE_TEMPORARILY_LOCKED") {
        return NextResponse.json({
          error: "Demasiadas tentativas inválidas. Este computador está temporariamente bloqueado durante 10 minutos.",
          retryAt: result?.retry_at ?? null,
        }, { status: 429 });
      }
      if (codeError === "DEVICE_CREDENTIAL_INVALID") {
        return NextResponse.json({ error: "Credencial do computador inválida ou revogada." }, { status: 401 });
      }
      if (codeError === "COMPUTER_NOT_FOUND") {
        return NextResponse.json({ error: "Este computador já não está registado no inventário." }, { status: 404 });
      }
      if (codeError === "COMPUTER_NOT_OPERATIONAL") {
        return NextResponse.json({ error: "Este computador não está operacional e não pode iniciar uma sessão." }, { status: 409 });
      }
      if (codeError === "COMPUTER_IN_USE") {
        return NextResponse.json({ error: "Este computador já está a ser utilizado." }, { status: 409 });
      }
      if (codeError === "STUDENT_HAS_ACTIVE_SESSION") {
        return NextResponse.json({ error: "Este aluno já tem uma sessão ativa noutro computador." }, { status: 409 });
      }
      if (codeError === "STUDENT_NOT_ENROLLED" || codeError === "STUDENT_NOT_ACTIVE") {
        return NextResponse.json({ error: "A conta do aluno não está ativa ou não tem matrícula ativa." }, { status: 403 });
      }
      return NextResponse.json({ error: "Não foi possível iniciar a sessão." }, { status: 500 });
    }

    if (!result.session_id || !result.aluno_id) {
      return NextResponse.json({ error: "O servidor não confirmou o início da sessão." }, { status: 500 });
    }

    await writePcLog(
      admin,
      result.aluno_id,
      "Iniciar sessão de computador",
      "sessoes_computador",
      result.session_id,
      "O aluno " + (result.aluno_nome ?? "") + " iniciou uma sessão em " + (result.computador_nome ?? "um computador") + "."
    );

    return NextResponse.json({
      active: true,
      sessionId: result.session_id,
      studentId: result.aluno_id,
      studentName: result.aluno_nome,
      computerId: result.computador_id,
      computerName: result.computador_nome,
      startedAt: result.started_at,
    }, { status: 201 });
  }

  if (action === "heartbeat") {
    if (!body.sessionId) return NextResponse.json({ error: "Sessão não identificada." }, { status: 400 });
    const { data, error } = await admin
      .from("sessoes_computador")
      .update({ heartbeat_at: new Date().toISOString() })
      .eq("id", body.sessionId)
      .eq("computador_id", device.computador_id)
      .is("ended_at", null)
      .select("id, heartbeat_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: "Não foi possível atualizar a sessão." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "A sessão já terminou ou não pertence a este PC." }, { status: 404 });
    return NextResponse.json({ success: true, heartbeatAt: data.heartbeat_at });
  }

  if (action === "end") {
    if (!body.sessionId) return NextResponse.json({ error: "Sessão não identificada." }, { status: 400 });
    const { data, error } = await admin
      .from("sessoes_computador")
      .update({ ended_at: new Date().toISOString(), ended_reason: "aluno" })
      .eq("id", body.sessionId)
      .eq("computador_id", device.computador_id)
      .is("ended_at", null)
      .select("id, aluno_id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: "Não foi possível terminar a sessão." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "A sessão já terminou ou não pertence a este PC." }, { status: 404 });

    await writePcLog(
      admin,
      data.aluno_id,
      "Terminar sessão de computador",
      "sessoes_computador",
      data.id,
      "O aluno terminou a utilização do computador."
    );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Ação do computador desconhecida." }, { status: 400 });
}
