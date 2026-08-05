# lib-http-kit

> Biblioteca HTTP para construção de APIs Express com autorização JWT, validação Zod, sistema de permissões granulares, métricas Prometheus e error handling padronizado (RFC 7807).

## Índice

- [Instalação](#instalação)
- [Quick Start](#quick-start)
- [ExpressAdapter](#expressadapter)
- [Controllers](#controllers)
  - [Decorator API](#decorator-api)
  - [Fluent API (RouteBuilder)](#fluent-api-routebuilder)
  - [Validação com Zod](#validação-com-zod)
- [Middlewares de Autorização](#middlewares-de-autorização)
  - [Authorize (Usuário / Credencial)](#authorize)
  - [TenantAuthorize](#tenantauthorize)
  - [InternalOnly](#internalonly)
- [Sistema de Permissões](#sistema-de-permissões)
  - [Recursos e Ações](#recursos-e-ações)
  - [PermissionManager](#permissionmanager)
  - [PermissionUtils](#permissionutils)
- [Error Handling](#error-handling)
  - [DomainError](#domainerror)
  - [Erros pré-definidos](#erros-pré-definidos)
- [Métricas Prometheus](#métricas-prometheus)
- [Utilitários](#utilitários)
- [Referência de Tipos](#referência-de-tipos)

---

## Instalação

```bash
pnpm add @synkestra/lib-http-kit
```

**Peer dependencies:**

```bash
pnpm add express zod
```

**Variáveis de ambiente obrigatórias:**

```env
JWT_SECRET=your-jwt-secret
AUTH_SERVICE_URL=https://auth.example.com
```

---

## Quick Start

```typescript
import { ExpressAdapter } from "@synkestra/lib-http-kit";
import { UserController } from "./controllers/UserController";

const adapter = ExpressAdapter.create({
  basePath: "/api/v1",
  logging: true,
  metrics: true,
});

adapter
  .addController(new UserController())
  .setup()
  .listen(3000, "0.0.0.0", () => {
    console.log("Server running on port 3000");
  });
```

---

## ExpressAdapter

Classe principal que encapsula o Express com configuração padronizada.

### Criação

```typescript
const adapter = ExpressAdapter.create({
  jsonLimit: "10mb", // Limite do body JSON (default: '10mb')
  enableCors: true, // Habilitar CORS (default: true)
  corsOptions: {
    // Opções do CORS (default: { origin: '*', credentials: true })
    origin: "*",
    credentials: true,
  },
  logging: false, // Log de requests (default: false)
  basePath: "/api/v1", // Prefixo global para todas as rotas (default: '')
  logger: customLogger, // Logger customizado (implementa ILogger)
  metrics: true, // Habilitar Prometheus (default: desabilitado) — ver seção Métricas
  metricsPath: "/metrics", // Path do endpoint de métricas (default: '/metrics')
});
```

### Métodos (encadeáveis)

| Método                            | Descrição                                                               |
| --------------------------------- | ----------------------------------------------------------------------- |
| `.addRoute(route)`                | Registra uma rota única                                                 |
| `.addRoutes(routes)`              | Registra múltiplas rotas                                                |
| `.addController(controller)`      | Registra um controller e suas rotas                                     |
| `.addControllers(controllers)`    | Registra múltiplos controllers                                          |
| `await .addAllControllers(dir)`   | Auto-descobre controllers em um diretório (arquivos `*Controller.ts`)   |
| `.use(handler, priority?)`        | Adiciona middleware Express customizado                                 |
| `.setup()`                        | Finaliza configuração (aplica middlewares, 404 handler e error handler) |
| `.listen(port, host?, callback?)` | Inicia o servidor                                                       |

### Acessores

| Método                 | Retorno                          |
| ---------------------- | -------------------------------- |
| `.getApp()`            | Instância Express nativa         |
| `.getRoutes()`         | Array de rotas registradas       |
| `.getControllers()`    | Array de controllers registrados |
| `.getMetricsManager()` | `MetricsManager \| null`         |
| `.printRoutes()`       | Imprime todas as rotas no logger |

### Ordem de chamada

```typescript
ExpressAdapter.create(config)
  .addController(...)     // registra rotas
  .use(customMiddleware)  // middlewares extras
  .setup()                // DEVE ser chamado antes de listen — registra 404 + error handler
  .listen(3000);
```

> **Importante:** `.setup()` deve ser chamado **depois** de registrar todas as rotas e **antes** de `.listen()`.

---

## Controllers

### Decorator API

A forma mais declarativa de definir rotas. Herde de `BaseController` e use os decorators `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`.

```typescript
import {
  BaseController,
  Get,
  Post,
  Delete,
  Middlewares,
  type Req,
  type ReqBody,
  type Res,
} from "@synkestra/lib-http-kit";
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(3),
  email: z.string().email(),
});

type CreateUserBody = z.output<typeof CreateUserSchema>;

export class UserController extends BaseController {
  readonly basePath = "/users";

  @Get("/")
  async list(req: Req, res: Res) {
    res.json([]);
  }

  @Post("/", { bodySchema: CreateUserSchema })
  async create(req: ReqBody<CreateUserBody>, res: Res) {
    // req.body é tipado como { name: string, email: string }
    res.status(201).json(req.body);
  }

  @Delete("/:id", { paramsSchema: z.object({ id: z.string().uuid() }) })
  async remove(req: Req, res: Res) {
    res.status(204).send();
  }
}
```

#### Decorators disponíveis

| Decorator                    | Descrição                                     |
| ---------------------------- | --------------------------------------------- |
| `@Get(path?, options?)`      | Rota GET                                      |
| `@Post(path?, options?)`     | Rota POST                                     |
| `@Put(path?, options?)`      | Rota PUT                                      |
| `@Patch(path?, options?)`    | Rota PATCH                                    |
| `@Delete(path?, options?)`   | Rota DELETE                                   |
| `@Middlewares(handlers[])`   | Middlewares Express no nível da rota          |
| `@Authorize(options?)`       | Autorização de usuário/credencial (ver seção) |
| `@TenantAuthorize(options?)` | Autorização por tenant (ver seção)            |
| `@InternalOnly(options?)`    | Restrição por IP interno (ver seção)          |

**`RouteDecoratorOptions`** (segundo parâmetro dos decorators de rota):

```typescript
{
  bodySchema?: ZodType;     // Schema de validação do body
  querySchema?: ZodType;    // Schema de validação da query string
  paramsSchema?: ZodType;   // Schema de validação dos params de URL
}
```

### Fluent API (RouteBuilder)

Alternativa programática dentro do controller usando os métodos protegidos `this.get()`, `this.post()`, etc.

```typescript
export class PaymentController extends BaseController {
  readonly basePath = "/payments";

  getRoutes() {
    return [
      this.post("/pix")
        .body(z.object({ amount: z.number().positive() }))
        .params(z.object({ tenantId: z.string().uuid() }))
        .middleware(someMiddleware)
        .handle(async (req, res) => {
          // req.body e req.params são tipados automaticamente
          res.status(201).json({ id: "123", amount: req.body.amount });
        }),

      this.get("/status/:id")
        .params(z.object({ id: z.string() }))
        .handle(async (req, res) => {
          res.json({ status: "completed" });
        }),
    ];
  }
}
```

### Functional API (route helper)

Para rotas avulsas (sem controller):

```typescript
import { route } from "@synkestra/lib-http-kit";
import { z } from "zod";

const healthRoute = route({
  method: "get",
  path: "/health",
  handler: (_req, res) => {
    res.json({ status: "ok" });
  },
});

adapter.addRoute(healthRoute);
```

### Validação com Zod

Todos os schemas são validados automaticamente **antes** de chamar o handler. Se a validação falhar, retorna `400` com Problem Details.

```typescript
@Post('/transfer', {
  bodySchema: z.object({
    amount: z.number().positive(),
    recipientId: z.string().uuid(),
  }),
  querySchema: z.object({
    dryRun: z.coerce.boolean().optional(),
  }),
  paramsSchema: z.object({
    accountId: z.string().uuid(),
  }),
})
async transfer(req: Req, res: Res) {
  // Se chegou aqui, body, query e params são válidos e tipados
}
```

---

## Middlewares de Autorização

### Authorize

Valida token JWT e verifica permissões do usuário. Suporta tokens do tipo `PASSWORD` (usuário) e `CREDENTIAL` (machine-to-machine).

**Como decorator:**

```typescript
import {
  Authorize,
  type AuthorizedReq,
} from "@synkestra/lib-http-kit";

export class MemberController extends BaseController {
  readonly basePath = "/members";

  @Authorize({ permissions: ["MEMBER:READ"] })
  @Get("/")
  async list(req: AuthorizedReq, res: Res) {
    // Propriedades injetadas no req:
    // req.customerId  — ID do usuário autenticado
    // req.tenantId    — ID do tenant (do header X-Client-ID)
    // req.permissions — permissões do usuário
    // req.authType    — 'PASSWORD' | 'CREDENTIAL'
    // req.clientId    — (apenas para CREDENTIAL)
    res.json([]);
  }
}
```

**Como função middleware (sem controller):**

```typescript
import { authorize } from "@synkestra/lib-http-kit";

app.get("/users", authorize({ permissions: ["MEMBER:READ"] }), (req, res) => {
  res.json([]);
});
```

**`AuthorizeOptions`:**

```typescript
{
  permissions?: FlatPermission[];  // Permissões exigidas
  roles?: string[];                // Roles exigidas (ex: ['admin', 'user'])
  required?: boolean;              // Se a autenticação é obrigatória (default: true)
  jwtSecret?: string;              // JWT secret customizado (default: env JWT_SECRET)
}
```

**Headers necessários:**

| Header          | Obrigatório   | Descrição            |
| --------------- | ------------- | -------------------- |
| `Authorization` | Sim           | `Bearer <jwt-token>` |
| `X-Client-ID`   | Condicional\* | UUID do tenant       |

\* Obrigatório quando `permissions` ou `roles` são especificados.

**Fluxo — Token PASSWORD (usuário):**

1. Extrai e valida o JWT
2. Extrai `customerId` do token
3. Valida `X-Client-ID` (UUID)
4. Chama `GET {AUTH_SERVICE_URL}/auth/validate?type=password` com token e tenant
5. Verifica roles e permissões

**Fluxo — Token CREDENTIAL (machine-to-machine):**

1. Extrai e valida o JWT (campo `authType: "CREDENTIAL"`)
2. Extrai `clientId` e `tenantId` do token
3. Chama `GET {AUTH_SERVICE_URL}/auth/validate?type=credential`
4. Verifica permissões

### TenantAuthorize

Valida token JWT e verifica permissões específicas do tenant via endpoint separado.

**Como decorator:**

```typescript
import {
  TenantAuthorize,
  type TenantAuthorizedReq,
} from "@synkestra/lib-http-kit";

export class SettingsController extends BaseController {
  readonly basePath = "/settings";

  @TenantAuthorize({ permissions: ["CREDENTIAL.WEBHOOK_SECRET:WRITE"] })
  @Patch("/webhook-secret")
  async update(req: TenantAuthorizedReq, res: Res) {
    // req.customerId, req.tenantId, req.permissions
    res.json({ updated: true });
  }
}
```

**`TenantAuthorizeOptions`:**

```typescript
{
  permissions?: FlatPermission[];  // Permissões do tenant exigidas
  required?: boolean;              // Obrigatório (default: true)
  jwtSecret?: string;              // JWT secret customizado
}
```

**Headers necessários:**

| Header          | Obrigatório | Descrição            |
| --------------- | ----------- | -------------------- |
| `Authorization` | Sim         | `Bearer <jwt-token>` |
| `X-Client-ID`   | Sim         | UUID do tenant       |

**Fluxo:**

1. Valida JWT e extrai `customerId`
2. Valida `X-Client-ID` (obrigatório)
3. Chama `GET {AUTH_SERVICE_URL}/tenants/permissions` com token e tenant ID
4. Verifica permissões usando `PermissionManager` (lógica OR — basta ter **uma** das permissões)

### InternalOnly

Restringe acesso a IPs internos (redes privadas e/ou allowlist).

**Como decorator:**

```typescript
import { InternalOnly } from "@synkestra/lib-http-kit";

export class InternalController extends BaseController {
  readonly basePath = "/internal";

  @InternalOnly()
  @Get("/health")
  async health(req: Req, res: Res) {
    res.json({ status: "ok" });
  }
}
```

**`InternalOnlyOptions`:**

```typescript
{
  allowlist?: string[];     // IPs extras permitidos (default: env INTERNAL_IP_ALLOWLIST)
  allowPrivate?: boolean;   // Permitir redes privadas 10.x, 172.16.x, 192.168.x, 127.x (default: true)
  required?: boolean;       // Obrigatório (default: true)
  trustProxy?: boolean;     // Confiar no X-Forwarded-For (default: true)
}
```

### Comparação dos middlewares

|                           | `@Authorize` (PASSWORD)        | `@Authorize` (CREDENTIAL)        | `@TenantAuthorize`     | `@InternalOnly`    |
| ------------------------- | ------------------------------ | -------------------------------- | ---------------------- | ------------------ |
| **Endpoint de validação** | `/auth/validate?type=password` | `/auth/validate?type=credential` | `/tenants/permissions` | — (local)          |
| **X-Client-ID**           | Condicional                    | Do token                         | Obrigatório            | —                  |
| **Roles**                 | Sim                            | Não                              | Não                    | —                  |
| **Permissions**           | Sim                            | Sim                              | Sim                    | —                  |
| **Caso de uso**           | Autenticação de usuário        | Machine-to-machine               | Permissões do tenant   | Restrição por rede |

---

## Sistema de Permissões

### Recursos e Ações

Formato: `RECURSO:AÇÃO` ou `RECURSO.SUB_RECURSO:AÇÃO`

**Ações disponíveis:** `READ`, `WRITE`, `DELETE`, `TOGGLE`

**Recursos:**

| Recurso      | Sub-recursos                                           | Descrição   |
| ------------ | ------------------------------------------------------ | ----------- |
| `MEMBER`     | —                                                      | Membros     |
| `INVITE`     | —                                                      | Convites    |
| `TENANT`     | —                                                      | Tenant      |
| `WEBHOOK`    | —                                                      | Webhooks    |
| `CREDENTIAL` | `WEBHOOK_SECRET`, `IP_WHITELIST`, `SECRET_KEY`         | Credenciais |
| `PAYMENT`    | `PIX_IN`, `PIX_OUT`, `PIX_OUT_BATCH`, `DICT`, `REFUND` | Pagamentos  |
| `FINANCIAL`  | `PIN`                                                  | Financeiro  |
| `ROLE`       | —                                                      | Papéis      |
| `REPORT`     | —                                                      | Relatórios  |

**Exemplos:**

```typescript
"MEMBER:READ"; // Ler membros
"MEMBER:*"; // Todas as ações em membros
"CREDENTIAL.WEBHOOK_SECRET:READ"; // Ler webhook secret
"PAYMENT.PIX_OUT:WRITE"; // Criar transferência Pix
"PAYMENT:*"; // Todas as ações em pagamentos (inclui sub-recursos)
"*"; // Super admin — todas as permissões
```

> **Nota:** `WRITE` implica `READ` automaticamente no `PermissionManager`.

### PermissionManager

Gerencia e valida permissões a partir de um array flat.

```typescript
import { PermissionManager } from "@synkestra/lib-http-kit";

const perms = PermissionManager.fromJSON([
  "MEMBER:READ",
  "MEMBER:WRITE",
  "WEBHOOK:*",
]);

perms.has("MEMBER:READ"); // true
perms.has("MEMBER:DELETE"); // false
perms.has("WEBHOOK:TOGGLE"); // true (coberto por WEBHOOK:*)

perms.all(); // ['MEMBER:READ', 'MEMBER:WRITE', 'WEBHOOK:*']
perms.toJSON(); // serializado

// Wildcard admin
const admin = PermissionManager.fromJSON(["*"]);
admin.has("PAYMENT.PIX_OUT:WRITE"); // true
```

### PermissionUtils

Utilitários para validação e normalização de permissões.

```typescript
import { PermissionUtils } from "@synkestra/lib-http-kit";

// Retorna apenas permissões válidas (remove strings inválidas)
PermissionUtils.filterValid(["MEMBER:READ", "INVALIDO", "WEBHOOK:WRITE"]);
// → ['MEMBER:READ', 'WEBHOOK:WRITE']

// Lista todas as permissões possíveis
PermissionUtils.getAllAvailablePermissions();

// Normaliza removendo redundâncias (ex: TENANT:READ é coberto por TENANT:*)
PermissionUtils.normalizePermissions(["TENANT:READ", "TENANT:*"]);
// → ['TENANT:*']
```

---

## Error Handling

A lib usa o padrão **Problem Details (RFC 7807)** para todas as respostas de erro.

### DomainError

Classe base abstrata para erros de domínio. Ao lançar um `DomainError` dentro de um handler, o `ErrorHandler` serializa automaticamente como Problem Details:

```typescript
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "@synkestra/lib-http-kit";

// Lança → 400
throw new BadRequestError("Campo obrigatório", "MISSING_FIELD");

// Lança → 404
throw new NotFoundError("Usuário não encontrado", "USER_NOT_FOUND");

// Lança → 403
throw new ForbiddenError("Sem acesso", "ACCESS_DENIED");
```

**Resposta gerada automaticamente:**

```json
{
  "type": "https://api.example.com/problems/bad-request",
  "title": "Bad Request",
  "status": 400,
  "detail": "Campo obrigatório",
  "code": "MISSING_FIELD",
  "instance": "/api/v1/users"
}
```

**Classes base disponíveis:**

| Classe              | Status |
| ------------------- | ------ |
| `BadRequestError`   | 400    |
| `UnauthorizedError` | 401    |
| `ForbiddenError`    | 403    |
| `NotFoundError`     | 404    |
| `ConflictError`     | 409    |

### Erros pré-definidos

A lib exporta erros prontos para cenários comuns de autenticação e domínio:

**Autenticação / Token:**

| Erro                        | Status | Descrição                                         |
| --------------------------- | ------ | ------------------------------------------------- |
| `TokenExpiredError`         | 401    | Token expirado (aceita `'access'` ou `'refresh'`) |
| `TokenInvalidError`         | 401    | Token inválido                                    |
| `TokenRevokedError`         | 401    | Token revogado                                    |
| `RefreshTokenNotFoundError` | 401    | Refresh token não encontrado                      |
| `RefreshTokenRevokedError`  | 401    | Refresh token revogado                            |
| `InvalidCredentialsError`   | 401    | Credenciais inválidas                             |

**Conta / Tenant:**

| Erro                       | Status | Descrição                |
| -------------------------- | ------ | ------------------------ |
| `AccountInactiveError`     | 403    | Conta inativa            |
| `AuthTenantIdError`        | 400    | Tenant ID inválido       |
| `AuthTenantForbiddenError` | 403    | Sem acesso ao tenant     |
| `AuthLevelPermissionError` | 403    | Sem permissão suficiente |

**Identidade:**

| Erro                      | Status | Descrição            |
| ------------------------- | ------ | -------------------- |
| `EmailAlreadyExistsError` | 409    | E-mail já cadastrado |
| `CpfAlreadyExistsError`   | 409    | CPF já cadastrado    |
| `CpfNotFoundError`        | 404    | CPF não encontrado   |

**Two-Factor:**

| Erro                           | Status | Descrição                                  |
| ------------------------------ | ------ | ------------------------------------------ |
| `TwoFactorRequiredError`       | 403    | 2FA obrigatório (retorna `challengeToken`) |
| `InvalidTotpCodeError`         | 401    | Código TOTP inválido                       |
| `TwoFactorAlreadyEnabledError` | 409    | 2FA já habilitado                          |
| `TwoFactorNotEnabledError`     | 400    | 2FA não habilitado                         |

**API:**

| Erro               | Status | Descrição           |
| ------------------ | ------ | ------------------- |
| `ApiRouteNotFound` | 404    | Rota não encontrada |

**Erros de Zod** são capturados automaticamente pelo `ErrorHandler` e retornam `400` com detalhes de validação por campo.

---

## Métricas Prometheus

A lib integra o `prom-client` para exposição de métricas HTTP e do runtime Node.js.

### Habilitando no ExpressAdapter

```typescript
// Modo simples — defaults
const adapter = ExpressAdapter.create({ metrics: true });

// Modo configurado
const adapter = ExpressAdapter.create({
  metrics: {
    prefix: "payments_", // Prefixo para todas as métricas
    defaultLabels: { service: "payment-api" }, // Labels globais
    defaultMetrics: true, // Métricas do Node.js (default: true)
    httpDurationBuckets: [0.01, 0.05, 0.1, 0.5, 1], // Buckets customizados
  },
  metricsPath: "/internal/metrics", // default: '/metrics'
});
```

### Métricas coletadas automaticamente

| Métrica                         | Tipo      | Labels                           | Descrição                          |
| ------------------------------- | --------- | -------------------------------- | ---------------------------------- |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Duração das requests               |
| `http_requests_total`           | Counter   | `method`, `route`, `status_code` | Total de requests                  |
| `http_active_requests`          | Gauge     | `method`                         | Requests em andamento              |
| Métricas padrão do Node.js      | Vários    | —                                | CPU, memória, event loop, GC, etc. |

### Endpoint `/metrics`

Registrado automaticamente. Retorna métricas no formato Prometheus text:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/users",status_code="200"} 42

# HELP http_request_duration_seconds Duration of HTTP requests in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",route="/users",status_code="200",le="0.05"} 38
...
```

### Métricas customizadas

Use `getMetricsManager()` para criar métricas de negócio:

```typescript
const metrics = adapter.getMetricsManager()!;

// Counter
const pixTransactions = metrics.createCounter(
  "pix_transactions_total",
  "Total Pix transactions",
  ["type", "status"],
);
pixTransactions.inc({ type: "PIX_OUT", status: "success" });

// Histogram
const processingTime = metrics.createHistogram(
  "payment_processing_seconds",
  "Payment processing time",
  ["type"],
  [0.1, 0.5, 1, 5, 10],
);
const end = processingTime.startTimer({ type: "PIX_OUT" });
// ... processa ...
end();

// Gauge
const queueSize = metrics.createGauge(
  "payment_queue_size",
  "Current payment queue size",
  ["priority"],
);
queueSize.set({ priority: "high" }, 5);
```

### Uso standalone (sem ExpressAdapter)

```typescript
import {
  MetricsManager,
  metricsMiddleware,
} from "@synkestra/lib-http-kit";
import express from "express";

const app = express();
const metrics = new MetricsManager({ prefix: "myapp_" });

app.use(metricsMiddleware(metrics));

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", metrics.getContentType());
  res.end(await metrics.getMetrics());
});
```

---

## Utilitários

### createFlatPermissionSchema

Schema Zod que valida se uma string é uma permissão válida conforme os recursos/ações definidos.

```typescript
import { createFlatPermissionSchema } from "@synkestra/lib-http-kit";
import { z } from "zod";

const schema = z.object({
  permissions: z.array(createFlatPermissionSchema),
});

schema.parse({ permissions: ["MEMBER:READ", "WEBHOOK:*"] }); // OK
schema.parse({ permissions: ["INVALIDO"] }); // ZodError
```

### applyDomainValidation

Aplica validação de domínio (Value Object) dentro de um `z.superRefine`.

```typescript
import { applyDomainValidation } from "@synkestra/lib-http-kit";
import { z } from "zod";

const schema = z.string().superRefine((val, ctx) => {
  applyDomainValidation(ctx, Email.create, val, "E-mail inválido");
});
```

---

## Referência de Tipos

### Request types

```typescript
type Req<TBody, TQuery, TParams>            // Request tipado base
type ReqBody<T>                              // Apenas body tipado
type ReqQuery<T>                             // Apenas query tipada
type ReqParams<T>                            // Apenas params tipados
type ReqBodyParams<TBody, TParams>           // Body + params tipados
type ReqBodyQuery<TBody, TQuery>             // Body + query tipados
type ReqQueryParams<TQuery, TParams>         // Query + params tipados
type Res                                     // Response do Express
type AuthorizedReq<TBody, TQuery, TParams>   // Req + AuthorizeContext
type TenantAuthorizedReq<TBody, TQuery, TParams> // Req + TenantAuthorizeContext
```

### Interfaces principais

```typescript
interface IExpressAdapterConfig {
  jsonLimit?: string;
  enableCors?: boolean;
  corsOptions?: Record<string, unknown>;
  logging?: boolean;
  basePath?: string;
  logger?: ILogger;
  metrics?: boolean | MetricsConfig;
  metricsPath?: string;
}

interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface MetricsConfig {
  prefix?: string;
  defaultMetrics?: boolean;
  defaultLabels?: Record<string, string>;
  httpDurationBuckets?: number[];
}
```

---

## Licença

UNLICENSED — Uso privado pela Synkestra.

---

## 🤝 Suporte

Para questões ou problemas, entre em contato com a equipe de desenvolvimento.
