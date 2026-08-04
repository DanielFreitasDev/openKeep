# Roadmap — o que falta construir

> Backlog vivo do OpenKeep. A ideia: **atacar um item por vez** e marcar `[x]` quando concluir
> (com a data, ex.: `[x] ... — feito em 2026-08-02`). Escrito em pt-BR por ser documento de
> trabalho; os demais docs do repo permanecem em inglês.
>
> Última atualização: **2026-08-03** (undo/redo de sessão para título e itens de lista;
> antes: proteger nota com PIN/senha;
> webhooks de saída;
> cotas de armazenamento por conta;
> painel de administração da instância;
> modelos de nota;
> anexar qualquer arquivo — PDF, documentos, zip;
> compartilhar por link público somente leitura;
> vincular notas com `[[` e backlinks;
> gravação de áudio no navegador;
> permissão somente-leitura no compartilhamento;
> backup automático agendado; indentar item de checklist arrastando; buscas salvas; operadores de busca; apagar todas as notas da conta; feed iCalendar dos lembretes; cor/emoji e ordem manual nos marcadores; mesclar notas; roving tabindex + setas no grid, `/metrics`; ordenação
> alternativa das notas; imprimir / salvar como PDF;
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

- [x] **Atalhos de item de lista `n`/`p`/`Shift+N`/`Shift+P`** *(impacto baixo · esforço M/G)* — feito em 2026-08-03
  **O quê:** navegar/mover o "item selecionado" do checklist pelo teclado, como no Keep.
  **Como:** exige um estado de foco de item que não digita (hoje cada item é um `textarea`
  nativo). Criar um "modo seleção de item" no editor de checklist; devolver os atalhos ao
  diálogo `?` (foram removidos de lá para não anunciar atalho morto).
  **Entregue:** a seleção é um **foco de verdade** — a caixa da linha, e não o `textarea` dentro
  dela, é que fica com o foco do DOM. É o que faz `n` continuar sendo a letra n enquanto se
  digita (o motor já entrega qualquer tecla que produza texto ao campo, `lib/keyboard.ts`) e
  virar atalho assim que a linha assume; de quebra, focar a linha é o que rola a lista até ela.
  Os quatro atalhos entram pelo **escopo `editor` que já existia** no `EditorModal`, através do
  handle do checklist: um segundo `useKeyScope('editor', …)` seria um escopo modal a mais na
  pilha e calaria o `Ctrl+F` do próprio editor.
  **A porta de entrada é o Escape**, como no editor de desenho: o editor abre com um campo focado,
  então sem ela os atalhos só seriam alcançáveis dando Tab até sair do texto. Escape dentro de um
  item sai do campo *para o item*; o Escape seguinte, já na linha, fecha a nota como sempre.
  Enter devolve o cursor ao campo, no fim do texto.
  **Mover é o mesmo gesto do arrasto, só que discreto:** anda uma casa **dentro do próprio grupo
  de exibição** (o divisor "Itens concluídos" é parede) e reaplica o mesmo grampo do arrasto — a
  linha que sobe para o topo perde o recuo, porque o primeiro item nunca é recuado. Um passo de
  undo por movimento, e um `PATCH` só (`position` + `indent`).

- [x] **Indentar item de checklist arrastando para a direita** *(impacto baixo · esforço P/M)* — feito em 2026-07-31
  **O quê:** além de `Tab`/`Ctrl+]`, arrastar o item ~24px à direita indenta (paridade Keep).
  **Como:** no drag handler (pragmatic-drag-and-drop), usar o deslocamento X do ponteiro para
  decidir indent vs reorder; primeiro item continua não indentável.
  **Entregue:** o mesmo gesto passa a ter duas metades — a vertical continua decidindo a posição
  fracionária, a horizontal decide o nível —, e as duas viajam num PATCH só (`indent` e `position`
  já eram campos do mesmo corpo, então nenhuma rota mudou). Soltar sem sair da própria linha, que
  antes era um no-op, agora é justamente o gesto de indentar.
  **A origem do gesto é a alça, não o ponteiro:** `dragstart` só dispara alguns pixels depois do
  clique (e, em automação, já no destino), enquanto a caixa da alça está exatamente onde a linha
  ainda está — então `getInitialData` guarda o centro dela e o deslocamento é medido a partir dali.
  O nível é julgado contra **onde a linha cai**, não de onde saiu: arrastada para a direita e para o
  topo da lista ela é a primeira linha, e a primeira nunca indenta — o mesmo `canIndent` também
  desfaz o caso antigo em que um simples reordenar levava uma linha indentada para o topo.
  Como 24px é um limiar invisível, a linha se desloca sob o ponteiro durante o arrasto (só a
  fantasma na lista; a prévia nativa é uma foto do início).
  **No e2e:** `dragTo` do Playwright, não mouse cru — só ele inicia o DnD nativo do Chromium —, e o
  alvo de soltura é escolhido por quem está por cima no ponto (desindentar termina à esquerda da
  coluna do editor, sobre o scrim). O teste também precisou esperar o **morph** do editor assentar:
  medir a caixa do diálogo no meio da animação dava larguras diferentes a cada execução.

- [x] **Extras do editor de desenho** *(impacto médio · esforço G)* — feito em 2026-08-03
  **O quê:** ferramenta de laço (mover seleção de traços), zoom/pan do canvas, desenhar sobre
  fotos e canvas auto-extensível (hoje o tamanho é fixo na criação).
  **Como:** os traços já são vetores (`drawing_data` jsonb, DECISIONS #24), então laço/zoom são
  transformações client-side; desenhar sobre foto = novo `kind` ligando a um attachment de
  imagem como fundo. Fatiar em 4 entregas independentes, nessa ordem: zoom/pan → laço →
  auto-extend → sobre fotos.
  **Entregue:** nas quatro entregas planejadas, uma por commit. A aritmética da vista virou
  módulo próprio (`lib/drawing-view.ts`), testado à parte: o piso do zoom é a escala que mostra
  a página inteira (sair além disso só acrescenta margem) e o pan é grampeado para o papel nunca
  ficar meio fora da tela. A vista só se re-ajusta sozinha até a pessoa assumir o controle.
  **O laço leva o traço inteiro ou nada:** um vizinho meio cruzado fica onde está, então um
  círculo folgado em volta de uma palavra não arrasta a de trás junto. Mover é um passo de undo
  só, e qualquer undo/redo **solta** a seleção — o histórico remexe exatamente nos traços que ela
  aponta. Escape agora solta a seleção antes de fechar o editor.
  **O auto-extend precisou de um loop de frames:** um ponteiro parado na borda inferior não manda
  evento nenhum, então quem alimenta a linha e rola o papel é um `requestAnimationFrame`. Crescer
  derruba o "fitted" de propósito: re-ajustar uma página que acabou de ficar mais alta encolheria
  a tinta no meio da linha, que é justamente o solavanco que se quer evitar.
  **A foto de fundo é referência, não bytes:** `drawing_data` ganhou `photoAttachmentId` (campo
  opcional, sem `version: 2` — linha antiga continua válida), o DTO de attachment o expõe para o
  cliente não ter que buscar os vetores de todo desenho, e a foto some da pilha da nota (uma
  função só, `selectImageStack`, usada pelo card, pelo editor, pelo print e pela página pública).
  Ela continua anexada porque é o que mantém o desenho editável — e volta se o desenho for
  apagado. Composto sobre foto sai em **JPEG**: a mesma imagem em PNG custaria megabytes da cota
  de alguém. Copiar a nota remapeia o id para a foto da cópia, senão apagar a original levaria o
  fundo da cópia junto.

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

- [x] **Undo/redo de sessão para título e itens de lista** *(impacto médio · esforço M)* — feito em 2026-08-03
  O histórico do TipTap cobre só o corpo. Construir o ring buffer de snapshots
  (título + itens) por sessão de edição, integrado aos mesmos atalhos Ctrl+Z/Y do editor.
  **Entregue:** ring de 100 snapshots inteiros (`lib/field-history.ts` + `use-field-history.ts`),
  não de operações inversas — o vocabulário dos itens já tem oito verbos, e inverter cada um é
  oito chances de errar sutilmente. **As linhas são endereçadas pela chave local, nunca pelo id do
  servidor:** desfazer uma exclusão *cria* a linha de novo, e os passos seguintes precisam
  continuar apontando para ela. O passo é gravado por um effect sobre as linhas já commitadas, e
  não dentro da op — é isso que faz o Enter (que muda um texto e adiciona uma linha) ser um passo
  só e deixa de fora todo `setRows` que ninguém pediu (merge de colaborador, id chegando do
  servidor, o próprio restore). E undo/redo empilham a nota **como ela está na tela**, não o
  snapshot do último passo, para que a edição de um colaborador que caiu no meio não seja
  ressuscitada por um redo. Agrupamento por campo na mesma janela de meio segundo do ProseMirror;
  atalho vai para a superfície em que foi digitado (o corpo continua com o histórico dele até
  acabar), botões da barra seguem a última superfície editada. Converter a nota zera o ring.
  Ver DECISIONS #36.

- [ ] **Mídia offline** *(impacto médio · esforço M/G)*
  Nota composta offline restaura texto/labels/lembrete após reload, mas perde imagens; uploads
  pausados não sobrevivem ao reload. Persistir os blobs no IndexedDB junto ao outbox
  (DECISIONS #22) e re-enfileirar o upload no replay (FormData não serializa — guardar blob +
  metadados e reconstruir).

- [x] **Virtualização do grid acima de ~400 cards/seção** *(impacto médio · esforço G)* — feito em 2026-07-31
  Hoje todo card renderiza (teto prático ~5k notas, ver ARCHITECTURE.md). O motor de masonry já
  é posicionamento absoluto → janela de renderização por faixa de scroll é encaixável sem trocar
  o layout. Cuidado com FLIP animations e âncora de scroll.
  **Entregue:** já estava no código desde o commit `934b50e` ("render only the notes near the
  viewport") — o item ficou por marcar. A janela liga a partir de 60 notas por seção, cobre o
  viewport ± 900px e segue o scroll em passos de 300px; todo card continua tendo um *rect* na
  layout, então masonry, preview de arrasto e altura de rolagem não sabem quem está montado.

- [x] **Heartbeat de WebSocket no cliente** *(impacto baixo · esforço P)* — feito em 2026-07-30
  O servidor pinga a cada 30s; o cliente confia em reconexão por visibilidade/online. Adicionar
  timer client-side que fecha e reconecta se nenhuma mensagem/pong chegar em N segundos.
  **Entregue:** heartbeat de camada de aplicação (`WS_PING`/`WS_PONG` no shared) porque o browser
  nunca expõe frames pong ao JS — o cliente sonda a cada 25s e fecha o socket após 60s de silêncio,
  caindo no backoff normal. O handler de `visibilitychange` também derruba socket obsoleto (caso
  do notebook acordando, em que os timers ficaram congelados).

- [x] **Roving tabindex no grid** *(impacto baixo · esforço P/M)* — feito em 2026-07-31
  Todos os cards são tab stops (`tabIndex=0`). Implementar roving: um tab stop por grid, setas/j/k
  movem o foco ativo — melhora Tab-navigation com centenas de notas.
  **Entregue:** cada grade expõe **um** tab stop (a nota focada quando é dela, senão a primeira),
  então Tab atravessa o quadro em vez de percorrer N cards — com a seção fixada na tela são dois,
  um por grade. As setas são do próprio card (`onKeyDown`), não do gerenciador de atalhos: o
  gerenciador dá `preventDefault` em tudo que casa, e sequestrar as setas globalmente tiraria do
  usuário a rolagem da página quando nenhum card tem foco.
  **O detalhe que decide o desenho:** masonry não tem linhas — duas colunas vizinhas quase nunca
  compartilham um `y` —, então "o card de baixo" não é um passo de índice. A direção sai da
  geometria (`components/grid/focus.ts`, puro e testado): vence o card mais próximo que
  **sobrepõe** o atual no eixo perpendicular. Cima/baixo ficam presos à coluna, sem exceção
  (colunas terminam em alturas diferentes; pular de lado no fim de uma levaria o foco para onde o
  olho não estava), enquanto esquerda/direita caem no card mais próximo do semiplano quando nada
  está no mesmo nível — senão o escalonamento poderia isolar uma coluna. j/k continuam sendo a
  ordem de leitura. Adotar o foco exige `:focus-visible`: sem isso, todo editor fechado devolveria
  o card com o anel de foco aceso para quem usa mouse.

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

- [x] **Endpoint `/metrics`** *(impacto baixo · esforço P/M)* — feito em 2026-07-31
  `METRICS_ENABLED` já é validado na config mas a rota não existe. Expor Prometheus
  (contadores HTTP, jobs pg-boss, sockets ativos) atrás de auth/bind interno; avaliar Sentry
  como opt-in por env.
  **Entregue:** `GET /metrics` no formato texto do Prometheus, **fora do `/api`** de propósito —
  não é a API JSON (sem sessão, sem PAT, fora do OpenAPI) e scrapers esperam na raiz. Desligado, a
  rota não existe (404), não é um 401. Expõe requisições e latência por *template* de rota
  (`/api/notes/:id` é uma série; por id seria uma bomba de cardinalidade, e requisição sem rota cai
  em `unmatched`), execuções e duração dos jobs pg-boss por fila, sockets abertos e as métricas
  padrão do Node. O registro é **por instância**, não o global do prom-client: a suíte de
  integração levanta um app por teste e registrar o mesmo nome duas vezes num registro
  compartilhado lança. Auth é escolha do deploy: com `METRICS_TOKEN` exige `Bearer` (comparação em
  tempo constante), sem ele fica aberto e a rota deve ficar fora do listener público — está em
  DEPLOYMENT.md e no `.env.example`. O gauge de sockets é amostrado no scrape, porque um par de
  contadores desanda no primeiro socket que morre sem frame de close. Sentry segue fora (adiado, e
  a linha do PARITY.md agora fala só dele).

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

- [x] **Gravação de áudio no navegador** *(impacto alto · esforço M)* — feito em 2026-07-31
  O player e o import de áudio existem; falta gravar (o Keep web não grava — divergência boa).
  `MediaRecorder` → upload como attachment de áudio existente. Transcrição fica no item 3.6.
  **Entregue:** o caminho todo já existia menos as duas pontas — `kind='audio'` está no banco desde
  a v1.0 e o player renderiza o anexo —, então a entrega é o gravador no cliente e uma rota,
  `POST /api/notes/:id/audio`, que reusa o mesmo `ingestAudio` do import do Takeout (guarda os bytes
  como vieram: uma gravação não é uma foto, e transcodificar no servidor custaria uma pilha de mídia
  para perder fidelidade). Entradas: botão de microfone na barra do editor, item na folha
  "Adicionar à nota" do mobile e "Gravação" no FAB — esse cria a nota já com o microfone armado
  (`?record`, que o editor consome e apaga da URL) e nasce `new`, então recusar a permissão não
  deixa nota vazia para trás.
  **O formato é negociado, não escolhido:** cada engine grava no seu contêiner (Opus em WebM no
  Chrome, Opus em Ogg no Firefox, AAC em MP4 no Safari) e não aceita o dos outros, então o cliente
  pede o primeiro candidato que o browser admitir e o servidor sniffa o resultado como qualquer
  upload. O único formato novo no allowlist é o WebM — e ele exigiu mais que uma assinatura: EBML
  não diz o que está dentro, então a regra também lê os *codec ids* do Tracks (precisa declarar
  áudio e não declarar vídeo), senão a rota de áudio viraria upload de vídeo por acidente.
  **A barra é toda a UI**: não há o que configurar, então ela mostra que o microfone está aberto, há
  quanto tempo, e as duas saídas (Parar / Descartar). Detalhes que decidiram o desenho: (a) o tempo
  sai do relógio, não da contagem de ticks, para que uma aba em segundo plano relate a duração real
  — e o teto de 10 min caia onde deve; (b) o teto existe pela aba esquecida, não pelo limite de 20 MB
  (Opus só chega lá depois de horas); (c) Esc cancela a gravação, não a nota — enquanto a barra está
  de pé ela é o que está mais por dentro na tela, e diz isso com um "Descartar" ao lado; (d) tomada
  abaixo de 400ms não sobe: medindo o que o Chrome escreve, até ~100ms o arquivo é só cabeçalho
  (110 bytes, sem faixa declarada) e o servidor recusa com razão — então tocar Parar na subida
  responde "a gravação foi curta demais" em vez de falhar um upload; (e) fechar a
  nota no meio **guarda** a gravação: o áudio já foi falado, e a mutation de upload é registrada no
  `useMutation` (não no `mutate`) justamente para sobreviver ao editor que a começou; (f) o botão de
  remover do anexo de áudio fica sempre visível, ao contrário do da imagem — um player nativo ocupa
  a linha inteira e não sobra canto quieto para revelá-lo.
  **No e2e:** dispositivo falso do Chromium (`--use-fake-device-for-media-stream`) com a permissão
  concedida pelo contexto, então o que sobe é um WebM/Opus de verdade passando pelo sniffer — não um
  blob dublê.

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

- [x] **Vincular notas (`[[` + backlinks)** *(impacto alto · esforço M)* — feito em 2026-07-31
  **O quê:** digitar `[[` abre um picker de notas (como o `#` de labels) e insere um chip-link;
  painel "mencionada em" (backlinks) no editor. Pedido recorrente (Keep trata cada nota como
  post-it isolado — [XDA](https://www.xda-developers.com/i-used-notion-obsidian-and-evernote-only-to-go-back-to-google-keep/)).
  **Como:** reaproveitar o popover do quick-label; link = marca TipTap com o uuid da nota
  (`?note=` já é deep link estável, DECISIONS #13); backlinks = índice client-side sobre o
  corpus + coluna/consulta no servidor para contas grandes. Sanitizador: permitir o atributo.
  **Entregue:** o link **não é um nó novo** — é um `<a>` comum carregando o deep link do próprio
  app (`?note=<uuid>`), e nenhum atributo foi criado. Essa é a decisão que paga o resto: o
  vocabulário, o sanitizador, o serializer markdown, o `.md` de ida e volta, as versões, a
  impressão e o MCP já sabem o que é uma âncora, então o link atravessa tudo isso sem que nenhum
  deles aprenda uma forma nova. O preço fica no sanitizador, que até aqui recusava **todo** href
  relativo: `?note=<uuid>` entra como forma exata (`parseNoteLinkHref`), não como afrouxamento, e
  é o único link que não ganha `target=_blank` — nota não é destino externo, e abrir aba seria uma
  segunda cópia do app. O clique é interceptado na fase de captura, à frente tanto da navegação do
  browser quanto do handler do TipTap.
  **O gesto é input rule, não keydown** (ao contrário do `#`): quem faz o gesto é o *segundo*
  colchete, então não há nada a decidir no primeiro — `[` sozinho continua começando um link
  markdown. Input rules já não disparam dentro de código, que é exatamente o certo aqui. Os dois
  colchetes são comidos e o que sobra na nota é o link, nunca a sintaxe.
  **O rótulo é cópia do título, não referência:** renomear o alvo depois deixa em paz a frase que
  foi escrita em volta dele — é o que `[label](href)` significa no arquivo, e é o comportamento
  mais gentil. O picker também não cria nota: linkar para o que ainda não existe é outra feature.
  **Os backlinks são o mesmo link lido do outro lado**, varrendo o corpus que o cliente já tem —
  a mesma aposta da busca instantânea — atrás do href exato entre aspas, e não do id solto (uma
  nota que só *menciona* `?note=…` no texto não é backlink). Só corpo carrega link; item de
  checklist é texto puro, então nota de lista nunca aparece como origem.
  **O detalhe que decidiu o desenho da UI:** o popover rouba o foco, e devolvê-lo é o que separa o
  gesto de ser utilizável — inserir na mesma volta do loop poria o cursor no corpo só para o
  fechamento tirá-lo um quadro depois, deixando quem escreve encalhado ao lado de um link. A
  inserção espera uma volta, e o e2e afirma isso continuando a frase depois de escolher a nota.
  `[[` e `#` entraram juntos no diálogo `?`: nenhum dos dois é combinação de teclas, então não há
  como descobri-los tentando modificadores.

- [x] **Modelos de nota (templates)** *(impacto médio · esforço M)* — feito em 2026-08-01
  **O quê:** salvar nota como modelo e criar a partir dele (composer → "Novo a partir de
  modelo"). Ausência sentida por quem vai para o Notion/Obsidian.
  **Como:** flag `is_template` no membership ou tabela própria; criar = clonar conteúdo
  (reaproveitar o "Make a copy", que já copia cor/labels/imagens).
  **Entregue:** uma coluna (`note_members.is_template`) e **nenhuma rota nova**. Modelo é estado
  por usuário, então ele mora onde moram fixar e arquivar — o mesmo `PATCH /api/notes/:id/state`,
  o mesmo nível `member` no chokepoint — e "usar modelo" é o `POST /api/notes/:id/copy` que já
  existia, porque a cópia nasce com a flag no padrão: um modelo usado devolve **nota**, não um
  segundo modelo. Isso é o que faz a feature caber numa sessão.
  **Salvar como modelo move a nota, não a duplica:** copiar deixaria duas coisas para manter em
  sincronia e uma para apagar à mão. É o gesto de arquivar — some do quadro, o snackbar oferece o
  desfazer na hora, e o mesmo item de menu é o caminho de volta. Por isso também o editor se fecha
  ao salvar: a nota acabou de sair da tela que estava por baixo.
  **A prateleira é uma exclusão só, dita uma vez:** `onBoard()` em `note-selectors.ts` (fora da
  lixeira e fora dos modelos) governa quadro, arquivo, marcadores, lembretes, busca, alvos de `[[`
  e backlinks — e o `view=templates` do `/api/notes` mais o `EXISTS` do `/api/search` repetem o
  mesmo corte do lado de lá, senão o MCP veria modelos onde o navegador não vê. A **lixeira vence a
  prateleira**: modelo jogado fora aparece na lixeira (e volta para a prateleira ao ser restaurado),
  porque jogar fora tem de continuar reversível. `archived` e `is_template` são independentes —
  tirar da prateleira devolve a nota ao arquivo de onde ela veio.
  **O que aparece só depois do primeiro modelo:** a linha "Modelos" no sidebar, o botão no composer
  e o item no FAB, pela mesma regra que já vale para marcadores e buscas salvas — quem nunca faz um
  modelo nunca vê a feature. O seletor é diálogo, não popover, porque os dois pontos de entrada
  (barra do composer no desktop, folha do FAB no mobile) não têm como compartilhar uma âncora.
  O MCP ganhou `view=templates` no `list_notes` e nada mais: salvar como modelo é decisão visual,
  como cor de marcador.

- [x] **Anexar qualquer arquivo (PDF etc.)** *(impacto médio · esforço M)* — feito em 2026-07-31
  **O quê:** hoje só imagem/áudio/desenho; self-host pede PDF, docs, zip.
  **Como:** novo `kind='file'` em `attachments` com allowlist de extensão+magic bytes e teto de
  tamanho; chip de download no card/editor. PDF ganha preview depois (iframe same-origin).
  **Entregue:** `kind='file'` ao lado de image/audio/drawing e uma rota, `POST /api/notes/:id/files`,
  no molde da de áudio (teto próprio de 25 MB dito ao busboy por requisição, nenhuma passagem pelo
  sharp, bytes guardados como vieram). A coluna nova é uma só, `filename` — e ela é obrigatória
  exatamente quando o anexo é arquivo (`check` no banco), porque um documento é o único anexo cujo
  **nome é conteúdo**: sem ele não há o que mostrar num chip nem como nomear o download.
  **A regra que decide o allowlist: os bytes provam o contêiner, a extensão nomeia qual formato é.**
  Um PDF tem assinatura própria, mas `.docx`, `.odt`, `.epub` e `.zip` são o mesmo zip byte a byte
  (e `.doc`/`.xls` o mesmo OLE2), então assinatura sozinha não distingue e mime declarado continua
  não valendo nada: a extensão escolhe **entre as entradas da família em que os bytes caíram**, e
  extensão fora da tabela é 415. Texto é a única família sem assinatura — lá a prova é o conteúdo
  (decodifica como UTF-8, sem NUL nem controle solto), o que recusa binário renomeado para `.txt` sem
  fingir adivinhar charset. A tabela (`FILE_TYPES` no shared) é lida pelos dois lados: o servidor
  decide, o cliente monta o `accept` do seletor.
  **O download é sempre download.** `Content-Disposition: attachment` (com o par ASCII + RFC 5987,
  senão `orçamento.pdf` chega mutilado) sai só para `kind='file'`: imagem e áudio existem para
  renderizar na página, mas abrir arquivo arbitrário na **nossa própria origem** é oferecer a origem
  de graça — e é por isso que html não está no allowlist e nem por isso passa a ser servido inline.
  A mesma regra vale na rota pública, que já servia bytes pelo token.
  **Onde o chip ficou:** ao lado dos chips de link preview, no rodapé do card e do editor — não na
  pilha de imagens acima do título. Um documento é algo para onde a nota aponta, não algo que ela
  mostra; como o servidor já força o download, o chip é uma âncora e nada mais. Entradas: clipe na
  barra do editor e item na folha "Adicionar à nota" do mobile. O composer segue só com imagem: ele
  segura arquivos em memória antes de a nota existir, e isso é o item "mídia offline".
  **De carona:** `has:file` (com `has:pdf`/`has:document` como sinônimos) e o tile "Arquivos" na
  busca — o filtro por tipo já era genérico sobre `attachments.kind` nos dois executores, então
  nenhuma linha de SQL nova. Preview de PDF continua adiado, como previsto aqui.

- [x] **Tabelas simples** *(impacto baixo · esforço G)* — feito em 2026-08-03
  Pedido clássico, mas pesado: extensão de tabela do TipTap + sanitizador + render no card +
  export. A dependência ("depois do markdown C") caiu — falta o `|---|` no parser/serializer do
  shared, `table/tr/td` no allowlist e uma UI mínima de linha/coluna.
  **Entregue:** exatamente essas quatro peças, e o "simples" do título virou a regra de projeto —
  quem decidiu o escopo foi o *serializer*, não o editor. GFM não escreve célula mesclada, largura
  de coluna nem (num vocabulário sem atributos de estilo) alinhamento, então o allowlist ganhou
  `table/thead/tbody/tr/th/td` e **nenhum atributo**, e as células do TipTap foram estendidas para
  dizer o mesmo: `colspan`/`rowspan` continuam no schema porque o prosemirror-tables lê os dois
  para montar o mapa de colunas, mas entram fixos em 1 e nunca são renderizados — tabela colada de
  uma página web chega desmesclada em vez de chegar com uma mesclagem que o primeiro save desfaria
  calado. Virou DECISIONS #37.
  **As duas invariantes que sustentam isso:** toda tabela é retangular (`fixTables` do
  prosemirror-tables roda a cada transação, e o parser completa/corta cada linha na largura do
  cabeçalho, como o GFM) e a primeira linha é o cabeçalho, escrita com `th` ou não — markdown não
  tem tabela sem cabeçalho. O parser exige pipe **nas duas** linhas para enxergar uma tabela:
  sem isso `a` sobre `---` (regra aqui, setext no CommonMark) viraria tabela de uma coluna e
  `- a | b` sobre `- | -` deixaria de ser a lista de dois itens que aparenta.
  **Onde a UI ficou:** um espaço na barra de formatação com dois controles — fora de uma tabela um
  botão comum que insere 3×3 com cabeçalho, dentro dela o menu de linha/coluna. Dois controles e
  não um: um gatilho de menu toma o foco enquanto decide se abre, e as primeiras letras digitadas
  na célula nova iam junto.
  **De carona:** colar uma tabela markdown já funciona (mesmo parser), e ela sobrevive a export
  `.md`, import, versões, impressão, link público e MCP sem que nenhum deles aprendesse um nó novo.

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

- [x] **Cor/emoji e ordem manual nos labels** *(impacto médio · esforço P/M)* — feito em 2026-07-31
  Cor ou emoji por label (chip e sidebar) + reordenar por arrasto no sidebar em vez de ordem
  alfabética fixa. Reusar `fractional-indexing` (DECISIONS #12).
  **Entregue:** três colunas em `labels` (`color`, `emoji`, `position`) e um `PATCH /api/labels/:id`
  só — renomear, colorir, dar emoji e reordenar são o mesmo verbo, cada campo opcional. A cor é do
  **mesmo palette das notas** (`NOTE_COLORS` + os tokens `--note-*` que já existem), então marcador
  colorido não inventa uma segunda linguagem de cor: o chip se pinta e o sidebar troca o ícone
  genérico de etiqueta pela marca do próprio marcador (emoji quando tem, senão a bolinha da cor).
  O emoji é decorativo — `aria-hidden`, porque o nome está ao lado — e vem de uma lista curta mais
  um campo livre: um seletor de emoji completo é um megabyte de dados para um enfeite.
  **A migração é a parte que exige cuidado:** `position` é `NOT NULL` e a tabela já tem linhas, então
  ela entra nula, é preenchida com `row_number()` **na ordem alfabética atual** (congelando o que a
  conta já vê, em chaves `a0…az` do alfabeto base62 do `fractional-indexing`, que cobre o teto de 50)
  e só depois vira `NOT NULL`. Quem nunca arrastar nada não percebe diferença; marcador novo entra
  no fim, não no meio do alfabeto.
  **Onde o arrasto ficou:** no diálogo "Editar marcadores", não no sidebar. No sidebar cada marcador
  é um `Link` de navegação que também vira ícone na régua colapsada e item do drawer no mobile —
  arrastar ali disputa com o clique que navega. O diálogo já é a tela de gerência, tem linhas
  estáveis e ganhou alça de arrasto própria; o sidebar reflete a ordem escolhida. As setas ↑/↓ na
  alça movem uma casa (o arrasto sozinho não é acessível) e é esse o caminho que o e2e exercita.
  Só a linha movida é escrita — uma posição fracionária —, e soltar de volta no mesmo intervalo não
  escreve nada. O MCP continua com `rename_label` só de nome: cor e ordem são decisão visual, e
  nenhuma tool ficou devendo comportamento existente.

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

- [x] **Operadores de busca** *(impacto médio · esforço M)* — feito em 2026-07-31
  `label:mercado`, `color:blue`, `has:image|list|reminder`, `is:pinned|archived`,
  `before:/after:2026-01-01`, `-termo`. Parser client-side sobre o corpus (a busca já é
  instantânea) + tradução para parâmetros do `/api/search` para contas grandes/MCP.
  **Entregue:** um parser só, em `@openkeep/shared` (`parseSearchQuery`), rodando nos dois lados:
  no navegador ele vira o filtro do corpus e no `/api/search` vira condição SQL. Os operadores
  viajam **dentro do `q`**, não como parâmetros novos da rota — assim a mesma string que a pessoa
  digita é a que um agente manda pelo `search_notes`, e a API não ganhou superfície. O vocabulário
  é inglês nos dois idiomas (um `marcador:` teria de atravessar o i18n para chegar ao servidor, que
  não tem locale), mas `color:` aceita a palavra do dia a dia além do nome da paleta —
  `color:blue` e `color:fog` são o mesmo filtro, pelo mapa que o Takeout já usava.
  **A regra que evita surpresa:** o que não é entendido vira texto. Chave desconhecida, valor
  inválido, `https://example.com` e o `label:` ainda sendo digitado são palavras de busca, nunca um
  filtro invisível — e todo operador reconhecido aparece como chip, cujo × **reescreve a query**
  (caixa e chips são um estado só, não dois). Negação: `-` vale para palavra e para filtro
  (`-label:trabalho`), e as flags têm o negativo por extenso (`is:unpinned`), porque `-is:pinned` e
  `is:unpinned` precisam dizer a mesma coisa. Data não tem negativo — `-before:` é palavra.
  **Detalhes que decidem o comportamento:** (a) repetir `label:`/`has:` é E, repetir `color:` é OU
  (a nota tem uma cor só; E nunca devolveria nada); (b) `before:`/`after:` comparam o **dia UTC** da
  edição nos dois lados — o cliente compara o prefixo ISO e o servidor recebe o `Z` explícito, então
  nenhum dos dois faz conta de fuso; (c) no FTS, exclusão não é a negação do E: a nota não pode
  conter **nenhuma** das palavras, então `buildPrefixTsquery` ganhou modo `|` e a condição é
  `NOT (a:* | b:*)` sobre corpo **e** itens; (d) `label:` é o único operador resolvido fora do
  filtro puro — o corpus só tem ids, então a rota traduz nome→id (nome que ninguém tem resolve para
  ele mesmo e casa com nada, que é a resposta honesta para `label:typo`).

- [x] **Buscas salvas** *(impacto baixo · esforço P/M)* — feito em 2026-07-31
  Salvar uma combinação busca+filtros como atalho no sidebar (vira "label inteligente").
  Destravado: os operadores acima já são a linguagem a salvar — a busca inteira cabe numa string
  (`q`), então o atalho é um nome + essa string em settings, sem esquema novo.
  **Entregue:** botão "Salvar busca" na própria tela de busca, ao lado dos chips, e a lista em
  `settings.savedSearches` (coluna `jsonb` em `user_settings`, teto de 20) — o mesmo DTO que o
  cliente já tem em mãos, então o PATCH de settings e o evento `settings.updated` fazem o atalho
  aparecer nas outras abas sem rota nova.
  **A decisão que sustenta o resto: o que é salvo é a query canônica.** Os tiles de tipo, marcador
  e cor são dobrados para dentro do `q` (`has:list`, `label:"a fazer"`, `color:coral`), porque a
  linguagem de busca já os expressa — assim existe **uma** representação para guardar, mostrar e
  entregar a um agente, em vez de um atalho com metade dos filtros na string e metade ao lado. A
  exceção é o filtro "Pessoas": colaborador é um id de usuário, que nenhum operador escreve, então
  viaja num campo próprio da entrada e faz parte da identidade dela.
  **Onde ficou o gerenciamento:** o botão é um estado só — busca não salva oferece o nome, busca
  salva oferece a remoção. É o mesmo motivo pelo qual o arrasto dos marcadores foi para o diálogo:
  no sidebar cada item é um `Link` de navegação, e pendurar um "×" ali disputa com o clique que
  navega. O nome vem preenchido com a própria query (é o que a pessoa acabou de digitar) e o link
  do sidebar casa por caminho **e** busca — senão dois atalhos acenderiam juntos na mesma rota.

- [x] **Mesclar notas** *(impacto baixo · esforço P/M)* — feito em 2026-07-31
  Na seleção múltipla, "Mesclar" concatena corpos/itens/imagens numa nota (Apple Notes tem, o
  pessoal sente falta —
  [Jornal em Destaque](https://www.jornalemdestaque.com/tecnologia/eu-uso-o-google-keep-todos-os-dias-mas-esses-recursos-do-apple-notes-ainda-me-deixam-com-ciumes/580398/)).
  Original vai para a lixeira (desfazível por 7 dias).
  **Entregue:** `POST /api/notes/merge` recebe a lista e **a primeira nota sobrevive** — ela não é
  uma nota nova: mantém o id (deep link, lembrete, colaboradores e estado por usuário seguem
  intactos) e as outras vão para a lixeira. Quem decide quem é a primeira é a **ordem da tela**
  (`viewNoteIds`), não a ordem do corpus: o usuário está olhando para o quadro.
  **O tipo da sobrevivente decide o resto:** nota de texto recebe cada fonte como markdown, com o
  título da fonte rebaixado de `#` para `##` (o serializer é o mesmo do export `.md`, então
  formatação, listas e código sobrevivem); nota de lista recebe itens, e o título de cada fonte
  vira um item — senão seria a única coisa que a mesclagem apagaria em silêncio. Não há terceira
  opção porque o modelo tem uma checklist por nota (ver "Texto e checklist na mesma nota"). Anexos
  são **copiados**, não repontados, para que a fonte na lixeira continue inteira e restaure completa.
  **Sem botão de desfazer, de propósito:** as fontes estão na lixeira, mas a sobrevivente já tem o
  texto mesclado — um "desfazer" que só devolvesse as fontes deixaria tudo duplicado. O caminho de
  volta é o snapshot forçado no histórico de versões (feito antes de mesclar) mais a lixeira.
  Exige ser dono de **todas** as notas, inclusive da sobrevivente: mesclar joga fora as fontes, e
  jogar fora é coisa de dono.

- [ ] **Visão calendário dos lembretes** *(impacto baixo · esforço M)*
  Alternativa mensal à lista de Reminders, mostrando as ocorrências (o wrapper de rrule já
  expande recorrência). Só leitura na v1; clicar abre a nota.

### 3.3 Compartilhamento, privacidade e exportação

- [x] **Permissão somente-leitura no compartilhamento** *(impacto alto · esforço M)* — feito em 2026-07-31
  **O quê:** o Keep só tem "pode editar"; visualizar-sem-editar é pedido constante.
  **Como:** coluna `role` (`editor`/`viewer`) em `note_members` — cai exatamente no chokepoint
  `assertNoteAccess` (DECISIONS #9), que passa a receber o nível exigido por rota. UI: seletor no
  diálogo de colaboradores; viewer mantém estado próprio (pin/cor/labels) por definição do modelo.
  **Entregue:** um terceiro valor (`viewer`) ao lado de `owner`/`collaborator` e um terceiro nível no
  chokepoint — `member` < `editor` < `owner`. Cada rota continua com **uma** chamada a
  `assertNoteAccess`; o trabalho foi classificar qual nível cada uma exige. `collaborator` continua
  com esse nome sendo o nível de edição: rebatizá-lo de `editor` reescreveria linhas gravadas, o DTO
  `Collaborator`, o vocabulário do WS, o MCP e os dois locales para dizer a mesma coisa.
  **A classificação é o desenho:** conteúdo compartilhado (título, corpo, itens, anexos, tipo da nota,
  restaurar versão) é `editor`; a existência da nota (lixeira, restaurar, excluir, mesclar,
  compartilhar) é `owner`; e tudo que a linha de `note_members` guarda por usuário — fixar, arquivar,
  cor, fundo, posição, marcadores, lembrete — fica em `member`. Quem só vê organiza o próprio quadro
  como qualquer um, e isso sai do modelo em vez de ser exceção dentro dele. "Fazer uma cópia" também é
  `member`: a cópia é uma nota nova de quem copiou, e quem pode ler já poderia redigitar.
  **A troca de permissão precisa alcançar um editor aberto**, então ela viaja num evento próprio
  (`collaborator.role_changed`) carregando o papel de quem foi afetado — o mesmo evento redesenha a
  lista de colaboradores para todos e vira a nota daquela pessoa em somente-leitura ao vivo (o
  `editable` do TipTap é lido na criação da instância, então há um `setEditable` explícito). No
  cliente o mesmo corte vive em `lib/note-permissions.ts` (`canEditContent`), que é honestidade de UI
  e não autorização: botão que só pode dar 403 não fica na tela, mas toda chamada continua batendo no
  chokepoint — e o 403 tem código próprio (`note_read_only`) para o cliente dizer *por quê* em vez de
  "proibido".

- [x] **Compartilhar por link público (somente leitura)** *(impacto alto · esforço M)* — feito em 2026-07-31
  **O quê:** "sem opção de compartilhar por link" é uma das 6 faltas da
  [Android Police](https://www.androidpolice.com/google-keep-missing-features-annoy-me/).
  **Como:** token aleatório por nota (`share_links`: id, note_id, token, expiração, revogável) →
  rota pública `/s/<token>` (SSR leve ou SPA sem auth) com rate limit; imagens servidas por URL
  assinada derivada do token. Excluir de robots; revogar = deletar linha.
  **Entregue:** `note_share_links` é **uma linha por nota** — o `note_id` é a chave primária —, então
  compartilhar por link é um interruptor e não uma lista: emitir de novo sobrescreve a linha e mata o
  endereço anterior no mesmo gesto ("regerar" e "revogar" são a mesma garantia, e nunca existem dois
  endereços vivos para acompanhar). O token (24 bytes, base64url) fica em claro pelo mesmo motivo do
  feed iCalendar: a URL *é* a credencial e precisa continuar copiável de outro dispositivo.
  **O que o leitor recebe é uma projeção, não a nota inteira** (`zPublicNote`): só conteúdo
  compartilhado — tipo, título, corpo, itens, anexos, a cor do dono e as datas. Tudo que a linha de
  `note_members` guarda por usuário (marcadores, lembrete, fixada, arquivada, posição) fica para trás,
  e nenhum nome ou e-mail de ninguém viaja: a página é a nota, não a conta atrás dela.
  **Anexos andam no mesmo token** (`/api/public/notes/:token/attachments/:id/:variant`) em vez de uma
  URL assinada à parte — o token já limita a busca à própria nota, então id emprestado de outra nota é
  404 por construção; um segundo segredo compraria exatamente isso mais um problema de rotação.
  **Detalhes que decidem o comportamento:** (a) nota na lixeira faz o link parar de responder sem
  apagar a linha, e restaurar a nota o traz de volta — jogar fora é reversível, e o link devia ser
  também; (b) token inválido, expirado e revogado
  dão o mesmo 404, sem oráculo; (c) toda a superfície anônima tem rate limit, responde
  `X-Robots-Tag: noindex` e é repetida num `robots.txt` que barra `/s/` — o *fallback* da SPA carimba
  o mesmo cabeçalho na página, já que um único HTML serve todas as rotas; (d) a página fica **fora do
  `_shell`**: não há sessão a guardar, barra lateral a desenhar nem para onde navegar; (e) a validade
  opcional (7/30 dias) é um seletor, não um campo de data.

- [x] **Compartilhar várias notas de uma vez** *(impacto baixo · esforço P)* — feito em 2026-07-30
  Na barra de seleção, "Colaborador" aplica o convite às N notas (a Android Police também cita).
  Depende só de reaproveitar o diálogo existente em lote.
  **Entregue:** o mesmo `ShareDialog`, com a lista de colaboradores vazia (em lote não há uma lista
  única para remover ninguém — remoção continua sendo por nota) e uma linha nova de subtítulo
  dizendo em quantas notas o convite vai cair. Só notas minhas entram: a seleção é filtrada por
  `role === 'owner'` e o item do menu some quando não sobra nenhuma. Convidar dispara N POSTs,
  fecha o diálogo e limpa a seleção; falhas continuam aparecendo no snackbar de erro do próprio
  `invite` (uma por nota que recusar, ex.: já colaborador).

- [x] **Apagar todas as notas da conta** *(impacto baixo · esforço P)* — feito em 2026-07-31
  **O quê:** item pedido fora do roadmap: uma saída em Configurações para zerar a conta de uma vez,
  em vez de excluir nota por nota (a lixeira também é esvaziada).
  **Entregue:** "Zona de perigo" no diálogo de Configurações, com `POST /api/notes/delete-all`.
  **A confirmação é o texto digitado, não o botão** — o botão de confirmar nasce desabilitado e só
  arma quando a palavra (`EXCLUIR`/`DELETE`, traduzida) é digitada, com a contagem do que vai sumir
  na tela enquanto se digita. O corpo da requisição também carrega um literal
  (`{"confirm":"delete-all-notes"}`): um POST acidental de script não basta, porque atrás desta rota
  não existe lixeira.
  **O que ela não faz:** não toca em dado de terceiro. Notas minhas são destruídas (com os arquivos
  dos anexos); notas apenas **compartilhadas comigo** eu apenas *deixo* — some a minha linha de
  `note_members`, a nota continua com o dono. Os **marcadores vão junto** (revisto em 2026-07-31: a
  primeira versão os preservava): são meus e só meus, e zerar a conta de propósito não devia deixar
  um sidebar cheio de nomes que não organizam mais nada — o diálogo diz quantos, e o marcador de
  quem compartilha comigo continua sendo dele. O evento
  `notes.purged` avisa as minhas outras abas (mandar um `note.removed` por nota seriam milhares), e
  os colaboradores recebem o evento certo para cada metade: `note.removed` nas minhas, que
  acabaram, e `collaborator.removed` nas deles, que só perderam um colaborador.

- [x] **Proteger nota com PIN/senha (ocultar)** *(impacto médio · esforço M)* — feito em 2026-08-03
  **O quê:** nota "trancada": conteúdo borrado/oculto (inclusive na busca) até confirmar senha
  da conta ou PIN. Top-6 da Android Police.
  **Entregue:** flag `locked` por membership, "Proteger nota" nos menus da nota e do card. A
  decisão que define o resto: **quem esconde é o servidor, não o cliente**. Uma nota protegida sai
  da API já sem título, corpo, itens e anexos — a versão "borrar no CSS" cairia com um F12, e
  ninguém instala um cadeado que só engana o dono. O que sobra é o que o board precisa para
  desenhar o card no lugar certo (cor, fundo, fixado, posição, marcadores, colaboradores): a nota
  protegida continua sendo arrastada, colorida e arquivada, porque nada disso conta o que ela diz.
  **A trava mora no `assertNoteAccess`**, e é isso que a torna verificável: toda leitura e toda
  escrita já passavam por lá, então nenhuma rota nova pode crescer por fora. Quem precisa passar
  carrega `allowLocked` — são quatro casos, todos sobre o cadeado ou sobre o card, nunca sobre o
  conteúdo. Os caminhos que **não** passam pelo chokepoint tiveram que repetir a checagem, e são
  exatamente os que vazariam: os bytes do anexo (uma `<img>` lê uma nota tão bem quanto o texto) e
  o link público — nota protegida que a internet inteira ainda lê não está protegida, então o link
  apaga junto (reversível, como o lixo).
  **A busca não devolve a nota "vazia", devolve nada**: um resultado em branco já responderia a
  única pergunta que o cadeado existe para recusar — se existe uma nota sobre *aquilo*. Mesma
  regra no servidor e no corpus client-side.
  **A liberação é por sessão, com 15 minutos**, guardada em memória (reiniciar o processo tranca
  tudo de novo — é feature). Por sessão, não por conta: destrancar no celular não pode descobrir
  o notebook aberto na mesa do escritório. Como "esta requisição herdou a liberação?" é escopo de
  requisição igual a um request id, ela viaja em `AsyncLocalStorage` em vez de virar parâmetro em
  trinta funções de serviço — e o padrão de contexto ausente é `false`, então job do pg-boss,
  frame de WebSocket e teste unitário veem a nota redigida, que é a resposta que falha para o lado
  seguro. O **PIN (4–8 dígitos) é atalho da senha**, com o mesmo scrypt do Better Auth, e por isso
  é a senha que o instala; cinco erros custam cinco minutos, porque o que protege um segredo de
  quatro dígitos é o contador, não a entropia.
  **Três coisas que só apareceram no caminho:** (a) o export **não** é redigido — é backup, não
  visualização, e devolver um zip que perdeu silenciosamente o conteúdo seria pior que qualquer
  vazamento (o `locked` viaja junto, então restaurar recoloca a cortina); (b) eventos de conteúdo
  pulam quem trancou a nota (`contentAudience`) — o REST já lhe nega o texto, e um evento é o
  mesmo texto entrando por outra porta; (c) o service worker não grava o que foi lido com a
  cortina aberta, e o marcador é um header nosso, não `no-store` — o Better Auth marca a rota de
  sessão assim por conta própria, e um worker que pulasse tudo com esse header pararia de guardar
  justamente a sessão de que o app precisa para abrir offline.
  **Token de API nunca destranca**, porque não dá para pedir uma senha a um token: notas
  protegidas são invisíveis para o MCP e para qualquer agente, por construção e não por política.
  **Não é criptografia** — a seção de Configurações diz isso com todas as letras: o servidor
  continua lendo a nota.

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

- [x] **Webhooks de saída** *(impacto médio · esforço M)* — feito em 2026-08-01
  **O quê:** POST assinado (HMAC) em URL configurável quando nota é criada/editada/arquivada —
  destrava n8n/Zapier/Home Assistant, pedido típico de self-host.
  **Como:** tabela de webhooks por usuário + job pg-boss com retry/backoff pendurado no mesmo
  ponto que publica no WS (`publishToUsers`); payload = DTO já existente.
  **Entregue:** o engate é o previsto — um *sink* opcional no `publishToUsers`, e não uma chamada
  nova em cada uma das ~40 rotas que publicam —, mas **o que sai não é o que trafega por dentro**.
  O socket fala com o nosso próprio cliente, que vem junto com o servidor; um webhook fala com o
  n8n de outra pessoa, e cada nome ali é promessa feita a estranho. Então vinte eventos internos
  viram sete fatos no nível da nota (`toWebhookEvent`): subir anexo, mexer num item da checklist e
  colar no corpo são todos `note.updated`, e o que não tem nota atrás (job, settings, o purge da
  conta inteira) simplesmente não sai.
  **O corpo é sempre `{event, noteId, note}`, com a nota lida na hora da entrega** pelo caminho
  normal por usuário — então o receptor nunca precisa ligar de volta, o estado por usuário
  (marcadores, lembrete, fixada) é o de quem pediu o hook, e nenhum receptor aprende o formato dos
  nossos *patch results*. `note` só é nulo quando a nota já não existe, que é o caso normal de
  `note.deleted`.
  **Duas coisas caem do caminho quente:** o conjunto de contas com endereço vivo fica em memória
  (todo autosave publica, e quase nenhuma instância tem webhook), e a entrega é job pg-boss com
  backoff exponencial — cinco tentativas, teto de 1h — em vez de um `await` dentro da requisição.
  **A assinatura cobre `<timestamp>.<corpo>`**, não o corpo sozinho: sobre o corpo ela seria
  replayável para sempre. O segredo é guardado em claro, ao contrário do hash de um PAT, porque
  precisamos reproduzi-lo para assinar — e ele não dá acesso a nada aqui, só prova ao receptor que
  a requisição veio de nós.
  **Endereço privado é decisão do deploy** (`WEBHOOK_ALLOW_PRIVATE_TARGETS`): o guard de SSRF do
  link preview está certo para instância multiusuário e errado para o homelab cuja lista inteira de
  alvos está na LAN. O endereço é guardado nos dois modos — só a entrega é barrada —, então virar a
  env não obriga ninguém a recadastrar nada. O corpo da resposta é descartado sem leitura sempre:
  webhook não pode virar um jeito de buscar página. Virou DECISIONS #34.
  **De carona, um evento que não é mudança de ninguém:** `reminder.fired`. O job que dispara
  lembretes já anuncia no mesmo canal, e "quando o lembrete tocar, faça X" é a razão pela qual a
  maioria das pessoas liga um app de notas a qualquer coisa.
  **O teste é o botão**: "Enviar teste" entrega na hora (não enfileira) para poder devolver o
  código que o receptor respondeu — e entrega como `webhook.test`, nunca como `note.created`, senão
  um teste acionaria a automação de verdade. Gerenciar é sessão-only como os PATs, o que também
  mantém o painel fora do MCP.

- [x] **Feed iCalendar (.ics) dos lembretes** *(impacto médio · esforço P/M)* — feito em 2026-07-31
  URL secreta `/api/calendar/<token>.ics` para assinar no Google Calendar/Thunderbird/Proton.
  Lembretes já são RFC-5545 por dentro (DECISIONS — rrule) → mapeamento quase direto para VEVENT.
  **Entregue:** token por conta em `user_settings` (nulo = sem feed), criado/rotacionado/revogado
  numa seção nova do diálogo de Configurações. O token fica **fora** do DTO de settings de
  propósito: `zUserSettingsPatch` é o parcial de `zUserSettings`, e um segredo não pode morar num
  corpo que o cliente dá PATCH. Guardado em claro, não em hash — o endereço *é* a credencial e
  precisa continuar copiável de outro dispositivo; rotacionar cancela todas as assinaturas de uma
  vez. A rota `.ics` não tem sessão nenhuma (cliente de calendário não faz login), tem rate limit
  como qualquer superfície anônima e devolve o mesmo 404 para token inválido e para token que já
  existiu — sem oráculo.
  **A decisão que não é óbvia: o feed não exporta `RRULE`.** Recorrência é expandida em VEVENTs
  individuais em UTC (janela de −30 a +365 dias, teto de 366 por regra). O motivo é o próprio
  DECISIONS: a expansão daqui roda em "fake UTC" no fuso do lembrete justamente para manter o
  horário de parede através do horário de verão, e reproduzir isso em iCalendar exigiria embarcar
  um `VTIMEZONE` com as regras de transição de cada fuso — trabalho de biblioteca inteira para
  errar diferente. Expandir usa o mesmo expansor do job que dispara os lembretes, então feed e
  notificação nunca discordam. O preço é o feed ser uma projeção, e por isso o cabeçalho anuncia
  `REFRESH-INTERVAL:PT1H`. O serializer é puro e testado à parte, inclusive o *folding* de 75
  **octetos** que não pode cortar um caractere multibyte no meio (emoji em título de nota).

- [ ] **Criar nota por e-mail** *(impacto baixo · esforço G)*
  Endereço secreto que vira nota. Exige receber e-mail (inbound webhook de um provedor ou SMTP
  próprio) — complexidade alta para self-host; deixar por último ou como plugin opcional.

### 3.5 Self-host e administração

- [x] **Painel/rotas de administração** *(impacto alto · esforço M/G)* — feito em 2026-08-01
  **O quê:** o dono da instância hoje administra via SQL. Mínimo viável: listar usuários,
  desativar cadastro público, deletar usuário (com purge de dados/arquivos), uso de disco por
  usuário.
  **Como:** `ADMIN_EMAILS` no env → flag no usuário; rotas `/api/admin/*` + página simples em
  Settings. Cuidado: manter fora do escopo dos PATs (como já é feito com gestão de tokens).
  **Entregue:** o "flag no usuário" previsto aqui **não** existe — quem administra sai só do
  `ADMIN_EMAILS`, comparado sem caixa com o e-mail da sessão. Uma coluna precisaria responder quem
  promove o primeiro admin numa instância vazia, estaria a um `UPDATE` de distância de quem
  alcançar o banco e viveria longe de quem de fato manda na máquina; o env já é o que o operador
  controla para o servidor sequer subir. Sem `ADMIN_EMAILS` ninguém administra: o `GET
  /api/admin/me` responde `{admin:false}`, o item do menu não nasce e as outras rotas são 403 para
  todo mundo. Tudo é `rejectPatAuth` como a gestão de tokens — o que também mantém o painel fora do
  MCP, que fala com estas mesmas rotas por PAT.
  **Só uma coisa vira linha no banco:** `instance_settings`, uma linha só (`id = 'singleton'`, com
  check), hoje guardando `signup_enabled`. Linha ausente = padrão, então nada precisa semear.
  **O cadastro é fechado onde a conta nasce, não na rota de cadastro:** o
  `databaseHooks.user.create.before` do Better Auth é o único ponto por onde passa tanto o
  formulário quanto o primeiro login OAuth, e é lido a cada tentativa — o `disableSignUp` nativo é
  decidido no boot e não serviria a um interruptor de runtime. Endereço do `ADMIN_EMAILS` passa
  mesmo com a porta fechada: quem é dono precisa poder criar a própria conta numa instância que já
  fechou.
  **Excluir conta se apoia no schema em vez de reimplementá-lo:** toda tabela por usuário cascateia
  de `user`, então a linha sumir *é* a exclusão; o que o banco não faz são os arquivos dos anexos,
  colhidos antes das linhas (falha no meio deixa linha apontando para arquivo, nunca o contrário) —
  a mesma ordem do `deleteAllNotes`. Dois cercados: o corpo carrega o literal
  (`{"confirm":"delete-user"}`) e o diálogo pede o endereço digitado, porque atrás disso não há
  lixeira; e conta ainda listada no `ADMIN_EMAILS` é recusada — apagar a linha deixaria um nome que
  entra de novo no minuto seguinte, e sendo a sua, tiraria de você o painel que desfaria isso.
  **O limite honesto:** a sessão vive num cookie assinado por 5 minutos (`cookieCache`), então o
  navegador que estava aberto na hora da exclusão continua respondendo por ele até vencer — olhando
  para uma conta sem nada dentro. O teste de integração afirma exatamente isso em vez de fingir um
  401 imediato.

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

- [x] **Backup automático agendado** *(impacto médio · esforço P/M)* — feito em 2026-07-31
  O export JSON completo já existe; agendar via pg-boss (cron por env) gravando o zip em
  diretório/S3 com rotação (manter N). DEPLOYMENT.md ganha a seção "restaurar".
  **Entregue:** `BACKUP_CRON` (cron de 5 campos) liga um job pg-boss que grava **um arquivo por
  conta** em `BACKUP_DIR/<userId>/openkeep-<carimbo UTC>.zip`, mantendo os `BACKUP_KEEP` mais novos
  (padrão 7). Sem o cron, a fila nem é registrada — e um cron malformado derruba o boot, porque um
  job que nunca dispara é indistinguível de "os backups estão rodando". S3 fica de fora: é o item
  vizinho do roadmap, e o backup vai atrás da interface de storage quando ela existir.
  **Um arquivo por conta, e é o mesmo arquivo do export:** `writeExportZip` saiu de dentro do
  `runExport` e agora serve aos dois, então backup e "Exportar" produzem o mesmo zip — restaurar é o
  fluxo de import que já existe, não um segundo formato que ninguém testa. O carimbo é ISO sem
  separadores (`20260731T030000Z`): ordem alfabética *é* ordem cronológica, então a rotação é um
  `sort()` e não uma leitura de mtime.
  **O que o job promete quando algo dá errado:** cada arquivo é escrito como `.part` e renomeado no
  fim — um crash no meio não deixa um zip truncado com cara de backup, e a rotação só enxerga
  arquivos prontos, já que `.part` não casa com o padrão do nome. Conta que falha não aborta a
  rodada nem gira a rotação dela (senão um erro repetido apagaria os backups bons, um por dia).
  **A honestidade fica no DEPLOYMENT.md:** o par `pg_dump` + volume continua sendo o backup
  completo. O arquivo por conta restaura notas, marcadores, cor, fixadas e datas pelo `markdown/`,
  mas **não** anexos (estão no zip, o importador não os reata) nem compartilhamento.

- [ ] **Mais idiomas (es, depois comunidade)** *(impacto médio · esforço M)*
  A estrutura i18n é sólida (EN base + pt-BR completo + teste de paridade). Generalizar o teste
  de paridade para N locales e adicionar espanhol; abrir CONTRIBUTING para traduções.

- [x] **Cotas por usuário** *(impacto baixo · esforço M)* — feito em 2026-08-01
  Para instância multiusuário: teto de armazenamento/anexos por conta (env), erro claro no
  upload. Junto do painel admin.
  **Entregue:** `USER_STORAGE_QUOTA_MB` (sem ele, sem teto — que é a resposta certa para instância
  de uma pessoa só) e **nenhuma tabela nova**: a soma que o painel admin já imprimia por conta virou
  também a régua, num helper só (`assertStorageQuota`) que toda entrada de bytes atravessa. É isso
  que fez a feature caber numa sessão.
  **A conta é do dono da nota, não de quem envia.** Anexo que um colaborador põe na minha nota cai
  no meu teto — porque a cobrança tem de usar a mesma atribuição da contabilidade, senão o painel e
  o limite falariam de coisas diferentes e o dono leria um número que não é o dele. Pela mesma razão
  a **lixeira conta**: o arquivo continua no volume até o purge levá-lo.
  **Onde o teto é cobrado:** as quatro rotas de upload, o *replace* de desenho (que paga só a
  diferença `novo − antigo`, então redesenhar mais simples nunca esbarra), e **cópia e mesclagem** —
  bytes duplicados são bytes novos, e um laço de "fazer uma cópia" seria o caminho mais barato para
  furar o limite. O import do Takeout é o único que engole a recusa: pula a mídia que não cabe do
  mesmo jeito que já pulava a mídia corrompida, porque derrubar um cofre inteiro no byte que passou
  da linha é o pior negócio.
  **A recusa tem código próprio** (`storage_quota_exceeded`, 413) e não `payload_too_large`: para
  quem chama, os dois dizem coisas opostas — "manda um arquivo menor" contra "apaga alguma coisa" —,
  e é justamente por isso que o cliente re-diz **esse** no idioma de quem lê (o detail do servidor é
  inglês, ele não tem locale). O teto vem do cache da própria consulta de uso, não de parsing da
  frase.
  **Antes de bater, o número aparece:** seção "Armazenamento" nas Configurações (`GET /api/storage`,
  rota minúscula e própria — uso não é *setting*, nada ali é patchável), com barra que fica vermelha
  a partir de 90%. O painel admin imprime o limite ao lado dos totais e marca quem já está acima —
  situação alcançável sem upload nenhum, bastando baixar a cota de uma instância com contas dentro.
  Admin não é isento, de propósito.

### 3.6 IA (opcional, sempre opt-in, BYO key)

A base já é forte: MCP com 59 tools + PATs significa que **agentes externos já fazem tudo** (o
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

1. **Sub-labels/pastas** (3.2) — o pedido nº 1 dos fóruns.
2. ~~**Tabelas simples** (3.1)~~ — saiu em 2026-08-03 (ver abaixo).
3. ~~**Cotas por usuário** (3.5)~~ — saiu em 2026-08-01 (ver abaixo).

A seção 1.2 fechou: roving tabindex e `/metrics` saíram na rodada de 2026-07-31, e a virtualização
do grid já estava no código sem estar marcada. Com o undo/redo de sessão (2026-08-03), sobra lá só
mídia offline.

**Buscas salvas** saíram junto (2026-07-31): eram o item barato que os operadores destravaram.

O antigo item 1 da fila — **somente-leitura no compartilhamento** — saiu em 2026-07-31 e caiu no
chokepoint como previsto: nenhuma rota ganhou uma segunda checagem, só um nível a mais.

**Link público** saiu logo atrás (2026-07-31), e era o nº 2 desta fila. A previsão de que ele seria
"a versão sem conta do `viewer`" não se confirmou no código: o `viewer` é um nível *dentro* do
chokepoint, e o link é o contrário disso — uma rota sem sessão alguma, servindo uma projeção da nota
(`zPublicNote`) em vez do `FullNote`, justamente porque não há usuário de quem ler estado por
usuário. As duas features se encontram só na UI, no mesmo diálogo de compartilhamento.

**Gravação de áudio** saiu em 2026-07-31: era o único item de impacto alto cuja infraestrutura
inteira já estava no repo (`kind='audio'`, player, sniffer) — restavam o gravador e uma rota. A
seção 2 agora só tem OCR, "Things", masonry nativo e o offline completo.

**Vincular notas** saiu junto (2026-07-31), e era o antigo nº 2 desta fila. Confirmou a aposta que
o justificava: o link cabe numa âncora com o deep link que já existia, então nenhuma tabela,
coluna, atributo ou rota nasceu — o servidor só aprendeu a deixar passar uma forma de href
relativo. Isso muda o custo do item 3.1 **texto e checklist na mesma nota**? Não: continua sendo
o modelo de uma checklist por nota, não a falta de vocabulário no corpo.

**Anexar qualquer arquivo** saiu em 2026-07-31. Não estava na fila dos três, e saiu justamente pelo
motivo que a gravação de áudio tinha: quase tudo já existia (tabela de anexos, storage, sniffer de
magic bytes, cópia, export, projeção pública), então a entrega foi uma coluna, uma rota e um chip. O
que o item obrigou a decidir foi o allowlist — assinatura não distingue `.docx` de `.zip` —, e a
resposta virou DECISIONS #31. Isso muda a fila? Não: **sub-labels/pastas** segue sendo o nº 1, e
preview de PDF fica adiado (iframe same-origin é o oposto do `Content-Disposition: attachment` que
esta entrega escolheu — quando vier, será decisão nova, não continuação desta).

**Modelos de nota** saíram em 2026-08-01, também fora da fila dos três e pelo mesmo motivo dos dois
anteriores: quase tudo já existia. A cópia de nota, o `PATCH /state` e o corpus filtrado no cliente
já eram exatamente as três peças da feature, então o que sobrou foi uma coluna e uma exclusão dita
num lugar só (`onBoard()`). Isso muda a fila? Não — e vale registrar o que o item **não** decidiu:
a prateleira é plana, então ela não é um ensaio de **sub-labels/pastas**, que continua sendo o nº 1
e continua precisando de `parent_id` e árvore no sidebar.

**Painel admin** saiu em 2026-08-01 e era o nº 2 desta fila. O que ele obrigou a decidir não foi
nenhuma rota e sim *onde mora o poder*: administrar virou env (`ADMIN_EMAILS`), não coluna, e a
única linha nova no banco é a que o painel escreve (`instance_settings.signup_enabled`) — virou
DECISIONS #32. O item vizinho **cotas por usuário** ficou barato de carona: o uso de disco por conta
já é calculado e mostrado, então falta só o teto e a recusa no upload. Isso muda a fila?
**Sub-labels/pastas** segue sendo o nº 1, e continua precisando de `parent_id` e árvore no sidebar.

**Cotas por usuário** saíram em 2026-08-01, no dia seguinte ao painel admin e exatamente pelo motivo
previsto ali: o uso de disco por conta já era calculado, então faltavam o teto e a recusa. O que o
item obrigou a decidir não foi onde checar e sim **de quem é a conta** — do dono da nota, para que
cobrança e contabilidade sejam a mesma coisa —, e que cópia e mesclagem também pagam, senão o limite
teria uma porta dos fundos com dois cliques. Virou DECISIONS #33. Isso muda a fila? **Sub-labels/
pastas** segue sendo o nº 1, e a fila agora tem só ele e **tabelas simples**.

**Webhooks de saída** saíram em 2026-08-01, no mesmo dia das cotas e também fora da fila dos dois:
foram escolhidos por serem o item de maior impacto que **fechava inteiro numa sessão** — superfície
toda nova, sem colidir com nada de pé. O que ele obrigou a decidir não foi onde engatar (o
`publishToUsers` já era o ponto previsto aqui) e sim **o que atravessa a fronteira**: vinte eventos
internos viram sete, porque um nome dito a um n8n de estranho é promessa, enquanto um nome dito ao
nosso próprio cliente é código que viaja junto. Virou DECISIONS #34. Isso muda a fila?
**Sub-labels/pastas** segue sendo o nº 1, com **tabelas simples** atrás.

**Tabelas simples** saíram em 2026-08-03 e eram o nº 2 desta fila. O que o item obrigou a decidir
não foi o parser (o `|---|` estava previsto aqui) e sim **quem define o escopo de uma feature de
editor**: o serializer, não a UI. Markdown não escreve mesclagem, largura nem alinhamento, então
nada disso existe — e o custo de manter essa promessa foi uma invariante nova (toda tabela é
retangular, `fixTables` a cada transação), não uma exceção no sanitizador. Virou DECISIONS #37.
Isso muda a fila? **Sub-labels/pastas** fica sozinho no topo, e a seção 3.1 agora só tem
texto+checklist na mesma nota — o item que esbarra no modelo de uma checklist por nota, não no
vocabulário do corpo.

Depois disso, reavaliar: mixed text+checklist (G), OCR/transcrição, SSO OIDC (decisão de
DECISIONS antes).

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
