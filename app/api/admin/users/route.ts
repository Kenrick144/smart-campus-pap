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
    const { data: users, error } = await admin
      .from("users")
      .select("id, name, email, role, status, username, created_at, birth_date, phone, nif, document_type, document_number, niss, health_number, address, department, employee_position, hiring_date, contract_type, professional_status")
      .order("name");

    if (error) {
      return NextResponse.json({ error: "Não foi possível carregar os utilizadores." }, { status: 500 });
    }

    const ids = (users ?? []).map((user) => user.id);
    const [studentsResult, teachersResult, employeesResult] = ids.length
      ? await Promise.all([
          admin.from("alunos").select("*").in("id", ids),
          admin.from("professores").select("*").in("id", ids),
          admin.from("funcionarios").select("*").in("id", ids),
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

    const students = new Map((studentsResult.data ?? []).map((row) => [row.id, row]));
    const teachers = new Map((teachersResult.data ?? []).map((row) => [row.id, row]));
    const employees = new Map((employeesResult.data ?? []).map((row) => [row.id, row]));

    const toUser = (user: NonNullable<typeof users>[number]) => {
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
        nif: user.nif ?? "",
        documentType: user.document_type ?? "Cartão de Cidadão",
        documentNumber: user.document_number ?? "",
        niss: user.niss ?? "",
        healthNumber: user.health_number ?? "",
        address: user.address ?? "",
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
        guardianNif: student?.guardian_nif ?? "",
        guardianDocumentType: student?.guardian_document_type ?? "Cartão de Cidadão",
        guardianDocumentNumber: student?.guardian_document_number ?? "",
        guardianAddress: student?.guardian_address ?? "",
        guardianAlternativePhone: student?.guardian_alternative_phone ?? "",
      };
    };

    return NextResponse.json({
      ok: true,
      currentRole: currentProfile.role,
      currentUser: { name: currentProfile.name, email: currentProfile.email },
      users: (users ?? []).map(toUser),
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
    const { data: target, error: targetError } = await admin
      .from("users")
      .select("id, name, email, role, status, username, birth_date, phone, nif, document_type, document_number, niss, health_number, address, department, employee_position, hiring_date, contract_type, professional_status")
      .eq("id", id)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ error: "O utilizador selecionado não foi encontrado." }, { status: 404 });
    }

    if (
      currentProfile.role === "Administrador Adjunto" &&
      ["Administrador", "Administrador Adjunto"].includes(target.role)
    ) {
      return NextResponse.json({ error: "O Administrador Adjunto não pode editar contas de administração." }, { status: 403 });
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

    if (cleanRole === "Aluno" && (!body.studentNumber?.trim() || !body.schoolYear?.trim() || !body.course?.trim() || !body.guardianName?.trim() || !body.guardianRelationship?.trim() || !body.guardianPhone?.trim())) {
      return NextResponse.json({ error: "Para atribuir o perfil Aluno, preenche o número, ano letivo, curso e os dados obrigatórios do encarregado." }, { status: 400 });
    }

    if (cleanRole === "Professor" && (!body.professionalNumber?.trim() || !body.department?.trim())) {
      return NextResponse.json({ error: "Para atribuir o perfil Professor, preenche o número profissional e o departamento." }, { status: 400 });
    }

    if (cleanRole === "Funcionário" && (!body.employeeNumber?.trim() || !body.department?.trim() || !body.employeePosition?.trim())) {
      return NextResponse.json({ error: "Para atribuir o perfil Funcionário, preenche o número, departamento e cargo." }, { status: 400 });
    }

    const authTargetResult = await admin.auth.admin.getUserById(id);
    if (authTargetResult.error || !authTargetResult.data.user) {
      return NextResponse.json({ error: "A conta de autenticação associada não foi encontrada." }, { status: 404 });
    }
    const authTarget = authTargetResult.data.user;
    const oldAuthEmail = authTarget.email ?? target.email;
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
      birth_date: body.birthDate || null,
      phone: body.phone || null,
      nif: body.nif || null,
      document_type: body.documentType || null,
      document_number: body.documentNumber || null,
      niss: body.niss || null,
      health_number: body.healthNumber || null,
      address: body.address || null,
      department: body.department || null,
      employee_position: body.employeePosition || null,
      hiring_date: body.hiringDate || null,
      contract_type: body.contractType || null,
      professional_status: body.professionalStatus ?? "Ativo",
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
        guardian_nif: body.guardianNif || null,
        guardian_document_type: body.guardianDocumentType || null,
        guardian_document_number: body.guardianDocumentNumber || null,
        guardian_address: body.guardianAddress || null,
        guardian_alternative_phone: body.guardianAlternativePhone || null,
      }, { onConflict: "id" });
      relatedError = error;
    } else if (cleanRole === "Professor") {
      const { error } = await admin.from("professores").upsert({
        id,
        professional_number: body.professionalNumber?.trim(),
        department: body.department?.trim(),
        hiring_date: body.hiringDate || null,
        contract_type: body.contractType || null,
        professional_status: body.professionalStatus ?? "Ativo",
      }, { onConflict: "id" });
      relatedError = error;
    } else if (cleanRole === "Funcionário") {
      const { error } = await admin.from("funcionarios").upsert({
        id,
        employee_number: body.employeeNumber?.trim(),
        department: body.department?.trim(),
        employee_position: body.employeePosition?.trim(),
        hiring_date: body.hiringDate || null,
        contract_type: body.contractType || null,
        professional_status: body.professionalStatus ?? "Ativo",
      }, { onConflict: "id" });
      relatedError = error;
    }

    if (relatedError) {
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

    if (cleanPassword.length < 6) {
      return NextResponse.json(
        { error: "A palavra-passe deve ter pelo menos 6 caracteres." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

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
      return NextResponse.json(
        { error: authError?.message ?? "Não foi possível criar a conta." },
        { status: 400 },
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
      nif: body.nif || null,
      document_type: body.documentType || null,
      document_number: body.documentNumber || null,
      niss: body.niss || null,
      health_number: body.healthNumber || null,
      address: body.address || null,

      department: body.department || null,
      employee_position: body.employeePosition || null,
      hiring_date: body.hiringDate || null,
      contract_type: body.contractType || null,
      professional_status: body.professionalStatus ?? "Ativo",

      username: cleanUsername || null,
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
        guardian_nif: body.guardianNif || null,
        guardian_document_type: body.guardianDocumentType || null,
        guardian_document_number: body.guardianDocumentNumber || null,
        guardian_address: body.guardianAddress || null,
        guardian_alternative_phone: body.guardianAlternativePhone || null,
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
        professional_number: body.professionalNumber,
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
        employee_number: body.employeeNumber,
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
