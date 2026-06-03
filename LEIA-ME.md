# Gestor de Menus — Cloudflare Pages

App de gestao de menus para restaurante, com cartazes automaticos, QR de reservas,
imagens (logo, fotos, fundos) e sincronizacao via Airtable + Cloudflare KV.

## Ficheiros

- index.html — a aplicacao principal.
- reservar.html — formulario publico de reservas (abre via QR).
- functions/api/reservar.js — grava reservas no Airtable.
- functions/api/menu.js — le config + menu (logo, pratos) para o formulario.
- functions/api/img-put.js — guarda uma imagem no KV, devolve um ID curto.
- functions/api/img/[id].js — devolve uma imagem do KV pelo ID.

## Como funcionam as imagens

As imagens (logotipo, fotos de pratos, fundos de festa) NAO cabem no Airtable.
Por isso sao guardadas no Cloudflare KV (armazenamento do Cloudflare) e o Airtable
guarda so uma referencia curta "img:ID". Assim sincronizam em todos os aparelhos
com qualidade, sem dar "Erro de sincronizacao".

---

## Instalacao (uma vez)

### 1. Projeto Pages
- dash.cloudflare.com -> Workers & Pages -> Create -> separador PAGES -> Upload assets.
- Nome: cafe-central (ou outro). Arrasta a PASTA COMPLETA (com functions). Deploy.

### 2. Variavel do token (para reservas e menu)
- Settings -> Environment variables -> Add: AIRTABLE_TOKEN = o teu token (pat...).
- Novo deploy para aplicar.

### 3. KV para imagens (IMPORTANTE — novo)
Sem este passo, as imagens nao sincronizam.
- No painel: Workers & Pages -> KV -> Create a namespace.
  - Da-lhe um nome, ex.: imagens-cafe-central. Create.
- Volta ao teu projeto Pages -> Settings -> Functions (ou Bindings) ->
  KV namespace bindings -> Add binding:
  - Variable name (EXATAMENTE): IMAGES
  - KV namespace: escolhe o que criaste (imagens-cafe-central).
  - Save.
- Faz um novo deploy (Deployments -> Retry deployment) para o binding valer.

### 4. Token no index.html
- Abre index.html, poe o token na linha const AIRTABLE_TOKEN = '...'. Republica.

### 5. Confirmar
- Abre https://<projeto>.pages.dev -> "Sincronizado".
- Definicoes -> Logotipo -> Carregar imagem. Deve dizer "A enviar..." e depois "✓".
  O topo fica "Sincronizado" (sem erro).
- Abre noutro aparelho -> o logotipo aparece sozinho.

---

## Notas

- Token nos dois sitios (index.html + variavel Cloudflare). Nunca o partilhes.
  Se for exposto, revoga em airtable.com/create/tokens e cria outro.
- Se carregares uma imagem e o topo ficar em "Erro", confirma que o binding KV
  se chama EXATAMENTE IMAGES e que fizeste novo deploy depois de o criar.
- Limites do plano gratis do Cloudflare (Pages + KV) sao muito altos — para um
  restaurante, na pratica nao se atingem.
