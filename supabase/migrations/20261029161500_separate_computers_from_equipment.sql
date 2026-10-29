-- Separate the computer inventory from general campus equipment.
-- Preserve identifiers and metadata for any legacy rows before changing the type constraint.

CREATE TABLE IF NOT EXISTS public.computadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sala_id uuid NOT NULL REFERENCES public.salas(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  numero_inventario text UNIQUE,
  marca text,
  modelo text,
  numero_serie text,
  estado text NOT NULL DEFAULT 'Operacional'
    CHECK (estado = ANY (ARRAY['Operacional'::text, 'Em manutenção'::text, 'Avariado'::text, 'Inativo'::text])),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.computadores ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.computadores TO authenticated;

DROP POLICY IF EXISTS computadores_select_authenticated ON public.computadores;
CREATE POLICY computadores_select_authenticated
  ON public.computadores
  FOR SELECT
  TO authenticated
  USING (estado <> 'Inativo');

-- Move any existing computer entries without changing their IDs or inventory fields.
INSERT INTO public.computadores (
  id, sala_id, nome, numero_inventario, marca, modelo, numero_serie,
  estado, observacoes, created_at, updated_at
)
SELECT
  id, sala_id, nome, numero_inventario, marca, modelo, numero_serie,
  estado, observacoes, created_at, updated_at
FROM public.equipamentos
WHERE tipo = 'Computador'
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.equipamentos e
WHERE e.tipo = 'Computador'
  AND EXISTS (SELECT 1 FROM public.computadores c WHERE c.id = e.id);

-- General equipment must no longer accept computers.
ALTER TABLE public.equipamentos
  DROP CONSTRAINT IF EXISTS equipamentos_tipo_check;

ALTER TABLE public.equipamentos
  ADD CONSTRAINT equipamentos_tipo_check
  CHECK (tipo = ANY (ARRAY['Projetor'::text, 'Monitor'::text, 'Impressora'::text, 'Quadro interativo'::text, 'Outro'::text]);

CREATE INDEX IF NOT EXISTS computadores_sala_id_idx ON public.computadores (sala_id);
CREATE INDEX IF NOT EXISTS equipamentos_sala_id_idx ON public.equipamentos (sala_id);
