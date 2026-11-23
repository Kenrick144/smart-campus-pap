import { NextResponse } from "next/server";
import * as ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Cell = string | number | boolean | Date | null;
type PreviewRow = {
  sourceId: string; turmaCodigo: string; turmaNome: string;
  professorCodigo: string; professorNome: string;
  disciplinaCodigo: string; disciplinaNome: string;
  salaCodigo: string; salaNome: string;
  diaSemana: number; periodo: number; horaInicio: string; horaFim: string;
  dataInicio: string; dataFim: string; warnings: string[];
};

const PERIODS = [
  ["08:15", "09:15"], ["09:15", "10:15"], ["10:25", "11:25"],
  ["11:25", "12:25"], ["12:30", "13:30"], ["13:35", "14:35"],
  ["14:35", "15:35"], ["15:45", "16:45"], ["16:45", "17:45"],
  ["17:50", "18:50"],
] as const;

const fail = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

function valueText(value: Cell | undefined): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function parseSemicolonLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ";" && !quoted) {
      values.push(value.trim()); value = "";
    } else value += char;
  }
  values.push(value.trim());
  return values;
}

async function workbookRows(file: File): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()));
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("O ficheiro " + file.name + " não contém uma folha.");
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, row => {
    const values = row.values as unknown as Cell[];
    rows.push(values.slice(1).map(value => valueText(value)));
  });
  return rows;
}

function requiredFile(form: FormData, key: string): File {
  const file = form.get(key);
  if (!(file instanceof File) || file.size === 0) throw new Error("Falta selecionar " + key + ".");
  if (file.size > 15 * 1024 * 1024) throw new Error(key + " ultrapassa 15 MB.");
  return file;
}

function groupClassCodes(group: string, classCodes: Set<string>): string[] {
  const tokens = new Set((group.toUpperCase().match(/[A-Z0-9]+/g) ?? []));
  return [...classCodes].filter(code => tokens.has(code.toUpperCase()));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return fail("Inicia sessão para importar horários.", 401);

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("users").select("role,status").eq("id", user.id).maybeSingle();
  if (profileError || !profile || profile.status !== "Ativo") return fail("Perfil inválido ou inativo.", 403);
  if (!["Administrador", "Administrador Adjunto"].includes(String(profile.role))) {
    return fail("Só a Administração pode preparar uma importação do Untis.", 403);
  }

  try {
    const form = await request.formData();
    const [classes, teachers, subjects, rooms, timetable] = await Promise.all([
      workbookRows(requiredFile(form, "Turmas.xlsx")),
      workbookRows(requiredFile(form, "Professores.xlsx")),
      workbookRows(requiredFile(form, "Disciplinas.xlsx")),
      workbookRows(requiredFile(form, "Salas.xlsx")),
      workbookRows(requiredFile(form, "Horarios.xlsx")),
    ]);
    const lessonsBuffer = Buffer.from(await requiredFile(form, "Aulas.TXT").arrayBuffer());
    const lessonsText = new TextDecoder("windows-1252").decode(lessonsBuffer);
    const lessonRows = lessonsText.split(/\r?\n/).filter(line => line.trim()).map(parseSemicolonLine);

    const classByCode = new Map(classes.filter(row => row[0]).map(row => [row[0].toUpperCase(), row[1] || row[0]]));
    const teacherByCode = new Map(teachers.filter(row => row[0]).map(row => [row[0], row[1] || row[0]]));
    const subjectByCode = new Map(subjects.filter(row => row[0]).map(row => [row[0].toUpperCase(), row[1] || row[0]]));
    const roomByCode = new Map(rooms.filter(row => row[0]).map(row => [row[0].toUpperCase(), row[1] || row[0]]));
    const lessonById = new Map(lessonRows.filter(row => row[0]).map(row => [row[0], row]));
    const preview: PreviewRow[] = [];
    const issues: Array<{ sourceId: string; message: string }> = [];
    const unresolvedGroups = new Set<string>();
    let joined = 0;
    let consistencyWarnings = 0;

    for (const row of timetable) {
      const sourceId = row[0];
      if (!sourceId) continue;
      const lesson = lessonById.get(sourceId);
      if (!lesson) {
        issues.push({ sourceId, message: "Linha sem correspondência em Aulas.TXT." });
        continue;
      }
      joined += 1;
      const teacherCode = lesson[5] || row[2] || "";
      const subjectCode = lesson[6] || row[3] || "";
      const roomCode = lesson[7] || "";
      const day = Number(row[5]);
      const period = Number(row[6]);
      const warnings: string[] = [];

      if (row[2] && lesson[5] && row[2] !== lesson[5]) warnings.push("Código de professor divergente entre os ficheiros.");
      if (row[3] && lesson[6] && row[3].toUpperCase() !== lesson[6].toUpperCase()) warnings.push("Código de disciplina divergente entre os ficheiros.");
      if (!teacherByCode.has(teacherCode)) warnings.push("Professor não encontrado em Professores.xlsx.");
      if (!subjectByCode.has(subjectCode.toUpperCase())) warnings.push("Disciplina não encontrada em Disciplinas.xlsx.");
      if (roomCode && !roomByCode.has(roomCode.toUpperCase())) warnings.push("Sala não encontrada em Salas.xlsx.");
      if (!Number.isInteger(day) || day < 1 || day > 5) warnings.push("Dia da semana inválido.");
      if (!Number.isInteger(period) || period < 1 || period > 10) warnings.push("Período inválido.");

      const directClass = (lesson[4] || "").toUpperCase();
      let classCodes = directClass && classByCode.has(directClass) ? [directClass] : [];
      if (!classCodes.length) {
        const group = lesson[17] || "";
        classCodes = groupClassCodes(group, new Set(classByCode.keys()));
        if (!classCodes.length) {
          const groupDescription = [group, lesson[20]].filter(Boolean).join(" — ") || "(sem turma/grupo)";
          unresolvedGroups.add(groupDescription);
          issues.push({ sourceId, message: "Turma por identificar manualmente: " + groupDescription + "." });
        }
      }
      if (warnings.length) consistencyWarnings += 1;
      if (!classCodes.length || !Number.isInteger(day) || day < 1 || day > 5 || !Number.isInteger(period) || period < 1 || period > 10) continue;
      const [horaInicio, horaFim] = PERIODS[period - 1];

      for (const turmaCodigo of classCodes) {
        preview.push({
          sourceId, turmaCodigo, turmaNome: String(classByCode.get(turmaCodigo) ?? turmaCodigo),
          professorCodigo: teacherCode, professorNome: String(teacherByCode.get(teacherCode) ?? teacherCode),
          disciplinaCodigo: subjectCode, disciplinaNome: String(subjectByCode.get(subjectCode.toUpperCase()) ?? subjectCode),
          salaCodigo: roomCode, salaNome: String(roomByCode.get(roomCode.toUpperCase()) ?? roomCode),
          diaSemana: day, periodo, horaInicio, horaFim,
          dataInicio: lesson[14] || "", dataFim: lesson[15] || "", warnings,
        });
      }
    }

    const seenRows = new Set<string>();
    let duplicates = 0;
    for (const item of preview) {
      const key = [item.turmaCodigo, item.professorCodigo, item.disciplinaCodigo, item.salaCodigo, item.diaSemana, item.periodo].join("|");
      if (seenRows.has(key)) duplicates += 1;
      else seenRows.add(key);
    }
    // Preserve every source row in the preview. Duplicate candidates are reported,
    // never silently discarded or overwritten.
    const resourceSlots = new Map<string, PreviewRow[]>();
    for (const item of preview) {
      for (const resource of ["professor:" + item.professorCodigo, "sala:" + item.salaCodigo, "turma:" + item.turmaCodigo]) {
        if (resource.endsWith(":")) continue;
        const key = resource + "|" + item.diaSemana + "|" + item.periodo;
        resourceSlots.set(key, [...(resourceSlots.get(key) ?? []), item]);
      }
    }
    const conflicts = [...resourceSlots.entries()]
      .filter(([, items]) => items.length > 1 && new Set(items.map(item => item.sourceId)).size > 1)
      .map(([key, items]) => ({
        recurso: key.split("|")[0], dia: Number(key.split("|")[1]), periodo: Number(key.split("|")[2]),
        aulas: items.map(item => item.sourceId),
      }));

    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const [dbClassesResult, dbTeachersResult, dbUsersResult, dbSubjectsResult, dbRoomsResult, dbLinksResult, dbQualificationsResult, dbSchedulesResult] = await Promise.all([
      admin.from("turmas").select("id,nome,estado"),
      admin.from("professores").select("id,professional_number,professional_status"),
      admin.from("users").select("id,name"),
      admin.from("disciplinas").select("id,nome,codigo,estado"),
      admin.from("salas").select("id,nome,estado"),
      admin.from("disciplinas_turmas").select("id,turma_id,disciplina_id"),
      admin.from("professores_disciplinas_turmas").select("professor_id,disciplina_turma_id"),
      admin.from("horarios").select("id,turma_id,professor_id,disciplina_turma_id,sala_id,dia_semana,hora_inicio,hora_fim"),
    ]);
    const lookupError = [dbClassesResult, dbTeachersResult, dbUsersResult, dbSubjectsResult, dbRoomsResult, dbLinksResult, dbQualificationsResult, dbSchedulesResult].find(item => item.error);
    if (lookupError?.error) return fail("Não foi possível validar os ficheiros contra os dados atuais do Smart Campus.", 500);
    const dbClassRows = dbClassesResult.data ?? [];
    const dbTeacherRows = dbTeachersResult.data ?? [];
    const dbUserNames = new Map((dbUsersResult.data ?? []).map(item => [item.id, item.name ?? ""]));
    const dbSubjectRows = dbSubjectsResult.data ?? [];
    const dbRoomRows = dbRoomsResult.data ?? [];
    const dbLinkRows = dbLinksResult.data ?? [];
    const qualifiedPairs = new Set((dbQualificationsResult.data ?? []).map(item => String(item.professor_id) + "|" + String(item.disciplina_turma_id)));
    const dbClassByCode = new Map(dbClassRows.map(item => [normalize(item.nome), item]));
    const dbTeacherByCode = new Map(dbTeacherRows.map(item => [normalize(item.professional_number), item]));
    const dbTeacherByName = new Map(dbTeacherRows.map(item => [normalize(dbUserNames.get(item.id) ?? ""), item]));
    const dbSubjectByCode = new Map(dbSubjectRows.filter(item => item.codigo).map(item => [normalize(item.codigo), item]));
    const dbSubjectByName = new Map(dbSubjectRows.map(item => [normalize(item.nome), item]));
    const dbRoomByCode = new Map(dbRoomRows.map(item => [normalize(item.nome), item]));
    let matchedClass = 0, matchedTeacher = 0, matchedSubject = 0, matchedRoom = 0, matchedRelations = 0, qualified = 0, existingSchedules = 0, rowsReady = 0;
    const unmatchedSamples = new Set<string>();
    const existingKeys = new Set((dbSchedulesResult.data ?? []).map(item => [item.turma_id, item.professor_id, item.disciplina_turma_id, item.sala_id, item.dia_semana, item.hora_inicio, item.hora_fim].join("|")));
    for (const item of preview) {
      const dbClass = dbClassByCode.get(normalize(item.turmaCodigo));
      const dbTeacher = dbTeacherByCode.get(normalize(item.professorCodigo)) ?? dbTeacherByName.get(normalize(item.professorNome));
      const dbSubject = dbSubjectByCode.get(normalize(item.disciplinaCodigo)) ?? dbSubjectByName.get(normalize(item.disciplinaNome));
      const dbRoom = item.salaCodigo ? dbRoomByCode.get(normalize(item.salaCodigo)) ?? dbRoomByCode.get(normalize(item.salaNome)) : undefined;
      if (dbClass) matchedClass += 1; else unmatchedSamples.add("Turma " + item.turmaCodigo);
      if (dbTeacher) matchedTeacher += 1; else unmatchedSamples.add("Professor " + item.professorCodigo + " (" + item.professorNome + ")");
      if (dbSubject) matchedSubject += 1; else unmatchedSamples.add("Disciplina " + item.disciplinaCodigo + " (" + item.disciplinaNome + ")");
      if (dbRoom) matchedRoom += 1; else unmatchedSamples.add("Sala " + (item.salaCodigo || "(não indicada)"));
      const link = dbClass && dbSubject ? dbLinkRows.find(row => row.turma_id === dbClass.id && row.disciplina_id === dbSubject.id) : undefined;
      if (link) matchedRelations += 1;
      else if (dbClass && dbSubject) unmatchedSamples.add("Relação turma/disciplina " + item.turmaCodigo + "/" + item.disciplinaCodigo);
      if (link && dbTeacher && qualifiedPairs.has(String(dbTeacher.id) + "|" + String(link.id))) qualified += 1;
      else if (link && dbTeacher) unmatchedSamples.add("Professor sem atribuição " + item.professorNome + "/" + item.turmaCodigo + "/" + item.disciplinaCodigo);
      if (dbClass && dbTeacher && dbSubject && dbRoom && link) {
        const key = [dbClass.id, dbTeacher.id, link.id, dbRoom.id, item.diaSemana, item.horaInicio, item.horaFim].join("|");
        if (existingKeys.has(key)) existingSchedules += 1;
        else if (qualifiedPairs.has(String(dbTeacher.id) + "|" + String(link.id))) rowsReady += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      source: "Untis 2026/2027",
      counts: {
        turmas: classes.filter(row => row[0]).length,
        professores: teachers.filter(row => row[0]).length,
        disciplinas: subjects.filter(row => row[0]).length,
        salas: rooms.filter(row => row[0]).length,
        linhasHorario: timetable.filter(row => row[0]).length,
        aulasUntis: lessonRows.length,
        linhasLigadas: joined,
        aulasIdentificadas: preview.length,
        gruposPorIdentificar: unresolvedGroups.size,
        avisosDeCorrespondencia: consistencyWarnings,
        duplicadosNoFicheiro: duplicates,
        conflitosDeRecursos: conflicts.length,
        linhasComSalaEmFalta: preview.filter(item => !item.salaCodigo).length,
      },
      databaseMatch: {
        turmasCorrespondentes: matchedClass,
        professoresCorrespondentes: matchedTeacher,
        disciplinasCorrespondentes: matchedSubject,
        salasCorrespondentes: matchedRoom,
        relacoesTurmaDisciplinaExistentes: matchedRelations,
        professoresComAtribuicao: qualified,
        horariosJaExistentes: existingSchedules,
        linhasProntasParaImportar: rowsReady,
        registosAtuais: {
          turmas: dbClassRows.length, professores: dbTeacherRows.length,
          disciplinas: dbSubjectRows.length, salas: dbRoomRows.length,
          horarios: (dbSchedulesResult.data ?? []).length,
        },
        correspondenciasEmFalta: [...unmatchedSamples].slice(0, 80),
      },
      periods: PERIODS.map(([inicio, fim], index) => ({ periodo: index + 1, inicio, fim })),
      unresolvedGroups: [...unresolvedGroups],
      conflicts: conflicts.slice(0, 100),
      issues: issues.slice(0, 150),
      preview: preview.slice(0, 40),
      canImport: false,
      message: "Pré-visualização apenas. A gravação será ativada depois de validar as correspondências com os registos existentes no Smart Campus.",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível analisar os ficheiros do Untis.", 400);
  }
}
