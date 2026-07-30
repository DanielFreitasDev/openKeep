# Roadmap — o que falta construir

> Backlog vivo do OpenKeep. A ideia: **atacar um item por vez** e marcar `[x]` quando concluir
> (com a data, ex.: `[x] ... — feito em 2026-08-02`). Escrito em pt-BR por ser documento de
> trabalho; os demais docs do repo permanecem em inglês.
>
> Última atualização: **2026-07-30**

**Legenda de esforço** — `P` até ~1 dia · `M` 2–4 dias · `G` 1 semana ou mais.
**Legenda de impacto** — `alto` muda o dia a dia de quem usa · `médio` melhora perceptível · `baixo` polimento.

Relação com os outros docs:

- [PARITY.md](PARITY.md) — checklist de paridade com o Keep. Quando um item de paridade daqui for
  concluído, atualize também a linha/seção correspondente lá.
- [FEATURES.md](FEATURES.md) — catálogo do que o Keep faz e o que a v1.0 cobriu.
- [DECISIONS.md](DECISIONS.md) — decisões de arquitetura; consulte antes de implementar algo que
  esbarre nelas (ex.: sem CORS, Better Auth core-only, LWW sem CRDT).

---

## 1. Dívidas de paridade da v1.0

Os 16 adiamentos conscientes listados em PARITY.md ("Known deferrals"), agora com plano de ataque.

### 1.1 Funcionalidade visível

- [ ] **Filtro "Pessoas" na busca** *(impacto alto · esforço P)*
  **O quê:** tile "People" nos filtros da busca (avatares dos colaboradores) + filtro combinável.
  **Como:** o corpus do cliente já carrega colaboradores → seletor client-side é imediato; no
  servidor, um parâmetro `collaborator` em `/api/search` vira um `EXISTS` sobre `note_members`.
  É o adiamento de maior impacto/menor custo — bom primeiro item.

- [ ] **Ações em massa "Lembrete" e "Alterar marcadores"** *(impacto médio · esforço M)*
  **O quê:** na barra de seleção múltipla, o botão Remind e o menu "Change labels" operando sobre
  N notas (os fluxos por nota já existem).
  **Como:** reaproveitar os popovers existentes; no estado de labels, exibir checkbox
  indeterminado quando parte da seleção tem o label (comportamento do Keep). Mutações em lote =
  N PATCHes otimistas (padrão já usado no bulk pin/color/archive).

- [ ] **Atalhos de item de lista `n`/`p`/`Shift+N`/`Shift+P`** *(impacto baixo · esforço M/G)*
  **O quê:** navegar/mover o "item selecionado" do checklist pelo teclado, como no Keep.
  **Como:** exige um estado de foco de item que não digita (hoje cada item é um `textarea`
  nativo). Criar um "modo seleção de item" no editor de checklist; devolver os atalhos ao
  diálogo `?` (foram removidos de lá para não anunciar atalho morto).

- [ ] **Indentar item de checklist arrastando para a direita** *(impacto baixo · esforço P/M)*
  **O quê:** além de `Tab`/`Ctrl+]`, arrastar o item ~24px à direita indenta (paridade Keep).
  **Como:** no drag handler (pragmatic-drag-and-drop), usar o deslocamento X do ponteiro para
  decidir indent vs reorder; primeiro item continua não indentável.

- [ ] **Extras do editor de desenho** *(impacto médio · esforço G)*
  **O quê:** ferramenta de laço (mover seleção de traços), zoom/pan do canvas, desenhar sobre
  fotos e canvas auto-extensível (hoje o tamanho é fixo na criação).
  **Como:** os traços já são vetores (`drawing_data` jsonb, DECISIONS #24), então laço/zoom são
  transformações client-side; desenhar sobre foto = novo `kind` ligando a um attachment de
  imagem como fundo. Fatiar em 4 entregas independentes, nessa ordem: zoom/pan → laço →
  auto-extend → sobre fotos.

### 1.2 Robustez e infraestrutura

- [ ] **Flush do autosave em blur de campo** *(impacto médio · esforço P)*
  Hoje o flush cobre debounce/close/Esc/`visibilitychange`/pagehide/unmount; falta disparar no
  blur simples de título/corpo. Adicionar handler de blur que força o flush do campo sujo.

- [ ] **Undo/redo de sessão para título e itens de lista** *(impacto médio · esforço M)*
  O histórico do TipTap cobre só o corpo. Construir o ring buffer de snapshots
  (título + itens) por sessão de edição, integrado aos mesmos atalhos Ctrl+Z/Y do editor.

- [ ] **Mídia offline** *(impacto médio · esforço M/G)*
  Nota composta offline restaura texto/labels/lembrete após reload, mas perde imagens; uploads
  pausados não sobrevivem ao reload. Persistir os blobs no IndexedDB junto ao outbox
  (DECISIONS #22) e re-enfileirar o upload no replay (FormData não serializa — guardar blob +
  metadados e reconstruir).

- [ ] **Virtualização do grid acima de ~400 cards/seção** *(impacto médio · esforço G)*
  Hoje todo card renderiza (teto prático ~5k notas, ver ARCHITECTURE.md). O motor de masonry já
  é posicionamento absoluto → janela de renderização por faixa de scroll é encaixável sem trocar
  o layout. Cuidado com FLIP animations e âncora de scroll.

- [ ] **Heartbeat de WebSocket no cliente** *(impacto baixo · esforço P)*
  O servidor pinga a cada 30s; o cliente confia em reconexão por visibilidade/online. Adicionar
  timer client-side que fecha e reconecta se nenhuma mensagem/pong chegar em N segundos.

- [ ] **Roving tabindex no grid** *(impacto baixo · esforço P/M)*
  Todos os cards são tab stops (`tabIndex=0`). Implementar roving: um tab stop por grid, setas/j/k
  movem o foco ativo — melhora Tab-navigation com centenas de notas.

- [ ] **Auth do WS durante o handshake** *(impacto baixo · esforço P/M)*
  Hoje o cookie de sessão é checado logo após o upgrade (fecha 4401 antes de registrar). Mover a
  verificação para antes de aceitar o upgrade (hook de `upgrade`/`preValidation` da rota WS).

- [ ] **CSP nas respostas JSON da API** *(impacto baixo · esforço P)*
  A CSP estrita cobre SPA/estáticos; a API responde só com `nosniff` + checagens same-origin.
  Adicionar cabeçalho CSP mínimo (`default-src 'none'`) nas respostas JSON.

- [ ] **Endpoint `/metrics` (+ Sentry opcional)** *(impacto baixo · esforço P/M)*
  `METRICS_ENABLED` já é validado na config mas a rota não existe. Expor Prometheus
  (contadores HTTP, jobs pg-boss, sockets ativos) atrás de auth/bind interno; avaliar Sentry
  como opt-in por env.

- [ ] **Aviso de `sharees` no import do Takeout** *(impacto baixo · esforço P)*
  Notas importadas nunca são recompartilhadas e nada avisa. Ao final do job, listar no relatório
  de import as notas que tinham colaboradores no Takeout ("N notas eram compartilhadas — o
  compartilhamento não é importado").

- [ ] **E2E de login/signup pela UI** *(impacto baixo · esforço P)*
  Os specs autenticam via API. Adicionar spec Playwright cobrindo cadastro, login, erro de senha
  e logout pela interface.

---

## 2. Pós-1.0 já planejado (FEATURES.md)

Itens que o próprio catálogo já lista como roadmap.

- [ ] **Gravação de áudio no navegador** *(impacto alto · esforço M)*
  O player e o import de áudio existem; falta gravar (o Keep web não grava — divergência boa).
  `MediaRecorder` → upload como attachment de áudio existente. Transcrição fica no item 3.6.

- [ ] **OCR — "Capturar texto da imagem"** *(impacto médio · esforço M/G)*
  Extrair texto de imagens para o corpo (paridade com o Keep) e, idealmente, indexar no FTS
  para busca dentro de fotos. Opções: tesseract.js no cliente (privado, lento) vs job pg-boss
  server-side. Guardar o texto num campo do attachment e concatenar no documento FTS.

- [ ] **Classificação automática "Things"** *(impacto baixo · esforço M)*
  Agrupamentos automáticos tipo Keep (compras, viagem…) na busca. Heurística por palavras-chave
  por locale já entrega o essencial; LLM é overkill aqui.

- [ ] **Masonry nativo `display: grid-lanes`** *(impacto baixo · esforço P/M)*
  Progressive enhancement quando sair do Safari-only (DECISIONS #6). Manter o motor JS como
  fallback; feature-detect e desligar o posicionamento absoluto.

- [ ] **Offline local-first completo** *(impacto médio · esforço G)*
  Hoje: leitura via cache do SW + outbox de escrita + draft mirror (DECISIONS #22). O passo
  final é persistir o corpus (queries) e resolver conflitos de forma mais rica. Só atacar com
  demanda real — o modelo LWW atual é uma limitação documentada e aceita.

---

## 3. Além do Keep — o que as pessoas sempre pediram

Pesquisado em 2026-07 em fóruns/imprensa internacional e brasileira (fontes no fim do doc).
Recorrentes em toda parte: **pastas/hierarquia, markdown/formatação melhor, vincular notas,
proteger notas, compartilhar por link/exportar, buscar dentro da nota**. Cada item novo aqui é
uma divergência consciente do Keep → quando entregue, marcar 🔀 no PARITY.md.

### 3.1 Editor e conteúdo

- [ ] **⭐ Markdown — Fase A: digitação e colagem** *(impacto alto · esforço P/M)*
  **O quê:** a nota "entende" markdown ao digitar: `# `/`## ` viram H1/H2, `**x**` negrito,
  `*x*` itálico, e colar texto markdown converte para rich text. É a ideia-guia deste roadmap.
  **Como:** TipTap 3 — as extensões já usadas trazem *input rules* (verificar se estão ativas na
  config atual e habilitar); colagem via serializer markdown→ProseMirror (ex.:
  `prosemirror-markdown` restrito ao vocabulário atual H1/H2/B/I/U). Nada muda no servidor:
  o HTML resultante já pertence ao allowlist do sanitizador.

- [ ] **⭐ Markdown — Fase B: importar e exportar `.md`** *(impacto alto · esforço M)*
  **O quê:** exportar nota como `.md` (menu da nota + em massa no export zip) e importar arquivos
  `.md` criando notas (título = H1 ou nome do arquivo; `- [ ]`/`- [x]` viram itens de checklist).
  **Como:** serializer ProseMirror→markdown no servidor (vale para o export JSON existente e
  para o MCP); import como job leve reaproveitando o pipeline do Takeout. Abre interoperabilidade
  com Obsidian/Joplin — a razão nº 1 de migração citada nos fóruns.

- [ ] **⭐ Markdown — Fase C: sintaxe estendida** *(impacto médio · esforço M/G)*
  **O quê:** tachado (`~~x~~`), código inline e bloco de código, citação (`> `), régua (`---`),
  link nomeado (`[texto](url)`). Divergência do set May-2025 do Keep — marcar 🔀.
  **Como:** adicionar as extensões TipTap correspondentes + **ampliar o allowlist do sanitizador
  no servidor** (hoje casado com o set do Keep) + renderização no card. FTS não muda (indexa
  texto). Decidir tema de bloco de código (sem highlight na v1 é ok).

- [ ] **Busca dentro da nota (Ctrl+F)** *(impacto alto · esforço P/M)*
  **O quê:** localizar/realçar termos dentro de uma nota aberta — ausência famosa do Keep por
  13 anos ([Tom's Guide](https://www.tomsguide.com/computing/mobile-apps/google-keep-is-finally-adding-a-feature-thats-been-missing-for-13-years)).
  **Como:** no editor, decoration do ProseMirror destacando matches + contador/navegação
  (interceptar Ctrl+F quando o editor está aberto; Esc devolve o atalho ao navegador).

- [ ] **Texto e checklist na mesma nota** *(impacto alto · esforço G)*
  **O quê:** a reclamação nº 1 da Android Police: marcar checkbox converte a nota inteira em
  lista; querem parágrafos + checklists misturados.
  **Como:** caminho A (grande): checklists como nós TipTap dentro do corpo — colide com o modelo
  `note_items` (endpoints por item, LWW fino, MCP). Caminho B (pragmático): manter os dois blocos
  na mesma nota (corpo rico **e** seção de checklist), que o Keep não tem. Decidir antes de
  codar; B preserva a arquitetura e resolve 80% do pedido.

- [ ] **Vincular notas (`[[` + backlinks)** *(impacto alto · esforço M)*
  **O quê:** digitar `[[` abre um picker de notas (como o `#` de labels) e insere um chip-link;
  painel "mencionada em" (backlinks) no editor. Pedido recorrente (Keep trata cada nota como
  post-it isolado — [XDA](https://www.xda-developers.com/i-used-notion-obsidian-and-evernote-only-to-go-back-to-google-keep/)).
  **Como:** reaproveitar o popover do quick-label; link = marca TipTap com o uuid da nota
  (`?note=` já é deep link estável, DECISIONS #13); backlinks = índice client-side sobre o
  corpus + coluna/consulta no servidor para contas grandes. Sanitizador: permitir o atributo.

- [ ] **Modelos de nota (templates)** *(impacto médio · esforço M)*
  **O quê:** salvar nota como modelo e criar a partir dele (composer → "Novo a partir de
  modelo"). Ausência sentida por quem vai para o Notion/Obsidian.
  **Como:** flag `is_template` no membership ou tabela própria; criar = clonar conteúdo
  (reaproveitar o "Make a copy", que já copia cor/labels/imagens).

- [ ] **Anexar qualquer arquivo (PDF etc.)** *(impacto médio · esforço M)*
  **O quê:** hoje só imagem/áudio/desenho; self-host pede PDF, docs, zip.
  **Como:** novo `kind='file'` em `attachments` com allowlist de extensão+magic bytes e teto de
  tamanho; chip de download no card/editor. PDF ganha preview depois (iframe same-origin).

- [ ] **Tabelas simples** *(impacto baixo · esforço G)*
  Pedido clássico, mas pesado: extensão de tabela do TipTap + sanitizador + render no card +
  export. Só atacar depois do markdown C; avaliar se a demanda real aparece.

- [ ] **Contador de palavras/caracteres** *(impacto baixo · esforço P)*
  No rodapé do editor (junto do "Edited…"), contagem de palavras/caracteres do corpo — os limites
  (19.999) hoje são invisíveis até estourar.

### 3.2 Organização e busca

- [ ] **Sub-labels / pastas (hierarquia)** *(impacto alto · esforço M/G)*
  **O quê:** o pedido nº 1 no Brasil e fora ("faltam pastas"; labels planos não escalam —
  [Edivaldo Brito](https://www.edivaldobrito.com.br/as-melhorias-do-google-keep-nao-sao-suficientes-para-mudar-minha-opiniao-sobre-o-app/),
  [Medium](https://kurtis-redux.medium.com/from-google-keep-to-obsidian-its-not-complex-features-that-end-the-chaos-it-s-simple-6c093ea21d2d)).
  **Como:** `parent_id` na tabela de labels (por usuário), árvore no sidebar com expandir/
  recolher, rota `/label/pai/filho`, filtro incluindo descendentes. Manter cap (50) e unicidade
  case-insensitive por nível. Labels continuam sendo a base — "pasta" é só label com filhos.

- [ ] **Cor/emoji e ordem manual nos labels** *(impacto médio · esforço P/M)*
  Cor ou emoji por label (chip e sidebar) + reordenar por arrasto no sidebar em vez de ordem
  alfabética fixa. Reusar `fractional-indexing` (DECISIONS #12).

- [ ] **Ordenação alternativa das notas** *(impacto médio · esforço P/M)*
  O Keep só tem ordem manual. Adicionar seletor por visão: manual (padrão) · data de edição ·
  data de criação · título. Client-side sobre o corpus; persistir em settings. Não mexe nas
  posições fracionais (a manual continua a fonte de verdade).

- [ ] **Operadores de busca** *(impacto médio · esforço M)*
  `label:mercado`, `color:blue`, `has:image|list|reminder`, `is:pinned|archived`,
  `before:/after:2026-01-01`, `-termo`. Parser client-side sobre o corpus (a busca já é
  instantânea) + tradução para parâmetros do `/api/search` para contas grandes/MCP.

- [ ] **Buscas salvas** *(impacto baixo · esforço P/M)*
  Salvar uma combinação busca+filtros como atalho no sidebar (vira "label inteligente").
  Depende dos operadores acima; persistir em settings.

- [ ] **Mesclar notas** *(impacto baixo · esforço P/M)*
  Na seleção múltipla, "Mesclar" concatena corpos/itens/imagens numa nota (Apple Notes tem, o
  pessoal sente falta —
  [Jornal em Destaque](https://www.jornalemdestaque.com/tecnologia/eu-uso-o-google-keep-todos-os-dias-mas-esses-recursos-do-apple-notes-ainda-me-deixam-com-ciumes/580398/)).
  Original vai para a lixeira (desfazível por 7 dias).

- [ ] **Visão calendário dos lembretes** *(impacto baixo · esforço M)*
  Alternativa mensal à lista de Reminders, mostrando as ocorrências (o wrapper de rrule já
  expande recorrência). Só leitura na v1; clicar abre a nota.

### 3.3 Compartilhamento, privacidade e exportação

- [ ] **Permissão somente-leitura no compartilhamento** *(impacto alto · esforço M)*
  **O quê:** o Keep só tem "pode editar"; visualizar-sem-editar é pedido constante.
  **Como:** coluna `role` (`editor`/`viewer`) em `note_members` — cai exatamente no chokepoint
  `assertNoteAccess` (DECISIONS #9), que passa a receber o nível exigido por rota. UI: seletor no
  diálogo de colaboradores; viewer mantém estado próprio (pin/cor/labels) por definição do modelo.

- [ ] **Compartilhar por link público (somente leitura)** *(impacto alto · esforço M)*
  **O quê:** "sem opção de compartilhar por link" é uma das 6 faltas da
  [Android Police](https://www.androidpolice.com/google-keep-missing-features-annoy-me/).
  **Como:** token aleatório por nota (`share_links`: id, note_id, token, expiração, revogável) →
  rota pública `/s/<token>` (SSR leve ou SPA sem auth) com rate limit; imagens servidas por URL
  assinada derivada do token. Excluir de robots; revogar = deletar linha.

- [ ] **Compartilhar várias notas de uma vez** *(impacto baixo · esforço P)*
  Na barra de seleção, "Colaborador" aplica o convite às N notas (a Android Police também cita).
  Depende só de reaproveitar o diálogo existente em lote.

- [ ] **Proteger nota com PIN/senha (ocultar)** *(impacto médio · esforço M)*
  **O quê:** nota "trancada": conteúdo borrado/oculto (inclusive na busca) até confirmar senha
  da conta ou PIN. Top-6 da Android Police.
  **Como:** flag por membership + re-auth pontual (Better Auth já expõe verificação de senha);
  excluir corpo do corpus client-side enquanto trancada (título genérico "Nota protegida").
  **Não é criptografia** — deixar explícito na UI (o servidor continua lendo o conteúdo).

- [ ] **Exportar como PDF / imprimir bem** *(impacto médio · esforço P/M)*
  Menu da nota → "Imprimir/PDF": stylesheet de impressão dedicada (nota limpa, sem chrome) +
  `window.print()`. Resolve "exportar como PDF ou imagem" sem dependência server-side.

### 3.4 Captura e integrações

- [ ] **PWA Share Target (compartilhar → OpenKeep)** *(impacto alto · esforço P)*
  **O quê:** no Android/desktop, o OpenKeep instalado aparece na folha de compartilhar do
  sistema; compartilhar texto/URL/imagem cria nota. Mata a maior vantagem prática do app nativo.
  **Como:** `share_target` no manifest (method POST + enctype multipart p/ arquivos) → rota
  `/share` que abre o composer pré-preenchido (o fluxo de imagem do FAB já cobre o resto).

- [ ] **Extensão de captura no navegador (clipper)** *(impacto médio · esforço M)*
  **O quê:** o Keep tem extensão Chrome; self-host não tem nada. Selecionou texto → salvar como
  nota com a URL de origem.
  **Como:** MV3 mínima falando com a API REST via personal access token (`okp_…`, já existem) —
  zero mudança no servidor. Publicar na Web Store como projeto irmão (fora do monorepo? decidir).

- [ ] **Atalhos de app (manifest shortcuts)** *(impacto baixo · esforço P)*
  Long-press no ícone instalado → "Nova nota", "Nova lista", "Novo desenho" (o FAB já sabe criar
  os três; é só rota com query param + `shortcuts` no manifest).

- [ ] **Webhooks de saída** *(impacto médio · esforço M)*
  **O quê:** POST assinado (HMAC) em URL configurável quando nota é criada/editada/arquivada —
  destrava n8n/Zapier/Home Assistant, pedido típico de self-host.
  **Como:** tabela de webhooks por usuário + job pg-boss com retry/backoff pendurado no mesmo
  ponto que publica no WS (`publishToUsers`); payload = DTO já existente.

- [ ] **Feed iCalendar (.ics) dos lembretes** *(impacto médio · esforço P/M)*
  URL secreta `/api/calendar/<token>.ics` para assinar no Google Calendar/Thunderbird/Proton.
  Lembretes já são RFC-5545 por dentro (DECISIONS — rrule) → mapeamento quase direto para VEVENT.

- [ ] **Criar nota por e-mail** *(impacto baixo · esforço G)*
  Endereço secreto que vira nota. Exige receber e-mail (inbound webhook de um provedor ou SMTP
  próprio) — complexidade alta para self-host; deixar por último ou como plugin opcional.

### 3.5 Self-host e administração

- [ ] **Painel/rotas de administração** *(impacto alto · esforço M/G)*
  **O quê:** o dono da instância hoje administra via SQL. Mínimo viável: listar usuários,
  desativar cadastro público, deletar usuário (com purge de dados/arquivos), uso de disco por
  usuário.
  **Como:** `ADMIN_EMAILS` no env → flag no usuário; rotas `/api/admin/*` + página simples em
  Settings. Cuidado: manter fora do escopo dos PATs (como já é feito com gestão de tokens).

- [ ] **SSO genérico OIDC (Authentik/Keycloak/Pocket ID)** *(impacto alto · esforço M)*
  **O quê:** o pedido nº 1 da comunidade self-host para qualquer app. Hoje: Google/GitHub
  opcionais.
  **Como:** ⚠️ conflita com a postura "Better Auth core-only, sem plugins" (DECISIONS #4/19 —
  CVEs em plugins). Decidir: (a) aceitar o plugin `genericOAuth` pinado + gate de audit, ou
  (b) rota OIDC own-rolled nos moldes dos PATs (~code flow + PKCE + discovery). Documentar a
  escolha em DECISIONS.md.

- [ ] **Passkeys / 2FA** *(impacto médio · esforço M)*
  Mesmo dilema de plugin do item anterior (plugin `passkey`/`twoFactor` vs não ter). Se a decisão
  do OIDC for "aceitar plugin pinado", este pega carona; senão, adiar — não bloqueia nada.

- [ ] **Retenção da lixeira configurável** *(impacto baixo · esforço P)*
  7 dias fixo (paridade). Env `TRASH_RETENTION_DAYS` lido pelo job de purge horário + banner
  dinâmico ("As notas na lixeira são excluídas após N dias") — string i18n nos dois idiomas.

- [ ] **Armazenamento de anexos em S3/MinIO** *(impacto médio · esforço M/G)*
  Hoje anexos vivem em disco. Interface de storage (disco = default, S3 opcional por env) para
  quem roda em container efêmero/quer backup por bucket. Atenção a streams no upload/download e
  às URLs de thumb com cache-bust `?v=` (DECISIONS #24).

- [ ] **Backup automático agendado** *(impacto médio · esforço P/M)*
  O export JSON completo já existe; agendar via pg-boss (cron por env) gravando o zip em
  diretório/S3 com rotação (manter N). DEPLOYMENT.md ganha a seção "restaurar".

- [ ] **Mais idiomas (es, depois comunidade)** *(impacto médio · esforço M)*
  A estrutura i18n é sólida (EN base + pt-BR completo + teste de paridade). Generalizar o teste
  de paridade para N locales e adicionar espanhol; abrir CONTRIBUTING para traduções.

- [ ] **Cotas por usuário** *(impacto baixo · esforço M)*
  Para instância multiusuário: teto de armazenamento/anexos por conta (env), erro claro no
  upload. Junto do painel admin.

### 3.6 IA (opcional, sempre opt-in, BYO key)

A base já é forte: MCP com 43 tools + PATs significa que **agentes externos já fazem tudo** (o
Claude já pode resumir/organizar suas notas hoje). Os itens abaixo são conveniências embutidas —
todas desligadas por padrão, com chave do usuário (`ANTHROPIC_API_KEY`/OpenAI-compat por env) e
tráfego passando pela REST normal (mesmo caminho do MCP, DECISIONS #20).

- [ ] **Transcrição de áudio** *(impacto médio · esforço M)*
  Já citada no roadmap do FEATURES.md. Job pg-boss ao anexar áudio → texto pesquisável no
  attachment (mesmo campo do OCR) + botão "ver transcrição". Backend Whisper API ou binário
  local (faster-whisper) por env.

- [ ] **Sugestão de labels** *(impacto médio · esforço P/M)*
  Ao salvar nota sem label, sugerir 1–3 labels existentes (chip "aceitar"). Começar com
  heurística/embeddings antes de LLM.

- [ ] **Busca semântica** *(impacto médio · esforço M/G)*
  `pgvector` + embeddings por nota (job no save), combinada ao FTS (RRF). Deixa "aquela nota
  sobre a reforma do banheiro" encontrável sem a palavra exata. PG 18 + extensão — checar
  disponibilidade na imagem Docker.

- [ ] **Resumir / gerar título** *(impacto baixo · esforço P/M)*
  Botão no menu da nota para notas longas; escreve no corpo/título via PATCH normal (desfazível).

- [ ] **"Me ajude a criar uma lista"** *(impacto baixo · esforço P/M)*
  Paridade com o Gemini do Keep Android: prompt → checklist pronta no composer. Já listado no
  FEATURES.md como opcional.

---

## 4. Avaliado e descartado (por ora)

Registrado para não rediscutir do zero. Reabrir só com demanda real.

- **Criptografia de ponta a ponta (E2EE)** — incompatível com o coração do produto: FTS no
  Postgres, thumbnails, link previews SSRF-safe, ts_headline, MCP server-side. Joplin paga esse
  preço abrindo mão de busca server-side. Caminho realista se um dia importar: "cofre" E2EE
  separado para notas sensíveis (sem busca/preview). O item 3.3 "PIN" cobre o caso de uso comum.
- **Funções matemáticas na nota** (Apple Notes faz) — fora do caráter do produto.
- **Lembretes por localização** — o próprio Keep descontinuou; FEATURES.md já marca fora de
  escopo.
- **Apps nativos (lojas)** — a aposta é PWA + camada mobile (DECISIONS #23). Reavaliar wrapper
  Capacitor só se o share target (3.4) não bastar.
- **Integrações Google (Docs/Calendar/Assistant)** — fora de escopo por definição.
- **CORS/API cross-origin** — nunca (DECISIONS #8); integrações externas usam PAT server-to-server.

---

## 5. Ordem de ataque sugerida

O status oficial é o checkbox lá em cima; isto aqui é só a fila recomendada (impacto ÷ esforço):

1. **Markdown fase A** (3.1) — a ideia-guia, esforço pequeno, ganho imediato de UX.
2. **Filtro "Pessoas"** (1.1) — fecha o maior adiamento da v1.0 em ~1 dia.
3. **PWA Share Target + manifest shortcuts** (3.4) — pequeno e transforma o uso no celular.
4. **Rodada de quick wins de robustez** (1.2): blur flush → CSP na API → heartbeat WS →
   handshake WS → e2e de login. Uma semana, zera meia seção.
5. **Markdown fase B** (3.1) — export/import `.md`.
6. **Somente-leitura no compartilhamento** (3.3) — cai redondo no `assertNoteAccess`.
7. **Sub-labels/pastas** (3.2) — o pedido nº 1 dos fóruns.
8. **Vincular notas + backlinks** (3.1).
9. **Link público somente leitura** (3.3).
10. **Admin mínimo + retenção da lixeira + backup agendado** (3.5) — pacote self-host.

Depois disso, reavaliar: mixed text+checklist (G), OCR/transcrição, SSO OIDC (decisão de
DECISIONS antes), virtualização do grid.

---

## 6. Como manter este doc

- Concluiu → `[x]` com data. Item de paridade → refletir no PARITY.md; divergência nova → linha
  🔀 no PARITY.md e, se houver decisão técnica relevante, entrada no DECISIONS.md.
- Item novo → entra na seção certa com **O quê/Como**, impacto e esforço.
- Mudou de ideia → move para a seção 4 com o porquê (nada some do doc).
- Commits pequenos por item (`feat:`/`fix:` — semantic-release cuida da versão); rodar
  `pnpm check && pnpm test` (e e2e quando web mudar) antes de marcar como feito.

## Fontes da pesquisa (2026-07)

- Android Police — [6 basic features Keep is missing](https://www.androidpolice.com/google-keep-missing-features-annoy-me/)
  (headers colapsáveis/checkbox misto, formatação web, imagem no meio do texto, matemática,
  proteger nota, compartilhar por link/PDF)
- Tom's Guide — [busca dentro da nota após 13 anos](https://www.tomsguide.com/computing/mobile-apps/google-keep-is-finally-adding-a-feature-thats-been-missing-for-13-years)
- XDA — [fui para Notion/Obsidian/Evernote e voltei ao Keep](https://www.xda-developers.com/i-used-notion-obsidian-and-evernote-only-to-go-back-to-google-keep/)
- Medium (Kurtis Redux) — [do Keep ao Obsidian: arquitetura de informação](https://kurtis-redux.medium.com/from-google-keep-to-obsidian-its-not-complex-features-that-end-the-chaos-it-s-simple-6c093ea21d2d)
- Android Police — [troquei o Keep pelo Obsidian](https://www.androidpolice.com/moved-notes-to-obsidian-didnt-regret-leaving-google-keep/)
- CrossCardsNotes — [por que usuários sofrem com Keep/OneNote/Obsidian/Notion](https://crosscardsnotes.com/why-users-struggle-with-google-keep-onenote-obsidian-and-notion-and-how-crosscardsnotes-solves-it/)
- Edivaldo Brito (BR) — [as melhorias do Keep não bastam](https://www.edivaldobrito.com.br/as-melhorias-do-google-keep-nao-sao-suficientes-para-mudar-minha-opiniao-sobre-o-app/) (pastas, formatação, organização)
- Jornal em Destaque (BR) — [recursos do Apple Notes que dão inveja](https://www.jornalemdestaque.com/tecnologia/eu-uso-o-google-keep-todos-os-dias-mas-esses-recursos-do-apple-notes-ainda-me-deixam-com-ciumes/580398/)
- GitHub — [keep-it-markdown](https://github.com/djsudduth/keep-it-markdown) e
  [remarkable-googlekeep](https://github.com/sasindumendis/remarkable-googlekeep) (demanda por
  markdown no Keep), thread oficial [Support markdown for Google Keep](https://support.google.com/docs/thread/4828335?hl=en)
- Joplin — [E2EE e sync self-hosted](https://joplinapp.org/) (referência do trade-off E2EE × busca)
