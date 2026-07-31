# Roadmap — o que falta construir

> Backlog vivo do OpenKeep. A ideia: **atacar um item por vez** e marcar `[x]` quando concluir
> (com a data, ex.: `[x] ... — feito em 2026-08-02`). Escrito em pt-BR por ser documento de
> trabalho; os demais docs do repo permanecem em inglês.
>
> Última atualização: **2026-07-31** (ordenação alternativa das notas; imprimir / salvar como PDF;
> antes: busca dentro da nota com
> Ctrl+F; ações em massa — lembrete, marcadores e colaborador na barra de seleção; markdown fases
> A, B e C — o vocabulário da nota agora é o do markdown, com
> import/export `.md`; PWA share target, filtro "Pessoas" na busca, auth do WS no handshake, aviso
> de sharees no import, e2e de login/signup, CSP da API, heartbeat de WS, flush em blur, retenção da
> lixeira, atalhos do manifest, contador de palavras)

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

Os adiamentos conscientes listados em PARITY.md ("Known deferrals"), agora com plano de ataque.
Eram 16 na v1.0; os concluídos saem de lá e ficam marcados `[x]` aqui.

### 1.1 Funcionalidade visível

- [x] **Filtro "Pessoas" na busca** *(impacto alto · esforço P)* — feito em 2026-07-30
  **O quê:** tile "People" nos filtros da busca (avatares dos colaboradores) + filtro combinável.
  **Como:** o corpus do cliente já carrega colaboradores → seletor client-side é imediato; no
  servidor, um parâmetro `collaborator` em `/api/search` vira um `EXISTS` sobre `note_members`.
  **Entregue:** `selectPeople` monta os tiles a partir do próprio corpus (dedup, sem mim, sem
  lixeira) e `?collaborator=<userId>` combina com texto/tipo/label/cor. No servidor o `EXISTS` é
  um self-join de `note_members` (a linha de fora é a minha, a de dentro é a dele), exposto
  também no `search_notes` do MCP. O chip cai no id cru se a pessoa sair da última nota
  compartilhada enquanto o filtro está ligado.

- [x] **Ações em massa "Lembrete" e "Alterar marcadores"** *(impacto médio · esforço M)* — feito em 2026-07-30
  **O quê:** na barra de seleção múltipla, o botão Remind e o menu "Change labels" operando sobre
  N notas (os fluxos por nota já existem).
  **Como:** reaproveitar os popovers existentes; no estado de labels, exibir checkbox
  indeterminado quando parte da seleção tem o label (comportamento do Keep). Mutações em lote =
  N PATCHes otimistas (padrão já usado no bulk pin/color/archive).
  **Entregue:** os três componentes já eram controlados (`ReminderPicker`, `LabelPicker`,
  `ShareDialog`), então o lote é wiring: `BulkReminderPicker` e `BulkLabelPicker` ao lado dos
  `Note*` existentes, e nenhuma mudança de API. O tri-estado sai de `selectBulkLabels` (todas ×
  algumas), e o `indeterminate` só existe no DOM — não há atributo — então é aplicado por ref a
  cada render, sobre a caixa não-controlada que já existia. Clicar numa caixa mista cai em
  `checked=true` pelo próprio browser, que é o comportamento do Keep ("aplicar a todas"), e o
  toggle só dispara PATCH nas notas que de fato mudam. O lembrete em lote recebe *um* lembrete da
  seleção só para poder oferecer "Excluir lembrete" — aplicar sobrescreve todas, excluir limpa
  todas as que tinham. **Mobile:** seis alvos de 48px não cabem em 360px (a barra media 397px), então
  o ícone de lembrete é `max-md:hidden` e vira item do menu "Mais" abaixo de `md` — o e2e mede a
  barra e falha se ela voltar a estourar.

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

- [x] **Flush do autosave em blur de campo** *(impacto médio · esforço P)* — feito em 2026-07-30
  Hoje o flush cobre debounce/close/Esc/`visibilitychange`/pagehide/unmount; falta disparar no
  blur simples de título/corpo. Adicionar handler de blur que força o flush do campo sujo.
  **Entregue:** `onBlur` no textarea de título e no `useEditor` do corpo, ambos chamando
  `autosave.flush()`. O guard anti-stomp não regride: o PATCH disparado pelo flush fica in-flight
  e in-flight próprio já é excluído do merge remoto.

- [x] **Versões guardam markdown, não texto puro** *(impacto médio · esforço P)* — feito em 2026-07-30
  Não estava no roadmap: apareceu ao fazer a fase B. O snapshot guardava `bodyText`, então
  restaurar uma nota formatada devolvia parágrafos lisos — o histórico destruía calado justamente a
  formatação que deveria proteger. Agora o snapshot guarda markdown (mesmo serializer do export), o
  restore reconstrói o html e o download da versão virou `.md`. Linhas antigas continuam válidas:
  texto puro é markdown válido.

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

- [x] **Heartbeat de WebSocket no cliente** *(impacto baixo · esforço P)* — feito em 2026-07-30
  O servidor pinga a cada 30s; o cliente confia em reconexão por visibilidade/online. Adicionar
  timer client-side que fecha e reconecta se nenhuma mensagem/pong chegar em N segundos.
  **Entregue:** heartbeat de camada de aplicação (`WS_PING`/`WS_PONG` no shared) porque o browser
  nunca expõe frames pong ao JS — o cliente sonda a cada 25s e fecha o socket após 60s de silêncio,
  caindo no backoff normal. O handler de `visibilitychange` também derruba socket obsoleto (caso
  do notebook acordando, em que os timers ficaram congelados).

- [ ] **Roving tabindex no grid** *(impacto baixo · esforço P/M)*
  Todos os cards são tab stops (`tabIndex=0`). Implementar roving: um tab stop por grid, setas/j/k
  movem o foco ativo — melhora Tab-navigation com centenas de notas.

- [x] **Auth do WS durante o handshake** *(impacto baixo · esforço P/M)* — feito em 2026-07-30
  Hoje o cookie de sessão é checado logo após o upgrade (fecha 4401 antes de registrar). Mover a
  verificação para antes de aceitar o upgrade (hook de `upgrade`/`preValidation` da rota WS).
  **Entregue:** `preValidation` na rota checa Origin + sessão e lança os erros normais
  (`errors.forbidden`/`errors.unauthorized`) — o `@fastify/websocket` só faz o upgrade dentro do
  handler, então responder de um hook deixa a requisição como HTTP comum e o cliente rejeitado
  recebe 403/401 em vez de um socket que abre e fecha. Sem PAT aqui de propósito (browser não
  manda `Authorization` em WebSocket). O cliente não olha código de fechamento: cai no mesmo
  backoff de sempre.

- [x] **CSP nas respostas JSON da API** *(impacto baixo · esforço P)* — feito em 2026-07-30
  A CSP estrita cobre SPA/estáticos; a API responde só com `nosniff` + checagens same-origin.
  Adicionar cabeçalho CSP mínimo (`default-src 'none'`) nas respostas JSON.
  **Entregue:** `API_CSP` (`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`) num hook
  `onSend` que decide pelo content-type (`application/json` e `application/problem+json`), então
  Swagger UI, SPA e downloads de anexo mantêm os cabeçalhos deles.

- [ ] **Endpoint `/metrics` (+ Sentry opcional)** *(impacto baixo · esforço P/M)*
  `METRICS_ENABLED` já é validado na config mas a rota não existe. Expor Prometheus
  (contadores HTTP, jobs pg-boss, sockets ativos) atrás de auth/bind interno; avaliar Sentry
  como opt-in por env.

- [x] **Aviso de `sharees` no import do Takeout** *(impacto baixo · esforço P)* — feito em 2026-07-30
  Notas importadas nunca são recompartilhadas e nada avisa. Ao final do job, listar no relatório
  de import as notas que tinham colaboradores no Takeout ("N notas eram compartilhadas — o
  compartilhamento não é importado").
  **Entregue:** o parser marca `wasShared` ignorando a entrada do próprio dono (o Takeout lista o
  dono entre os `sharees`), o job soma no `summary` (`{imported, skipped, shared}`) e o diálogo
  mostra uma segunda linha com plural nos dois idiomas. A contagem cobre as notas puladas por
  duplicidade também — o aviso é sobre o zip, não sobre o que entrou.

- [x] **E2E de login/signup pela UI** *(impacto baixo · esforço P)* — feito em 2026-07-30
  Os specs autenticam via API. Adicionar spec Playwright cobrindo cadastro, login, erro de senha
  e logout pela interface.
  **Entregue:** `e2e/tests/auth.spec.ts` com dois fluxos (cadastro → logout → guard → senha errada
  → login; e-mail duplicado + senha curta). O spec já pagou por si: o Better Auth devolve
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` no cadastro, então o e-mail duplicado caía na mensagem
  genérica — agora os dois códigos são aceitos. `X-Forwarded-For` por execução mantém o rate limit
  de 10/min/IP fora do caminho em reexecuções.

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

- [x] **⭐ Markdown — Fase A: digitação e colagem** *(impacto alto · esforço P/M)* — feito em 2026-07-30
  **O quê:** a nota "entende" markdown ao digitar: `# `/`## ` viram H1/H2, `**x**` negrito,
  `*x*` itálico, e colar texto markdown converte para rich text. É a ideia-guia deste roadmap.
  **Como:** TipTap 3 — as extensões já usadas trazem *input rules* (verificar se estão ativas na
  config atual e habilitar); colagem via serializer markdown→ProseMirror (ex.:
  `prosemirror-markdown` restrito ao vocabulário atual H1/H2/B/I/U). Nada muda no servidor:
  o HTML resultante já pertence ao allowlist do sanitizador.
  **Entregue:** as *input rules* do StarterKit já existiam mas o heading estava **morto** — os dois
  editores engoliam a tecla `#` para abrir o quick-label do Keep, então `# ` nunca chegava ao
  ProseMirror. A regra nova: `#` só é interceptado quando o bloco tem algo além dos próprios
  hashes; no início de um bloco ele digita normalmente (permitindo `#`/`##`/`###…`) e uma input
  rule `#x` devolve o gesto ao label assim que o caractere seguinte prova que não era heading —
  já com o seed no filtro do picker. A colagem é um conversor próprio
  (`lib/markdown.ts`), não `prosemirror-markdown`: o vocabulário é o do Keep, então um parser
  completo só produziria nós que o sanitizador descartaria — pior que colar como texto. Ele
  devolve `null` quando não há markdown e o caminho normal do editor assume. As *paste rules* do
  StarterKit foram desligadas (`enablePasteRules: false`) porque são mais frouxas que as guardas
  daqui e italicizavam `2 * 3 * 4`.
  *(Na fase B esse conversor saiu de `apps/web/src/lib/markdown.ts` para `@openkeep/shared` — virou
  o mesmo motor usado por colagem, import, export, versões e MCP.)*

- [x] **⭐ Markdown — Fase B: importar e exportar `.md`** *(impacto alto · esforço M)* — feito em 2026-07-30
  **O quê:** exportar nota como `.md` (menu da nota + em massa no export zip) e importar arquivos
  `.md` criando notas (título = H1 ou nome do arquivo; `- [ ]`/`- [x]` viram itens de checklist).
  **Como:** serializer ProseMirror→markdown no servidor (vale para o export JSON existente e
  para o MCP); import como job leve reaproveitando o pipeline do Takeout. Abre interoperabilidade
  com Obsidian/Joplin — a razão nº 1 de migração citada nos fóruns.
  **Entregue:** o serializer não é ProseMirror→markdown e sim html→markdown (`markdown-serialize.ts`
  no shared), porque o html sanitizado é o formato que todo mundo já tem em mãos — servidor, MCP e
  navegador — e o ProseMirror só existe no navegador. "Baixar como .md" sai do menu da nota e do
  card sem passar pelo servidor (mesmo serializer dos dois lados; funciona offline), e o zip de
  backup ganhou uma pasta `markdown/` com uma cópia de cada nota — essas com front matter YAML
  (labels, cor, fixada, datas), que o import lê de volta: exportar e importar é ida e volta, não
  perda. Na entrada há dois caminhos: `.md` avulsos vão por `POST /api/import/markdown` e importam
  na hora (é parse + insert, o job só adicionaria latência), e um cofre inteiro entra como zip pela
  rota do Takeout, que agora indexa entradas `.md` além dos JSON (pastas de ferramenta como
  `.obsidian/` ficam de fora). Fingerprint = nome + bytes, então reimportar um cofre intacto não
  duplica nada. Arquivo só de `- [ ]` vira nota de lista; arquivo misto vira texto com as caixas
  literais — o modelo tem uma checklist por nota e não sabe intercalar (ver "Texto e checklist na
  mesma nota").

- [x] **⭐ Markdown — Fase C: sintaxe estendida** *(impacto médio · esforço M/G)* — feito em 2026-07-30
  **O quê:** tachado (`~~x~~`), código inline e bloco de código, citação (`> `), régua (`---`),
  link nomeado (`[texto](url)`). Divergência do set May-2025 do Keep — marcar 🔀.
  **Como:** adicionar as extensões TipTap correspondentes + **ampliar o allowlist do sanitizador
  no servidor** (hoje casado com o set do Keep) + renderização no card. FTS não muda (indexa
  texto). Decidir tema de bloco de código (sem highlight na v1 é ok).
  **Entregue:** o vocabulário virou `NOTE_HTML_TAGS` no shared — h1–h6 (não só três: markdown tem
  seis e clampar perdia hierarquia no import), `s`, `code`, `pre`, `blockquote`, `ul`/`ol`/`li`,
  `hr`, `a` — e o sanitizador do servidor passou a ser gerado dele. Continua sem nenhum atributo de
  estilo: sobram `a[href]` (esquema limitado a http/https/mailto, `target=_blank` +
  `rel="noopener noreferrer nofollow"`; href reprovado derruba a tag e mantém o texto),
  `ol[start]` e a classe `language-*` do `code`. Sem highlight, como combinado.
  **O bug que apareceu no caminho:** as *input rules* do StarterKit não são só frouxas, elas não
  disparavam depois de um `<br>` — a fase A entregou markdown que funcionava só na primeira linha
  de cada parágrafo. O texto que o TipTap casa escreve quebra dura como `%leaf%`, e o anchor
  `(?:^|\s)` não vê isso; pior, consumir `%leaf%` no match desalinha a verificação de offset do
  TipTap (6 caracteres para um nó de 1 posição), então o anchor virou lookbehind. As regras de marca
  agora são nossas (as do StarterKit ficam desligadas por `enableInputRules`, que é uma whitelist —
  regra que casa primeiro vence, então adicionar regra melhor ao lado não adiantaria) e guardam os
  dois lados do delimitador, igual ao parser de colagem: `2 * 3 * 4` não vira itálico digitado nem
  colado. ```` ``` ```` abre bloco de código no terceiro crase, sem esperar linguagem — nota não é
  editor de código. Barra de formatação ganhou H3, tachado, listas, citação, código, bloco, link
  (com campo de url) e régua, e virou rolável na horizontal por causa do mobile.

- [x] **Busca dentro da nota (Ctrl+F)** *(impacto alto · esforço P/M)* — feito em 2026-07-30
  **O quê:** localizar/realçar termos dentro de uma nota aberta — ausência famosa do Keep por
  13 anos ([Tom's Guide](https://www.tomsguide.com/computing/mobile-apps/google-keep-is-finally-adding-a-feature-thats-been-missing-for-13-years)).
  **Como:** no editor, decoration do ProseMirror destacando matches + contador/navegação
  (interceptar Ctrl+F quando o editor está aberto; Esc devolve o atalho ao navegador).
  **Entregue:** barra fixa no topo do editor (Ctrl+F, item "Localizar na nota" no menu ⋮ e na
  sheet "Mais" do mobile), contador `1/3`, Enter/Shift+Enter e setas percorrendo com wrap nos dois
  sentidos. A busca cobre **a nota inteira em ordem de leitura** — título, depois corpo (ou itens,
  quando é lista) —, é insensível a maiúsculas e a acentos e leva o match atual à vista.
  **O trade-off do realce:** só o corpo é rich text; título e itens de lista são `textarea`
  nativos, onde não existe marcação por trecho — o navegador não pinta seleção de campo sem foco,
  e roubar o foco quebraria o Enter da barra. Então o corpo marca as palavras (decorations) e os
  campos nativos são realçados **inteiros** (banho + anel no atual). Contagem é por ocorrência nos
  dois casos, para o número não mentir. Detalhes que apareceram no caminho: (a) o *folding* de
  acentos precisa **preservar o comprimento** — `normalizeForSearch` (NFD) não serve aqui porque
  cada offset vira posição de documento, então "ß" e marcas combinantes soltas ficam como estão em
  vez de deslocar a régua; (b) o Esc da barra tem de parar a propagação, senão fecha a nota junto;
  (c) o plugin é dono da lista de matches (a barra pergunta quantos foram) para que o doc contado e
  o decorado sejam sempre o mesmo, e a transação de busca sai do histórico e do evento `update` —
  o autosave não pode enxergar uma busca como edição; (d) um hit dentro da seção "Itens concluídos"
  recolhida força a seção a abrir; (e) o realce dos campos é `box-shadow` inset, porque `background`
  e `outline` já pertencem a utilitários Tailwind nos mesmos elementos.

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
  export. A dependência ("depois do markdown C") caiu — falta o `|---|` no parser/serializer do
  shared, `table/tr/td` no allowlist e uma UI mínima de linha/coluna. Avaliar se a demanda aparece:
  é a única parte grande do markdown que ficou de fora, junto de listas de tarefas no corpo (essas
  esbarram no modelo de uma checklist por nota, ver o item abaixo).

- [x] **Contador de palavras/caracteres** *(impacto baixo · esforço P)* — feito em 2026-07-30
  No rodapé do editor (junto do "Edited…"), contagem de palavras/caracteres do corpo — os limites
  (19.999) hoje são invisíveis até estourar.
  **Entregue:** rodapé do desktop e sheet "Mais" do mobile. A contagem sai do mesmo
  `htmlToPlainText` que o servidor usa, então o número bate com o limite realmente aplicado; a
  partir de 90% do teto a metade de caracteres vira "usado / 19.999" em vermelho. Nota do tipo
  lista conta os itens.

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

- [x] **Ordenação alternativa das notas** *(impacto médio · esforço P/M)* — feito em 2026-07-31
  O Keep só tem ordem manual. Adicionar seletor por visão: manual (padrão) · data de edição ·
  data de criação · título. Client-side sobre o corpus; persistir em settings. Não mexe nas
  posições fracionais (a manual continua a fonte de verdade).
  **Entregue:** botão "Ordenar notas" na barra superior (desktop e pilha do mobile), com menu de
  rádio e a preferência em `settings.noteSort` — uma só, global, como o `viewMode`, e não uma por
  visão: são quatro colunas para um seletor que ninguém troca por tela. O botão só aparece onde a
  ordem se aplica (Notas, Arquivo, marcador, busca); Lixeira e Lembretes têm ordem própria e ficam
  de fora. Todo o trabalho é um comparador em `note-selectors.ts` — o `byPosition` já era o único
  ponto de ordenação —, então nenhuma rota do servidor mudou.
  **O detalhe que decide o desenho:** ordenação alternativa e arrastar não podem coexistir. Soltar
  um card fora da ordem manual gravaria uma posição que a tela nem está mostrando; então fora de
  `manual` o `dndSection` some da grade da home e o arrasto simplesmente não existe — nenhuma
  ordenação escreve posição, e voltar para manual devolve o arranjo intacto (o e2e afirma isso
  comparando a ordem inicial com a de volta). Outros detalhes: (a) o comparador desempata sempre
  pela posição fracionária, então notas com o mesmo minuto de edição não trocam de lugar a cada
  render; (b) título usa `localeCompare` com `sensitivity: 'base'` e `numeric`, e nota sem título
  cai no fim — string vazia no topo seria um bloco de cards mudos; (c) datas são ISO em UTC, que
  comparam lexicograficamente (mesmo truque da lixeira); (d) o `select` do React Query passou a ser
  memoizado por `noteSort` nas quatro rotas, senão o corpus era reordenado a cada render.

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

- [x] **Compartilhar várias notas de uma vez** *(impacto baixo · esforço P)* — feito em 2026-07-30
  Na barra de seleção, "Colaborador" aplica o convite às N notas (a Android Police também cita).
  Depende só de reaproveitar o diálogo existente em lote.
  **Entregue:** o mesmo `ShareDialog`, com a lista de colaboradores vazia (em lote não há uma lista
  única para remover ninguém — remoção continua sendo por nota) e uma linha nova de subtítulo
  dizendo em quantas notas o convite vai cair. Só notas minhas entram: a seleção é filtrada por
  `role === 'owner'` e o item do menu some quando não sobra nenhuma. Convidar dispara N POSTs,
  fecha o diálogo e limpa a seleção; falhas continuam aparecendo no snackbar de erro do próprio
  `invite` (uma por nota que recusar, ex.: já colaborador).

- [ ] **Proteger nota com PIN/senha (ocultar)** *(impacto médio · esforço M)*
  **O quê:** nota "trancada": conteúdo borrado/oculto (inclusive na busca) até confirmar senha
  da conta ou PIN. Top-6 da Android Police.
  **Como:** flag por membership + re-auth pontual (Better Auth já expõe verificação de senha);
  excluir corpo do corpus client-side enquanto trancada (título genérico "Nota protegida").
  **Não é criptografia** — deixar explícito na UI (o servidor continua lendo o conteúdo).

- [x] **Exportar como PDF / imprimir bem** *(impacto médio · esforço P/M)* — feito em 2026-07-31
  Menu da nota → "Imprimir/PDF": stylesheet de impressão dedicada (nota limpa, sem chrome) +
  `window.print()`. Resolve "exportar como PDF ou imagem" sem dependência server-side.
  **Entregue:** "Imprimir" no menu ⋮ da nota, na sheet "Mais" do mobile e no menu do card. A página
  que vai para a impressora **não é o app**: `lib/print-note.ts` monta um `<article>` próprio
  (título, imagens, corpo *ou* checklist, rodapé com marcadores e "Editado …"), pendura em `<body>`
  e o `@media print` esconde todo o resto. Imprimir o editor aberto não serviria — título e itens de
  lista são `textarea` nativos, que saem cortados na altura de rolagem, e o modal levaria a moldura
  inteira do app junto. Tudo no navegador, como o "Baixar como .md": funciona offline e imprime o
  que a nota diz **agora**, inclusive a edição que o autosave ainda deve (o menu dá flush antes).
  Detalhes que apareceram no caminho: (a) as cores de papel saem de tokens repontados no
  `#print-root` (`--on-surface` etc.), não de `!important` sobre cada regra — assim o `.note-body`,
  que já estiliza o vocabulário markdown, imprime igual nos dois temas; (b) `document.title` vira o
  título da nota durante a impressão, porque é dele que o navegador tira o nome do PDF; (c) a
  limpeza fica no `afterprint`, não no retorno de `window.print()` (só o Chrome bloqueia lá) — e
  imprimir duas vezes seguidas desfaz a folha anterior *inteira*, senão o listener velho devolveria
  como título do app o título da primeira nota; (d) as imagens são aguardadas antes do diálogo (com
  teto de 3s), já que a folha está `display:none` até a mídia de impressão valer; (e) áudio não vai
  para o papel. A regra que esconde o app precisa de `!important`: diálogos e popovers se posicionam
  por style inline.

### 3.4 Captura e integrações

- [x] **PWA Share Target (compartilhar → OpenKeep)** *(impacto alto · esforço P)* — feito em 2026-07-30
  **O quê:** no Android/desktop, o OpenKeep instalado aparece na folha de compartilhar do
  sistema; compartilhar texto/URL/imagem cria nota. Mata a maior vantagem prática do app nativo.
  **Como:** `share_target` no manifest (method POST + enctype multipart p/ arquivos) → rota
  `/share` que abre o composer pré-preenchido (o fluxo de imagem do FAB já cobre o resto).
  **Entregue:** `share_target` POST/multipart → o service worker drena o corpo para a Cache API
  (`share-target-v1`) e responde 303 para um `GET /share` que o router entende; a rota
  `_shell/share.tsx` consome o payload (one-shot: recarregar não cria segunda nota) e cai no
  mesmo `useCreateAndOpenNote` do FAB e dos atalhos. Cache em vez de IndexedDB/postMessage porque
  os dois lados já falam Cache e ela guarda `Blob` nativamente. Abre o editor em vez do composer
  — é o mesmo caminho dos outros entry points e o que existe no mobile, o cenário do share sheet.
  Ficar sob `_shell` faz um share recebido deslogado passar pelo login e voltar, com o payload
  esperando. Dois bugs reais caíram junto: o upload de anexo disparava antes do POST da nota
  existir (agora espera o create, o que também enfileira o arquivo atrás dele quando offline) e o
  editor se fechava sozinho quando o corpus recarregava antes de o create acertar.

- [ ] **Extensão de captura no navegador (clipper)** *(impacto médio · esforço M)*
  **O quê:** o Keep tem extensão Chrome; self-host não tem nada. Selecionou texto → salvar como
  nota com a URL de origem.
  **Como:** MV3 mínima falando com a API REST via personal access token (`okp_…`, já existem) —
  zero mudança no servidor. Publicar na Web Store como projeto irmão (fora do monorepo? decidir).

- [x] **Atalhos de app (manifest shortcuts)** *(impacto baixo · esforço P)* — feito em 2026-07-30
  Long-press no ícone instalado → "Nova nota", "Nova lista", "Novo desenho" (o FAB já sabe criar
  os três; é só rota com query param + `shortcuts` no manifest).
  **Entregue:** `shortcuts` no manifest apontando para `/?compose=text`, `/?compose=list` e
  `/?drawing=new` (esse último já funcionava). A criação do FAB virou o hook `useCreateAndOpenNote`,
  reusado pelo handler de `?compose=`, então os dois caminhos produzem a mesma nota. Sem ícones
  próprios por atalho — o sistema cai no ícone do app.

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

- [x] **Retenção da lixeira configurável** *(impacto baixo · esforço P)* — feito em 2026-07-30
  7 dias fixo (paridade). Env `TRASH_RETENTION_DAYS` lido pelo job de purge horário + banner
  dinâmico ("As notas na lixeira são excluídas após N dias") — string i18n nos dois idiomas.
  **Entregue:** env validado (inteiro ≥ 1), `purgeExpiredTrash` recebe a janela, e o valor sai em
  `/api/meta` (`zInstanceMeta`) para o banner plural (`banner_one`/`banner_other`) nos dois
  idiomas. Documentado em DEPLOYMENT.md e `.env.example`.

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

1. **Somente-leitura no compartilhamento** (3.3) — cai redondo no `assertNoteAccess`.
2. **Sub-labels/pastas** (3.2) — o pedido nº 1 dos fóruns.
3. **Vincular notas + backlinks** (3.1) — o `[[` reaproveita o popover do `#`, e o link já é
   marca TipTap suportada de ponta a ponta desde a fase C.
4. **Link público somente leitura** (3.3).
5. **Admin mínimo + backup agendado** (3.5) — pacote self-host (a retenção da lixeira já saiu).
6. **Resto dos quick wins de 1.2**: roving tabindex, `/metrics`. O que sobrou da rodada.
7. **Tabelas simples** (3.1) — agora destravado: era "só depois do markdown C", e o parser/serializer
   compartilhado é onde a sintaxe `|---|` entraria.

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
