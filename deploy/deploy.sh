#!/usr/bin/env bash
#
# deploy.sh -- instala um novo build do OpenKeep e reinicia o serviço, com health-check e rollback.
#
# Rodado pelo runner self-hosted (job "deploy" em .github/workflows/deploy-vps.yml) via sudo:
#   sudo /opt/openkeep/deploy.sh <dir_do_build>
# onde <dir_do_build> contém: dist/ drizzle/ web-dist/ node_modules/
#
# IMPORTANTE: roda como root; deve ser dono de root e NÃO gravável pelo usuário do runner
# (senão o runner poderia reescrever o que executa como root). Regra em /etc/sudoers.d/openkeep-deploy.
set -euo pipefail

APP=/opt/openkeep
BAK=/opt/openkeep.bak
SVC=openkeep
HEALTH="http://127.0.0.1:54322/api/readyz"
PARTES=(dist drizzle web-dist node_modules)

log() { echo "[deploy] $*"; }

SRC="${1:-}"
[ -n "$SRC" ] || { log "ERRO: uso: $0 <dir_do_build>"; exit 2; }
for d in "${PARTES[@]}"; do
  [ -e "$SRC/$d" ] || { log "ERRO: build incompleto, falta '$d' em $SRC"; exit 2; }
done

aguardar_saude() {
  for i in $(seq 1 60); do
    if curl -fs --max-time 5 "$HEALTH" 2>/dev/null | grep -q '"status":"ok"'; then
      log "saúde OK na tentativa $i/60."; return 0
    fi
    sleep 2
  done
  return 1
}

# 1) Backup da versão atual (para rollback).
rm -rf "$BAK"; mkdir -p "$BAK"
for d in "${PARTES[@]}"; do [ -e "$APP/$d" ] && cp -a "$APP/$d" "$BAK/$d"; done
log "backup da versão atual em $BAK"

# 2) Instala o novo build (copia p/ .new e faz swap). O processo em execução mantém os inodes
#    antigos abertos até o restart, então remover os diretórios agora é seguro.
for d in "${PARTES[@]}"; do rm -rf "$APP/$d.new"; cp -a "$SRC/$d" "$APP/$d.new"; done
for d in "${PARTES[@]}"; do rm -rf "$APP/$d"; mv "$APP/$d.new" "$APP/$d"; done
chown -R root:root "${PARTES[@]/#/$APP/}"
chmod -R go-w "${PARTES[@]/#/$APP/}"
log "novo build instalado em $APP"

# 3) Reinicia e valida (migrations rodam no boot).
systemctl restart "$SVC"
log "serviço reiniciado; aguardando $HEALTH ..."
if aguardar_saude; then
  log "deploy concluído com sucesso."
  exit 0
fi

# 4) Falhou: rollback com re-verificação.
log "ERRO: serviço não ficou saudável; executando rollback..."
for d in "${PARTES[@]}"; do
  [ -e "$BAK/$d" ] && { rm -rf "$APP/$d"; cp -a "$BAK/$d" "$APP/$d"; }
done
systemctl restart "$SVC"
if aguardar_saude; then
  log "rollback aplicado; versão anterior saudável no ar. Investigue: journalctl -u $SVC -n 100"
else
  log "ALERTA: rollback aplicado mas serviço NÃO voltou saudável -- intervenção manual! journalctl -u $SVC -n 200"
fi
exit 1
