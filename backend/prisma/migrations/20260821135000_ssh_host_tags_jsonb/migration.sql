-- Corrige um erro real de tipo na migration anterior (20260821120000_ssh): "SshHost"."tags" foi
-- criado como array nativo do Postgres (TEXT[]), mas o schema.prisma declara `tags Json` (pra
-- casar com o SQLite dos testes, que não suporta lista escalar — ver comentário no schema).
-- Prisma manda um valor serializado como JSON pra essa coluna; contra um TEXT[] isso quebra em
-- runtime ("malformed array literal"). Nunca editar uma migration já aplicada — esta é a
-- correção como uma migration nova, `USING to_jsonb(tags)` preserva qualquer linha existente.
ALTER TABLE "SshHost" ALTER COLUMN "tags" DROP DEFAULT;
ALTER TABLE "SshHost" ALTER COLUMN "tags" TYPE JSONB USING to_jsonb("tags");
ALTER TABLE "SshHost" ALTER COLUMN "tags" SET DEFAULT '[]'::jsonb;
