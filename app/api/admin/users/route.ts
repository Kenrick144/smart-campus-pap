import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type UserRole =
  | "Aluno"
  | "Professor"
  | "Funcionário"
  | "Administrador"
  | "Administrador Adjunto";

type CreateUserBody = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status?: "Ativo" | "Inativo";

  birthDate?: string;
  sex?: string; nationality?: string; postalCode?: string; locality?: string;
  academicDegree?: string; disciplinaryArea?: string; professionalCategory?: string;
  guardianIsStudent?: boolean;
  phone?: string;
  nif?: string;
  documentType?: string;
  documentNumber?: string;
  niss?: string;
  healthNumber?: string;
  address?: string;

  schoolYear?: string;
  studentNumber?: string;
  course?: string;
  enrollmentDate?: string;

  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianNif?: string;
  guardianDocumentType?: string;
  guardianDocumentNumber?: string;
  guardianAddress?: string;
  guardianAlternativePhone?: string;

  professionalNumber?: string;
  employeeNumber?: string;
  administratorNumber?: string;
  department?: string;
  employeePosition?: string;
  hiringDate?: string;
  contractType?: string;
  professionalStatus?: "Ativo" | "Inativo";

  username?: string;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function generateUserIdentifier(admin: ReturnType<typeof createAdminClient>, role: UserRole) {
  const { data, error } = await (admin as any).rpc("generate_user_identifier", { p_role: role });
  if (error || typeof data !== "string" || !data.trim()) {
    throw new Error("Não foi possível gerar o número automático do utilizador.");
  }
  return data as string;
}

const roles: UserRole[] = [
  "Aluno",
  "Professor",
  "Funcionário",
  "Administrador",
  "Administrador Adjunto",
];


export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !currentUser) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: currentProfile, error: profileError } = await supabase
      .from("users")
      .select("name, email, role, status")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (
      profileError ||
      !currentProfile ||
      currentProfile.status !== "Ativo" ||
      !["Administrador", "Administrador Adjunto"].includes(currentProfile.role)
    ) {
      return NextResponse.json({ error: "Não tens permissão para ver os utilizadores." }, { status: 403 });
    }

    const admin = createAdminClient();
    let usersQuery = admin
      .from("users")
      .select((currentProfile.role === "Administrador"
        ? "id, name, email, role, status, username, created_at, birth_date, phone, nif, document_type, document_number, niss, health_number, address, department, employee_position, hiring_date, contract_type, professional_status, sex, nationality, postal_code, locality, administrator_number, academic_degree, disciplinary_area, professional_category"
        : "id, name, email, role, status, username, created_at, department, employee_position, hiring_date, contract_type, professional_status") as any);

    // O Administrador Adjunto não pode sequer descobrir a existência ou os dados
    // das contas de administração. A restrição é aplicada na consulta do servidor.
    if (currentProfile.role === "Administrador Adjunto") {
      usersQuery = usersQuery.neq("role", "Administrador").neq("role", "Administrador Adjunto");
    }

    const { data: users, error } = await usersQuery.order("name");

    if (error) {
      return NextResponse.json({ error: "Não foi possível carregar os utilizadores." }, { status: 500 });
    }

    // Projeções dinâmicas do Supabase não preservam o tipo gerado da tabela.
    // Normalizamos os resultados para o DTO usado abaixo, sem alargar os campos consultados.
    type UserListRow = {
      id: string; name: string | null; email: string | null; role: UserRole;
      status: string | null; username?: string | null; created_at?: string | null;
      birth_date?: string | null; phone?: string | null; nif?: string | null;
      document_type?: string | null; document_number?: string | null; niss?: string | null;
      health_number?: string | null; address?: string | null; department?: string | null;
      employee_position?: string | null; hiring_date?: string | null; contract_type?: string | null;
      professional_status?: string | null; sex?: string | null; nationality?: string | null;
      postal_code?: string | null; locality?: string | null; administrator_number?: string | null;
      academic_degree?: string | null; disciplinary_area?: string | null; professional_category?: string | null;
    };
    type DetailRow = {
      id: string; department?: string | null; employee_position?: string | null;
      hiring_date?: string | null; contract_type?: string | null; professional_status?: string | null;
      professional_number?: string | null; employee_number?: string | null;
      school_year?: string | null; student_number?: string | null; course?: string | null;
      enrollment_date?: string | null; guardian_name?: string | null;
      guardian_relationship?: string | null; guardian_phone?: string | null;
      guardian_email?: string | null; guardian_nif?: string | null;
      guardian_document_type?: string | null; guardian_document_number?: string | null;
      guardian_address?: string | null; guardian_alternative_phone?: string | null; guardian_is_student?: boolean | null;
    };
    const userRows = (users ?? []) as unknown as UserListRow[];
    const ids = userRows.map((user) => user.id);
    const [studentsResult, teachersResult, employeesResult] = ids.length
      ? await Promise.all([
          admin.from("alunos").select((currentProfile.role === "Administrador" ? "*" : "id, school_year, student_number, course, enrollment_date") as any).in("id", ids),
          admin.from("professores").select((currentProfile.role === "Administrador" ? "*" : "id, professional_number, department, hiring_date, contract_type, professional_status") as any).in("id", ids),
          admin.from("funcionarios").select((currentProfile.role === "Administrador" ? "*" : "id, employee_number, department, employee_position, hiring_date, contract_type, professional_status") as any).in("id", ids),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

    const profileErrorForDetails = studentsResult.error || teachersResult.error || employeesResult.error;
    if (profileErrorForDetails) {
      console.error("Erro ao carregar dados complementares dos utilizadores:", profileErrorForDetails);
      return NextResponse.json({ error: "Não foi possível carregar os dados complementares dos utilizadores." }, { status: 500 });
    }

    const studentRows = (studentsResult.data ?? []) as unknown as DetailRow[];
    const teacherRows = (teachersResult.data ?? []) as unknown as DetailRow[];
    const employeeRows = (employeesResult.data ?? []) as unknown as DetailRow[];
    const students = new Map(studentRows.map((row) => [row.id, row]));
    const teachers = new Map(teacherRows.map((row) => [row.id, row]));
    const employees = new Map(employeeRows.map((row) => [row.id, row]));

    const toUser = (user: UserListRow) => {
      const student = students.get(user.id);
      const teacher = teachers.get(user.id);
      const employee = employees.get(user.id);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        username: user.username ?? "",
        createdAt: user.created_at,
        birthDate: user.birth_date ?? "",
        phone: user.phone ?? "",
        // O Adjunto gere contas correntes, mas não consulta identificadores
        // civis, fiscais, de saúde ou moradas completas.
        nif: currentProfile.role === "Administrador" ? user.nif ?? "" : "",
        documentType: user.document_type ?? "Cartão de Cidadão",
        documentNumber: currentProfile.role === "Administrador" ? user.document_number ?? "" : "",
        niss: currentProfile.role === "Administrador" ? user.niss ?? "" : "",
        healthNumber: currentProfile.role === "Administrador" ? user.health_number ?? "" : "",
        address: currentProfile.role === "Administrador" ? user.address ?? "" : "",
        sex: user.sex ?? "", nationality: user.nationality ?? "", postalCode: user.postal_code ?? "", locality: user.locality ?? "",
        administratorNumber: user.administrator_number ?? "", academicDegree: user.academic_degree ?? "",
        disciplinaryArea: user.disciplinary_area ?? "", professionalCategory: user.professional_category ?? "",
        guardianIsStudent: Boolean(student?.guardian_is_student),
        department: user.department ?? teacher?.department ?? employee?.department ?? "",
        employeePosition: user.employee_position ?? employee?.employee_position ?? "",
        hiringDate: user.hiring_date ?? teacher?.hiring_date ?? employee?.hiring_date ?? "",
        contractType: user.contract_type ?? teacher?.contract_type ?? employee?.contract_type ?? "",
        professionalStatus: user.professional_status ?? teacher?.professional_status ?? employee?.professional_status ?? "Ativo",
        professionalNumber: teacher?.professional_number ?? "",
        employeeNumber: employee?.employee_number ?? "",
        schoolYear: student?.school_year ?? "",
        studentNumber: student?.student_number ?? "",
        course: student?.course ?? "",
        enrollmentDate: student?.enrollment_date ?? "",
        guardianName: student?.guardian_name ?? "",
        guardianRelationship: student?.guardian_relationship ?? "",
        guardianPhone: student?.guardian_phone ?? "",
        guardianEmail: student?.guardian_email ?? "",
        guardianNif: currentProfile.role === "Administrador" ? student?.guardian_nif ?? "" : "",
        guardianDocumentType: student?.guardian_document_type ?? "Cartão de Cidadão",
        guardianDocumentNumber: currentProfile.role === "Administrador" ? student?.guardian_document_number ?? "" : "",
        guardianAddress: currentProfile.role === "Administrador" ? student?.guardian_address ?? "" : "",
        guardianAlternativePhone: student?.guardian_alternative_phone ?? "",
      };
    };

    return NextResponse.json({
      ok: true,
      currentRole: currentProfile.role,
      currentUser: { name: currentProfile.name, email: currentProfile.email },
      users: userRows.map(toUser),
    });
  } catch (error) {
    console.error("Erro ao carregar utilizadores:", error);
    return NextResponse.json({ error: "Ocorreu um erro inesperado." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();

    if (authError || !currentUser) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("users")
      .select("role, status")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (currentProfileError || !currentProfile || currentProfile.status !== "Ativo") {
      return NextResponse.json({ error: "Não foi possível verificar as tuas permissões." }, { status: 403 });
    }

    if (!["Administrador", "Administrador Adjunto"].includes(currentProfile.role)) {
      return NextResponse.json({ error: "Não tens permissão para editar utilizadores." }, { status: 403 });
    }

    const body = (await request.json()) as Partial<CreateUserBody> & { id?: string };
    const id = body.id?.trim();
    const cleanName = body.name?.trim();
    const cleanEmail = body.email?.trim().toLowerCase();
    const cleanUsername = body.username?.trim() || null;
    const cleanRole = body.role;
    const cleanStatus = body.status;

    if (!id || !cleanName || !cleanEmail || !cleanRole || !cleanStatus) {
      return NextResponse.json({ error: "Preenche o nome, email, perfil e estado." }, { status: 400 });
    }

    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: "Indica um endereço de email válido." }, { status: 400 });
    }

    if (!roles.includes(cleanRole) || !["Ativo", "Inativo"].includes(cleanStatus)) {
      return NextResponse.json({ error: "O perfil ou o estado selecionado é inválido." }, { status: 400 });
    }

    if (
      currentProfile.role === "Administrador Adjunto" &&
      !["Aluno", "Professor", "Funcionário"].includes(cleanRole)
    ) {
      return NextResponse.json({ error: "O Administrador Adjunto só pode atribuir os perfis Aluno, Professor e Funcionário." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: targetData, error: targetError } = await admin
      .from("users")
      .select((currentProfile.role === "Administrador"
        ? "id, name, email, role, status, username, birth_date, phone, nif, document_type, document_number, niss, health_number, address, department, employee_position, hiring_date, contract_type, professional_status, sex, nationality, postal_code, locality, administrator_number, academic_degree, disciplinary_area, professional_category"
        : "id, name, email, role, status, username, department, employee_position, hiring_date, contract_type, professional_status, sex, nationality, postal_code, locality, administrator_number, academic_degree, disciplinary_area, professional_category") as any)
      .eq("id", id)
      .maybeSingle();

    // O select dinâmico é limitado por perfil; normalizamos o tipo sem alterar
    // as colunas efetivamente consultadas nem ampliar o acesso do Adjunto.
    type TargetUserRow = {
      id: string; name: string | null; email: string | null; role: UserRole;
      status: string | null; username?: string | null; birth_date?: string | null;
      phone?: string | null; nif?: string | null; document_type?: string | null;
      document_number?: string | null; niss?: string | null; health_number?: string | null;
      address?: string | null; department?: string | null; employee_position?: string | null;
      hiring_date?: string | null; contract_type?: string | null; professional_status?: string | null;
      sex?: string | null; nationality?: string | null; postal_code?: string | null; locality?: string | null;
      administrator_number?: string | null; academic_degree?: string | null; disciplinary_area?: string | null; professional_category?: string | null;
    };
    const target = targetData as unknown as TargetUserRow | null;

    // Guardar o estado anterior dos três perfis para permitir compensação
    // se qualquer operação complementar falhar durante a alteração de perfil.
    const [oldStudentResult, oldTeacherResult, oldEmployeeResult] = await Promise.all([
      admin.from("alunos").select("*").eq("id", id).maybeSingle(),
      admin.from("professores").select("*").eq("id", id).maybeSingle(),
      admin.from("funcionarios").select("*").eq("id", id).maybeSingle(),
    ]);
    if (oldStudentResult.error || oldTeacherResult.error || oldEmployeeResult.error) {
      return NextResponse.json({ error: "Não foi possível guardar os dados atuais do perfil para uma edição segura." }, { status: 500 });
    }
    const previousProfiles = {
      alunos: oldStudentResult.data,
      professores: oldTeacherResult.data,
      funcionarios: oldEmployeeResult.data,
    };

    if (targetError || !target) {
      return NextResponse.json({ error: "O utilizador selecionado não foi encontrado." }, { status: 404 });
    }

    if (
      currentProfile.role === "Administrador Adjunto" &&
      ["Administrador", "Administrador Adjunto"].includes(target.role)
    ) {
      // Não revelar se o ID pertence a uma conta de administração.
      // Para o Adjunto, uma conta protegida é indistinguível de uma conta inexistente.
      return NextResponse.json({ error: "O utilizador selecionado não foi encontrado." }, { status: 404 });
    }

    if (id === currentUser.id && (cleanStatus !== "Ativo" || cleanRole !== currentProfile.role)) {
      return NextResponse.json({ error: "Por segurança, não podes desativar a tua própria conta nem alterar o teu perfil nesta página." }, { status: 400 });
    }

    if (target.role === "Administrador" && (cleanRole !== "Administrador" || cleanStatus !== "Ativo")) {
      const { count, error: countError } = await admin
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "Administrador")
        .eq("status", "Ativo");
      if (countError) {
        return NextResponse.json({ error: "Não foi possível validar os administradores ativos." }, { status: 500 });
      }
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: "Não podes desativar ou alterar o último Administrador ativo." }, { status: 400 });
      }
    }

    const { data: duplicateEmail, error: duplicateEmailError } = await admin
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .neq("id", id)
      .maybeSingle();

    if (duplicateEmailError) {
      return NextResponse.json({ error: "Não foi possível validar o email." }, { status: 500 });
    }
    if (duplicateEmail) {
      return NextResponse.json({ error: "Já existe outro utilizador com esse email." }, { status: 409 });
    }

    if (cleanUsername) {
      const { data: duplicateUsername, error: duplicateUsernameError } = await admin
        .from("users")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", id)
        .maybeSingle();
      if (duplicateUsernameError) {
        return NextResponse.json({ error: "Não foi possível validar o nome de utilizador." }, { status: 500 });
      }
      if (duplicateUsername) {
        return NextResponse.json({ error: "Já existe outro utilizador com esse nome de utilizador." }, { status: 409 });
      }
    }

    if (cleanRole === "Aluno" && (!body.studentNumber?.trim() || !body.schoolYear?.trim() || !body.course?.trim() || (!body.guardianIsStudent && (!body.guardianName?.trim() || !body.guardianRelationship?.trim() || !body.guardianPhone?.trim())))) {
      return NextResponse.json({ error: "Para atribuir o perfil Aluno, preenche o número, ano letivo, curso e os dados obrigatórios do encarregado." }, { status: 400 });
    }

    if (cleanRole === "Professor" && !body.department?.trim()) {
      return NextResponse.json({ error: "Para atribuir o perfil Professor, preenche o número profissional e o departamento." }, { status: 400 });
    }

    if (cleanRole === "Funcionário" && (!body.department?.trim() || !body.employeePosition?.trim())) {
      return NextResponse.json({ error: "Para atribuir o perfil Funcionário, preenche o número, departamento e cargo." }, { status: 400 });
    }

    let automaticNumber: string | null = null;
    if (["Administrador", "Administrador Adjunto"].includes(cleanRole)) {
      automaticNumber = target.role === cleanRole ? target.administrator_number ?? null : null;
    } else if (cleanRole === "Professor") {
      if (target.role === "Professor") {
        const { data } = await admin.from("professores").select("professional_number").eq("id", id).maybeSingle();
        automaticNumber = data?.professional_number ?? null;
      }
    } else if (cleanRole === "Funcionário") {
      if (target.role === "Funcionário") {
        const { data } = await admin.from("funcionarios").select("employee_number").eq("id", id).maybeSingle();
        automaticNumber = data?.employee_number ?? null;
      }
    }
    if (["Administrador", "Administrador Adjunto", "Professor", "Funcionário"].includes(cleanRole) && !automaticNumber) {
      automaticNumber = await generateUserIdentifier(admin, cleanRole);
    }

    const authTargetResult = await admin.auth.admin.getUserById(id);
    if (authTargetResult.error || !authTargetResult.data.user) {
      return NextResponse.json({ error: "A conta de autenticação associada não foi encontrada." }, { status: 404 });
    }
    const authTarget = authTargetResult.data.user;
    const oldAuthEmail = authTarget.email ?? target.email ?? undefined;
    const oldUserMetadata = authTarget.user_metadata ?? {};

    const authUpdate: {
      email?: string;
      email_confirm?: boolean;
      password?: string;
      user_metadata?: Record<string, unknown>;
    } = {
      email: cleanEmail,
      email_confirm: true,
      user_metadata: { ...oldUserMetadata, name: cleanName, role: cleanRole, ...(cleanUsername ? { username: cleanUsername } : {}) },
    };

    const authUpdateResult = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authUpdateResult.error) {
      return NextResponse.json({ error: authUpdateResult.error.message || "Não foi possível atualizar a conta de autenticação." }, { status: 400 });
    }

    const userUpdates = {
      name: cleanName,
      email: cleanEmail,
      role: cleanRole,
      status: cleanStatus,
      username: cleanUsername,
      ...(currentProfile.role === "Administrador" ? {
        birth_date: body.birthDate || null,
        phone: body.phone || null,
      } : {}),
      // Apenas o Administrador pode alterar identificadores e moradas sensíveis.
      ...(currentProfile.role === "Administrador" ? {
        nif: body.nif || null,
        document_type: body.documentType || null,
        document_number: body.documentNumber || null,
        niss: body.niss || null,
        health_number: body.healthNumber || null,
        address: body.address || null,
      } : {}),
      department: body.department || null,
      employee_position: body.employeePosition || null,
      hiring_date: body.hiringDate || null,
      contract_type: body.contractType || null,
      professional_status: body.professionalStatus ?? "Ativo",
      sex: body.sex || null, nationality: body.nationality || null,
      postal_code: body.postalCode || null, locality: body.locality || null,
      administrator_number: automaticNumber && ["Administrador", "Administrador Adjunto"].includes(cleanRole) ? automaticNumber : null, academic_degree: body.academicDegree || null,
      disciplinary_area: body.disciplinaryArea || null, professional_category: body.professionalCategory || null,
    };

    const { error: updateError } = await admin.from("users").update(userUpdates).eq("id", id);
    if (updateError) {
      await admin.auth.admin.updateUserById(id, {
        email: oldAuthEmail,
        email_confirm: true,
        user_metadata: oldUserMetadata,
      });
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    let relatedError: { message: string } | null = null;
    if (cleanRole === "Aluno") {
      const { error } = await admin.from("alunos").upsert({
        id,
        student_number: body.studentNumber?.trim(),
        school_year: body.schoolYear?.trim(),
        course: body.course?.trim(),
        enrollment_date: body.enrollmentDate || null,
        guardian_name: body.guardianName?.trim(),
        guardian_relationship: body.guardianRelationship?.trim(),
        guardian_phone: body.guardianPhone?.trim(),
        guardian_email: body.guardianEmail || null,
        ...(currentProfile.role === "Administrador" ? {
          guardian_nif: body.guardianNif || null,
          guardian_document_type: body.guardianDocumentType || null,
          guardian_document_number: body.guardianDocumentNumber || null,
          guardian_address: body.guardianAddress || null,
        } : {}),
        guardian_alternative_phone: body.guardianAlternativePhone || null,
        guardian_is_student: Boolean(body.guardianIsStudent),
      }, { onConflict: "id" });
      relatedError = error;
    } else if (cleanRole === "Professor") {
      const { error } = await admin.from("professores").upsert({
        id,
        professional_number: automaticNumber,
        department: body.department?.trim(),
        hiring_date: body.hiringDate || null,
        contract_type: body.contractType || null,
        professional_status: body.professionalStatus ?? "Ativo",
      }, { onConflict: "id" });
      relatedError = error;
    } else if (cleanRole === "Funcionário") {
      const { error } = await admin.from("funcionarios").upsert({
        id,
        employee_number: automaticNumber,
        department: body.department?.trim(),
        employee_position: body.employeePosition?.trim(),
        hiring_date: body.hiringDate || null,
        contract_type: body.contractType || null,
        professional_status: body.professionalStatus ?? "Ativo",
      }, { onConflict: "id" });
      relatedError = error;
    }

    // Remover os registos dos perfis que deixaram de corresponder ao papel.
    // Os dados anteriores ficam guardados para recuperação em caso de falha.
    if (!relatedError && cleanRole !== "Aluno") {
      const { error } = await admin.from("alunos").delete().eq("id", id);
      if (error) relatedError = error;
    }
    if (!relatedError && cleanRole !== "Professor") {
      const { error } = await admin.from("professores").delete().eq("id", id);
      if (error) relatedError = error;
    }
    if (!relatedError && cleanRole !== "Funcionário") {
      const { error } = await admin.from("funcionarios").delete().eq("id", id);
      if (error) relatedError = error;
    }

    if (relatedError) {
      // Restaurar o perfil complementar anterior, incluindo registos removidos
      // durante uma mudança de papel ou parcialmente atualizados por upsert.
      for (const [table, previous] of Object.entries(previousProfiles)) {
        if (previous) {
          const { error } = await admin.from(table as "alunos" | "professores" | "funcionarios").upsert(previous, { onConflict: "id" });
          if (error) console.error(`Falha ao restaurar ${table} durante rollback:`, error);
        } else {
          const { error } = await admin.from(table as "alunos" | "professores" | "funcionarios").delete().eq("id", id);
          if (error) console.error(`Falha ao limpar ${table} durante rollback:`, error);
        }
      }
      await admin.from("users").update({
        name: target.name,
        email: target.email,
        role: target.role,
        status: target.status,
        username: target.username,
        birth_date: target.birth_date,
        phone: target.phone,
        nif: target.nif,
        document_type: target.document_type,
        document_number: target.document_number,
        niss: target.niss,
        health_number: target.health_number,
        address: target.address,
        department: target.department,
        employee_position: target.employee_position,
        hiring_date: target.hiring_date,
        contract_type: target.contract_type,
        professional_status: target.professional_status,
        sex: target.sex, nationality: target.nationality, postal_code: target.postal_code,
        locality: target.locality, administrator_number: target.administrator_number,
        academic_degree: target.academic_degree, disciplinary_area: target.disciplinary_area,
        professional_category: target.professional_category,
      }).eq("id", id);
      await admin.auth.admin.updateUserById(id, {
        email: oldAuthEmail,
        email_confirm: true,
        user_metadata: oldUserMetadata,
      });
      return NextResponse.json({ error: relatedError.message }, { status: 400 });
    }

    await admin.from("logs").insert({
      user_id: currentUser.id,
      acao: "Atualizar utilizador",
      entidade: "users",
      entidade_id: id,
      descricao: `Atualizado utilizador ${cleanEmail}: perfil ${target.role} → ${cleanRole}, estado ${target.status} → ${cleanStatus}.`,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        status: cleanStatus,
        username: cleanUsername ?? "",
      },
    });
  } catch (error) {
    console.error("Erro ao atualizar utilizador:", error);
    return NextResponse.json({ error: "Ocorreu um erro inesperado ao atualizar o utilizador." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: currentProfile, error: profileError } = await supabase
      .from("users")
      .select("role, status")
      .eq("id", currentUser.id)
      .single();

    if (profileError || !currentProfile || currentProfile.status !== "Ativo") {
      return NextResponse.json(
        { error: "Não foi possível verificar as permissões do utilizador." },
        { status: 403 },
      );
    }

    if (
      currentProfile.role !== "Administrador" &&
      currentProfile.role !== "Administrador Adjunto"
    ) {
      return NextResponse.json(
        { error: "Não tens permissão para criar utilizadores." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as CreateUserBody;


    if (
      currentProfile.role === "Administrador Adjunto" &&
      body.role !== "Aluno" &&
      body.role !== "Professor" &&
      body.role !== "Funcionário"
    ) {
      return NextResponse.json(
        {
          error:
            "O Administrador Adjunto só pode criar Alunos, Professores e Funcionários.",
        },
        { status: 403 }
      );
    }


    const cleanName = body.name?.trim();
    const cleanEmail = body.email?.trim().toLowerCase();
    const cleanPassword = body.password;
    const cleanUsername = body.username?.trim();

    if (!cleanName || !cleanEmail || !cleanPassword || !body.role) {
      return NextResponse.json(
        { error: "Preenche os campos obrigatórios." },
        { status: 400 },
      );
    }

    if (!roles.includes(body.role)) {
      return NextResponse.json(
        { error: "Tipo de utilizador inválido." },
        { status: 400 },
      );
    }

    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: "Indica um endereço de email válido." }, { status: 400 });
    }

    if (cleanPassword.length < 8) {
      return NextResponse.json({ error: "A palavra-passe deve ter pelo menos 8 caracteres." }, { status: 400 });
    }

    if (body.status && !["Ativo", "Inativo"].includes(body.status)) {
      return NextResponse.json({ error: "O estado selecionado é inválido." }, { status: 400 });
    }

    const requiredByRole: Partial<Record<UserRole, string[]>> = {
      "Aluno": [
        body.studentNumber || "", body.schoolYear || "", body.course || "",
        ...(body.guardianIsStudent ? [] : [body.guardianName || "", body.guardianRelationship || "", body.guardianPhone || ""]),
      ],
      "Professor": [body.department || ""],
      "Funcionário": [body.department || "", body.employeePosition || ""],
    };
    if ((requiredByRole[body.role] ?? []).some((value) => !value.trim())) {
      return NextResponse.json({ error: "Faltam campos obrigatórios para o perfil selecionado." }, { status: 400 });
    }

    const admin = createAdminClient();
    const automaticNumber = ["Administrador", "Administrador Adjunto", "Professor", "Funcionário"].includes(body.role)
      ? await generateUserIdentifier(admin, body.role)
      : null;

    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: {
          name: cleanName,
          role: body.role,
        },
      });

    if (authError || !authData.user) {
      const authErrorMessage = authError?.message ?? "";
      const isDuplicateEmail =
        /already been registered|already exists|email address.*registered|user already registered/i.test(authErrorMessage);

      return NextResponse.json(
        {
          error: isDuplicateEmail
            ? "Este email já está registado no sistema de autenticação. Procura a conta em Utilizadores; se não aparecer na lista, será necessário associar o registo existente antes de tentar criá-la novamente."
            : authErrorMessage || "Não foi possível criar a conta.",
        },
        { status: isDuplicateEmail ? 409 : 400 },
      );
    }

    const userId = authData.user.id;

    const { error: userError } = await admin.from("users").insert({
      id: userId,
      email: cleanEmail,
      name: cleanName,
      role: body.role,
      status: body.status ?? "Ativo",

      birth_date: body.birthDate || null,
      phone: body.phone || null,
      // O Adjunto não recolhe nem grava identificadores civis/fiscais,
      // dados de saúde ou moradas completas.
      nif: currentProfile.role === "Administrador" ? body.nif || null : null,
      document_type: currentProfile.role === "Administrador" ? body.documentType || null : null,
      document_number: currentProfile.role === "Administrador" ? body.documentNumber || null : null,
      niss: currentProfile.role === "Administrador" ? body.niss || null : null,
      health_number: currentProfile.role === "Administrador" ? body.healthNumber || null : null,
      address: currentProfile.role === "Administrador" ? body.address || null : null,

      department: body.department || null,
      employee_position: body.employeePosition || null,
      hiring_date: body.hiringDate || null,
      contract_type: body.contractType || null,
      professional_status: body.professionalStatus ?? "Ativo",

      username: cleanUsername || null,
      sex: body.sex || null, nationality: body.nationality || null,
      postal_code: body.postalCode || null, locality: body.locality || null,
      administrator_number: ["Administrador", "Administrador Adjunto"].includes(body.role ?? "") ? automaticNumber : null, academic_degree: body.academicDegree || null,
      disciplinary_area: body.disciplinaryArea || null, professional_category: body.professionalCategory || null,
    });

    if (userError) {
      await admin.auth.admin.deleteUser(userId);

      return NextResponse.json({ error: userError.message }, { status: 400 });
    }

    if (body.role === "Aluno") {
      const { error } = await admin.from("alunos").insert({
        id: userId,
        student_number: body.studentNumber,
        school_year: body.schoolYear,
        course: body.course,
        enrollment_date: body.enrollmentDate || null,

        guardian_name: body.guardianName,
        guardian_relationship: body.guardianRelationship,
        guardian_phone: body.guardianPhone,
        guardian_email: body.guardianEmail || null,
        guardian_nif: currentProfile.role === "Administrador" ? body.guardianNif || null : null,
        guardian_document_type: currentProfile.role === "Administrador" ? body.guardianDocumentType || null : null,
        guardian_document_number: currentProfile.role === "Administrador" ? body.guardianDocumentNumber || null : null,
        guardian_address: currentProfile.role === "Administrador" ? body.guardianAddress || null : null,
        guardian_alternative_phone: body.guardianAlternativePhone || null,
        guardian_is_student: Boolean(body.guardianIsStudent),
      });

      if (error) {
        await admin.from("users").delete().eq("id", userId);
        await admin.auth.admin.deleteUser(userId);

        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    if (body.role === "Professor") {
      const { error } = await admin.from("professores").insert({
        id: userId,
        professional_number: automaticNumber,
        department: body.department,
        hiring_date: body.hiringDate || null,
        contract_type: body.contractType || null,
        professional_status: body.professionalStatus ?? "Ativo",
      });

      if (error) {
        await admin.from("users").delete().eq("id", userId);
        await admin.auth.admin.deleteUser(userId);

        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    if (body.role === "Funcionário") {
      const { error } = await admin.from("funcionarios").insert({
        id: userId,
        employee_number: automaticNumber,
        department: body.department,
        employee_position: body.employeePosition,
        hiring_date: body.hiringDate || null,
        contract_type: body.contractType || null,
        professional_status: body.professionalStatus ?? "Ativo",
      });

      if (error) {
        await admin.from("users").delete().eq("id", userId);
        await admin.auth.admin.deleteUser(userId);

        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    await admin.from("logs").insert({
      user_id: currentUser.id,
      acao: "Criar utilizador",
      entidade: "users",
      entidade_id: userId,
      descricao: `Criado utilizador ${cleanEmail} com o perfil ${body.role}.`,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        email: cleanEmail,
        name: cleanName,
        role: body.role,
        status: body.status ?? "Ativo",
      },
    });
  } catch (error) {
    console.error("Erro ao criar utilizador:", error);

    return NextResponse.json(
      { error: "Ocorreu um erro inesperado." },
      { status: 500 },
    );
  }
}
