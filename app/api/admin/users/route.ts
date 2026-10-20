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
      .select("id, name, email, role, status, created_at")
      .order("name");

    if (error) {
      return NextResponse.json({ error: "Não foi possível carregar os utilizadores." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      currentRole: currentProfile.role,
      currentUser: { name: currentProfile.name, email: currentProfile.email },
      users: users ?? [],
    });
  } catch (error) {
    console.error("Erro ao carregar utilizadores:", error);
    return NextResponse.json({ error: "Ocorreu um erro inesperado." }, { status: 500 });
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
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (profileError || !currentProfile) {
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
