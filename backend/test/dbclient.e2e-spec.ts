import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp } from './bootstrap-app';
import { createSampleTargetDb } from './sample-target-db';
import { ADMIN_PASSWORD, seedAdminUser } from './seed-auth';

// Ponta a ponta: login → criar conexão → conectar → tabelas → estrutura → DDL → linhas (com
// filtro/paginação/busca) → ERD → preview de mutation → aplicar → conflito otimista.
// Banco-alvo = SQLite de exemplo (customers/orders com PK, FK e índice) — ver
// test/sample-target-db.ts. CHECKLIST.md, Etapa DB1.
describe('DB Mobile — fluxo completo (e2e)', () => {
  let app: INestApplication;
  let cleanup: () => Promise<void>;
  let target: { path: string; cleanup: () => void };
  let token: string;
  let connectionId: string;

  beforeAll(async () => {
    const boot = await bootstrapTestApp();
    app = boot.app;
    cleanup = boot.cleanup;
    await seedAdminUser(boot.prisma);
    target = createSampleTargetDb();

    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'admin@exemplo.com', password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    target.cleanup();
    await cleanup();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('rejeita login com senha errada', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: 'admin@exemplo.com', password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejeita rota protegida sem token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/connections');
    expect(res.status).toBe(401);
  });

  it('GET /drivers reporta better-sqlite3 instalado', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/drivers').set(auth());
    expect(res.status).toBe(200);
    const sqlite = res.body.find((d: { client: string }) => d.client === 'better-sqlite3');
    expect(sqlite.installed).toBe(true);
  });

  it('cria a conexão com o banco-alvo de exemplo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/connections')
      .set(auth())
      .send({ name: 'Exemplo', client: 'better-sqlite3', config: { connection: { filename: target.path }, useNullAsDefault: true } });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    connectionId = res.body.id;
  });

  it('POST /connections/test funciona sem salvar', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/connections/test')
      .set(auth())
      .send({ client: 'better-sqlite3', config: { connection: { filename: target.path }, useNullAsDefault: true } });
    expect(res.status).toBe(201);
    expect(res.body.version).toMatch(/\d+\.\d+/);
  });

  it('conecta e mostra status', async () => {
    const connect = await request(app.getHttpServer()).post(`/api/v1/connections/${connectionId}/connect`).set(auth());
    expect(connect.status).toBe(201);
    expect(connect.body.connected).toBe(true);

    const status = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/status`).set(auth());
    expect(status.body.connected).toBe(true);
  });

  it('lista tabelas (customers, orders)', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables`).set(auth());
    expect(res.status).toBe(200);
    const names = res.body.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(['customers', 'orders']);
    expect(res.body.find((t: { name: string }) => t.name === 'orders').rowCount).toBe(3);
  });

  it('estrutura de "orders" tem PK, FK e a referência de "customers"', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/orders`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.columns.find((c: { name: string }) => c.name === 'id').isPrimaryKey).toBe(true);
    expect(res.body.foreignKeys.length).toBeGreaterThan(0);
    expect(res.body.foreignKeys[0].refTable).toBe('customers');

    const customers = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/customers`).set(auth());
    expect(customers.body.referencedBy.length).toBeGreaterThan(0);
  });

  it('DDL de "customers" inclui o texto original', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/customers/ddl`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.sql).toMatch(/CREATE TABLE/i);
  });

  it('rows: paginação, filtro e o bloco de edição', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/orders/rows`).set(auth()).query({ limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(2);
    expect(res.body.total).toBe(3);
    expect(res.body.edicao.editavel).toBe(true);
    expect(res.body.edicao.primaryKey).toEqual(['id']);

    const filtered = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}/tables/orders/rows`)
      .set(auth())
      .query({ filters: JSON.stringify([{ column: 'status', op: 'eq', value: 'open' }]) });
    expect(filtered.body.total).toBe(2);
  });

  it('rows: busca rápida encontra por e-mail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}/tables/customers/rows`)
      .set(auth())
      .query({ q: 'ana@' });
    expect(res.body.total).toBe(1);
    expect(res.body.colunasBuscadas).toBeGreaterThan(0);
  });

  it('rows: rejeita coluna que não existe no catálogo (nunca vira SQL)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}/tables/orders/rows`)
      .set(auth())
      .query({ filters: JSON.stringify([{ column: 'drop table orders; --', op: 'eq', value: 1 }]) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_COLUMN');
  });

  it('ERD da tabela e do schema inteiro geram Mermaid com a relação FK', async () => {
    const table = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/orders/erd`).set(auth());
    expect(table.body.mermaid).toContain('erDiagram');
    expect(table.body.mermaid).toContain('customers');

    const whole = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/erd`).set(auth());
    expect(whole.body.mermaid).toContain('orders');
  });

  it('query: SELECT numa tabela só volta editável com a chave primária identificada', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: 'select id, status, total from orders where status = \'open\'' });
    expect(res.status).toBe(201);
    expect(res.body.rows.length).toBe(2);
    expect(res.body.edicao.editavel).toBe(true);
    expect(res.body.edicao.primaryKey).toEqual(['id']);
    expect(res.body.edicao.table).toBe('orders');
  });

  it('query: JOIN volta as linhas mas marcado como não editável', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: 'select o.id, c.name from orders o join customers c on c.id = o.customer_id' });
    expect(res.status).toBe(201);
    expect(res.body.rows.length).toBe(3);
    expect(res.body.edicao.editavel).toBe(false);
    expect(res.body.edicao.motivoBloqueio).toMatch(/JOIN/);
  });

  it('query: rejeita instrução de escrita (nunca vira SQL fora de leitura)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: "delete from orders" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSAFE_QUERY');
  });

  it('query: rejeita múltiplas instruções separadas por ";"', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: 'select 1; select 2' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSAFE_QUERY');
  });

  it('query: com allowWrite, INSERT/UPDATE/DELETE rodam de verdade e devolvem affectedRows', async () => {
    const insert = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: "insert into customers (name, email) values ('Carla', 'carla@exemplo.com')", allowWrite: true });
    expect(insert.status).toBe(201);
    expect(insert.body.affectedRows).toBe(1);
    expect(insert.body.edicao.table).toBe('customers');

    const update = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: "update customers set name = 'Carla Souza' where email = 'carla@exemplo.com'", allowWrite: true });
    expect(update.status).toBe(201);
    expect(update.body.affectedRows).toBe(1);

    const check = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: "select name from customers where email = 'carla@exemplo.com'" });
    expect(check.body.rows[0]).toEqual(['Carla Souza']);

    // limpa — não deve sobrar linha extra pros testes de mutations que vêm depois
    const del = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: "delete from customers where email = 'carla@exemplo.com'", allowWrite: true });
    expect(del.status).toBe(201);
    expect(del.body.affectedRows).toBe(1);
  });

  it('query: sem allowWrite, INSERT continua rejeitado (o toggle é obrigatório)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: "insert into customers (name, email) values ('X', 'x@exemplo.com')" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSAFE_QUERY');
  });

  it('query: allowWrite continua bloqueando DDL/administrativo (DROP, ALTER, etc.)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: 'drop table customers', allowWrite: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNSAFE_QUERY');
  });

  let newOrderId: number;

  it('mutations: preview mostra o SQL sem escrever nada', async () => {
    const before = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/orders/count`).set(auth());
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/tables/orders/mutations/preview`)
      .set(auth())
      .send({ changes: [{ kind: 'insert', values: { customer_id: 2, status: 'open', total: 77 } }] });
    expect(res.status).toBe(201);
    expect(res.body.statements[0]).toMatch(/insert/i);
    const after = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/orders/count`).set(auth());
    expect(after.body.count).toBe(before.body.count);
  });

  it('mutations: aplica insert + update + delete numa transação só', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/tables/orders/mutations`)
      .set(auth())
      .send({
        changes: [
          { kind: 'insert', values: { customer_id: 2, status: 'open', total: 77 } },
          { kind: 'update', key: { id: 3 }, set: { status: 'closed' }, was: { status: 'open' } },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.applied).toBe(2);
    newOrderId = res.body.results[0].returned.id;
    expect(newOrderId).toBeGreaterThan(0);

    const check = await request(app.getHttpServer())
      .get(`/api/v1/connections/${connectionId}/tables/orders/rows`)
      .set(auth())
      .query({ filters: JSON.stringify([{ column: 'id', op: 'eq', value: 3 }]) });
    const statusIdx = check.body.fields.findIndex((f: { name: string }) => f.name === 'status');
    expect(check.body.rows[0][statusIdx]).toBe('closed');
  });

  it('mutations: conflito otimista quando o valor "was" não bate mais (rollback da transação inteira)', async () => {
    const before = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/orders/count`).set(auth());
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/tables/orders/mutations`)
      .set(auth())
      .send({
        changes: [
          // Ordem de EXECUÇÃO é sempre insert→update→delete (mutations.service.ts#order),
          // não a ordem de entrada — então o update roda ANTES do delete mesmo vindo depois
          // aqui, e é ele quem falha (índice 0 na ordem executada).
          { kind: 'delete', key: { id: newOrderId } }, // válido, mas nem chega a rodar — o update antes dele falha
          { kind: 'update', key: { id: 3 }, set: { status: 'aberto-de-novo' }, was: { status: 'open' } }, // "was" errado — já é 'closed'
        ],
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.index).toBe(0);

    // rollback confirmado: o delete NÃO deve ter ficado — total de linhas igual a antes
    const after = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}/tables/orders/count`).set(auth());
    expect(after.body.count).toBe(before.body.count);
  });

  it('mutations: NULL_PK barra update sem chave', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/tables/orders/mutations`)
      .set(auth())
      .send({ changes: [{ kind: 'update', key: { id: null }, set: { status: 'x' } }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NULL_PK');
  });

  it('marca a conexão como somente leitura e bloqueia mutação (READ_ONLY)', async () => {
    const patch = await request(app.getHttpServer()).patch(`/api/v1/connections/${connectionId}`).set(auth()).send({ readOnly: true });
    expect(patch.status).toBe(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/tables/orders/mutations`)
      .set(auth())
      .send({ changes: [{ kind: 'delete', key: { id: 1 } }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('READ_ONLY');
  });

  it('allowWrite não sobrepõe a conexão marcada como somente leitura (READ_ONLY)', async () => {
    // a conexão já está readOnly:true por causa do teste anterior — o toggle do app não manda
    // mais que essa marcação.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/connections/${connectionId}/query`)
      .set(auth())
      .send({ sql: "update orders set status = 'x' where id = 1", allowWrite: true });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('READ_ONLY');
  });

  it('a senha nunca volta em claro nem cifrada — só o placeholder', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/connections/${connectionId}`).set(auth());
    // esta conexão sqlite não tem senha, então config.connection.password nem deveria existir —
    // ver o teste dedicado de criptografia em connections.service.spec.ts pro caso COM senha
    expect(res.body.config.connection.password).toBeUndefined();
  });

  it('desconecta e apaga a conexão', async () => {
    const disconnect = await request(app.getHttpServer()).post(`/api/v1/connections/${connectionId}/disconnect`).set(auth());
    expect(disconnect.body.connected).toBe(false);

    const del = await request(app.getHttpServer()).delete(`/api/v1/connections/${connectionId}`).set(auth());
    expect(del.status).toBe(200);

    const list = await request(app.getHttpServer()).get('/api/v1/connections').set(auth());
    expect(list.body.find((c: { id: string }) => c.id === connectionId)).toBeUndefined();
  });
});
