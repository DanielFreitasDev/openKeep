# Deploy nativo (VPS + systemd + Cloudflare Tunnel)

Este diretório documenta o deploy **nativo** do OpenKeep numa VPS Linux (Node 24 +
systemd), atrás de um **Cloudflare Tunnel** — nada é exposto publicamente; o túnel
alcança o app por `127.0.0.1:54322` (loopback). É uma alternativa ao Docker
(`docker/`), escolhida para conviver com outros serviços nativos no mesmo host.

Arquitetura: `Cloudflare Tunnel → http://localhost:54322 → openkeep.service (Node/Fastify)`.
O Fastify serve o SPA e a API na mesma origem (sem CORS). PostgreSQL local dedicado.

## Arquivos

| Arquivo | Destino na máquina | Descrição |
|---|---|---|
| `openkeep.service` | `/etc/systemd/system/openkeep.service` | Unit systemd (endurecida). |
| `openkeep.env.example` | `/etc/openkeep/openkeep.env` (600) | Modelo das variáveis. |
| `deploy.sh` | `/opt/openkeep/deploy.sh` (root, 0755) | Troca artefatos + restart + health-check + rollback. |
| `../.github/workflows/deploy-vps.yml` | — | CI/CD: build no runner self-hosted + deploy. |

## Primeira instalação (uma vez)

```bash
# 1) Runtime
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo corepack enable && sudo corepack prepare pnpm@11.17.0 --activate

# 2) Usuário de sistema + diretórios
sudo useradd -r -s /usr/sbin/nologin openkeep
sudo install -d -o root -g root -m 0755 /opt/openkeep
sudo install -d -o root -g root -m 0750 /etc/openkeep
sudo install -d -o openkeep -g openkeep -m 0750 /var/lib/openkeep

# 3) Banco de dados dedicado (PostgreSQL local)
sudo -u postgres psql -c "CREATE ROLE openkeep LOGIN PASSWORD '$(openssl rand -hex 24)';"
sudo -u postgres createdb -O openkeep openkeep

# 4) Variáveis (preencha DATABASE_URL, BETTER_AUTH_SECRET, APP_URL, VAPID)
sudo cp deploy/openkeep.env.example /etc/openkeep/openkeep.env
sudo chmod 600 /etc/openkeep/openkeep.env
sudoedit /etc/openkeep/openkeep.env

# 5) deploy.sh + sudoers (o runner roda só este script como root, sem senha)
sudo cp deploy/deploy.sh /opt/openkeep/deploy.sh
sudo chown root:root /opt/openkeep/deploy.sh && sudo chmod 0755 /opt/openkeep/deploy.sh
echo 'RUNNER_USER ALL=(root) NOPASSWD: /opt/openkeep/deploy.sh' | sudo tee /etc/sudoers.d/openkeep-deploy
sudo chmod 0440 /etc/sudoers.d/openkeep-deploy

# 6) Unit systemd
sudo cp deploy/openkeep.service /etc/systemd/system/openkeep.service
sudo systemctl daemon-reload && sudo systemctl enable openkeep
```

Faça um primeiro build/instalação manual dos artefatos (ou dispare o workflow
`Deploy VPS (native)` pelo botão **Run workflow**), depois `sudo systemctl start openkeep`
e confira `curl -fsS http://127.0.0.1:54322/api/readyz`.

## Cloudflare Tunnel

No painel **Zero Trust → Networks → Tunnels → (seu túnel) → Public Hostname**, adicione:

- **Subdomain**: `openkeep` · **Domain**: `cepify.com.br`
- **Service**: `HTTP` → `localhost:54322`

Isso cria o registro DNS automaticamente. WebSocket (`/api/ws`) é suportado nativamente.

## Deploy automático (CI/CD)

Um **runner self-hosted** (label `openkeep`) roda na VPS como serviço. A cada push
na `main`, quando o workflow **CI** passa, o **Deploy VPS (native)** dispara: o runner
faz `pnpm build` + `pnpm deploy --prod` (arm64), monta o build e chama
`sudo /opt/openkeep/deploy.sh`, que troca os artefatos, reinicia o serviço, confere
a saúde e faz **rollback** se a nova versão não subir.

Registrar o runner (uma vez):

```bash
mkdir -p ~/actions-runner-openkeep && cd ~/actions-runner-openkeep
curl -fsSLo runner.tar.gz https://github.com/actions/runner/releases/download/v2.334.0/actions-runner-linux-arm64-2.334.0.tar.gz
tar xzf runner.tar.gz
./config.sh --url https://github.com/DanielFreitasDev/openKeep \
  --token <TOKEN_DE_REGISTRO> --name openkeep-vps --labels openkeep --unattended --replace
sudo ./svc.sh install $USER && sudo ./svc.sh start
```

> Atualizar o `deploy.sh` ou a unit: edite aqui, dê commit, e copie manualmente para
> a máquina (`sudo cp`). O workflow **não** sobrescreve esses arquivos root — ele só
> troca `dist/`, `drizzle/`, `web-dist/` e `node_modules/` em `/opt/openkeep`.
