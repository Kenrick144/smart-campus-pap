import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;

function message(error: unknown) {
  return error instanceof Error ? error.message : "Erro ao consultar os dados académicos.";
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.status !== "Ativo" ||
      !["Administrador", "Administrador Adjunto"].includes(String(profile.role))
    ) {
      return NextResponse.json(
        { error: "Apenas Administrador ou Administrador Adjunto com conta ativa pode consultar os dados de importação." },
        { status: 403 }
      );
    }

    const admin = createAdminClient();
    const [yearsResult, classesResult, disciplinesResult, roomsResult, teacherProfilesResult] =
      await Promise.all([
        admin.from("anos_letivos").select("id, nome, data_inicio, data_fim, ativo").order("data_inicio", { ascending: false }),
        admin.from("turmas").select("id, nome, ano_letivo_id, ano_escolar, curso_id, curso, estado").eq("estado", "Ativa").order("nome"),
        admin.from("disciplinas").select("id, nome, codigo, estado").eq("estado", "Ativa").order("nome"),
        admin.from("salas").select("id, nome, edificio, piso, capacidade, tipo, estado").eq("estado", "Ativa").order("nome"),
        admin.from("professores").select("id, professional_number, department, professional_status").eq("professional_status", "Ativo"),
      ]);

    const firstError = yearsResult.error || classesResult.error || disciplinesResult.error || roomsResult.error || teacherProfilesResult.error;
    if (firstError) {
      return NextResponse.json({ error: "Não foi possível carregar os catálogos académicos." }, { status: 500 });
    }

    const years = (yearsResult.data ?? []) as Row[];
    const classes = (classesResult.data ?? []) as Row[];
    const teacherProfiles = (teacherProfilesResult.data ?? []) as Row[];
    const classIds = classes.map((item) => String(item.id));
    const teacherIds = teacherProfiles.map((item) => String(item.id));

    const [classLinksResult, teacherClassLinksResult, teacherDisciplineLinksResult, teacherUsersResult] =
      await Promise.all([
        classIds.length
          ? admin.from("disciplinas_turmas").select("id, turma_id, disciplina_id, ativa").in("turma_id", classIds).eq("ativa", true)
          : Promise.resolve({ data: [], error: null }),
        classIds.length
          ? admin.from("professores_turmas").select("professor_id, turma_id, data_fim").in("turma_id", classIds).is("data_fim", null)
          : Promise.resolve({ data: [], error: null }),
        teacherIds.length
          ? admin.from("professores_disciplinas_turmas").select("professor_id, disciplina_turma_id").in("professor_id", teacherIds)
          : Promise.resolve({ data: [], error: null }),
        teacherIds.length
          ? admin.from("users").select("id, name, status").in("id", teacherIds).eq("status", "Ativo")
          : Promise.resolve({ data: [], error: null }),
      ]);

    const relationError = classLinksResult.error || teacherClassLinksResult.error ||
      teacherDisciplineLinksResult.error || teacherUsersResult.error;
    if (relationError) {
      return NextResponse.json({ error: "Não foi possível carregar as associações académicas." }, { status: 500 });
    }

    const activeTeacherUsers = new Map(
      ((teacherUsersResult.data ?? []) as Row[]).map((item) => [String(item.id), item])
    );
    const teachers = teacherProfiles
      .filter((item) => activeTeacherUsers.has(String(item.id)))
      .map((item) => ({
        id: String(item.id),
        nome: String(activeTeacherUsers.get(String(item.id))?.name ?? ""),
        numero: String(item.professional_number ?? ""),
        departamento: String(item.department ?? ""),
      }));

    // Não expor associações antigas nem ligações de professores sem conta ativa.
    const activeTeacherIds = new Set(teachers.map((item) => item.id));
    const activeClassDisciplineIds = new Set(
      ((classLinksResult.data ?? []) as Row[]).map((item) => String(item.id))
    );
    const activeTeacherClassLinks = ((teacherClassLinksResult.data ?? []) as Row[])
      .filter((item) => activeTeacherIds.has(String(item.professor_id)));
    const activeTeacherDisciplineClassLinks = ((teacherDisciplineLinksResult.data ?? []) as Row[])
      .filter((item) =>
        activeTeacherIds.has(String(item.professor_id)) &&
        activeClassDisciplineIds.has(String(item.disciplina_turma_id))
      );

    return NextResponse.json(
      {
        source: "smart-campus",
        readOnly: true,
        academicYears: years,
        classes,
        teachers,
        disciplines: disciplinesResult.data ?? [],
        rooms: roomsResult.data ?? [],
        classDisciplineLinks: classLinksResult.data ?? [],
        teacherClassLinks: activeTeacherClassLinks,
        teacherDisciplineClassLinks: activeTeacherDisciplineClassLinks,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    console.error("Erro na API de pré-importação Untis:", message(error));
    return NextResponse.json({ error: "Erro interno ao consultar os dados de importação." }, { status: 500 });
  }
}
