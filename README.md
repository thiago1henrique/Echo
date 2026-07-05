# Recap musical

Gera um resumo de escuta a partir do **Last.fm** ou do **Spotify** e exporta PNGs
prontos para **story do Instagram** (1080×1920) e **feed do Twitter** (1600×900).

Feito porque o Apple Music não tem recap mensal — mas o Last.fm scrobbla tudo.

## O que mostra

- **Topo:** artista mais ouvido (com foto real do artista).
- **Colunas:** top 5 artistas (esq.) e top 5 músicas (dir.).
- **Rodapé:** minutos ouvidos (estimados) — só no Last.fm; veja as notas abaixo.
- **Fonte:** seletor Last.fm / Spotify.
- **Período:** Semana / Mês / Ano / Sempre (Last.fm); 4 semanas / 6 meses / 1 ano (Spotify).
- **Exportar:** botões para baixar o PNG em cada formato.

## Rodando

```bash
pnpm install
pnpm dev
```

### Last.fm (API key)

Crie uma chave em <https://www.last.fm/api/account/create>. Duas formas de usar:

1. **Na UI:** cole a chave no campo que aparece na tela (fica salva no navegador).
2. **Via arquivo:** copie `.env.example` para `.env` e preencha
   `VITE_LASTFM_API_KEY`.

Depois é só informar o **usuário** do Last.fm e gerar.

### Spotify (login OAuth)

1. Crie um app em <https://developer.spotify.com/dashboard>.
2. Em **Redirect URIs**, cadastre a URL onde o site roda — ex.:
   `http://localhost:5173/` em dev, ou a URL publicada.
3. Copie o **Client ID** para `VITE_SPOTIFY_CLIENT_ID` (ou cole na UI).
4. Clique em **Conectar Spotify** e autorize. O login usa o fluxo
   Authorization Code + **PKCE**, 100% no navegador (sem client secret / backend).

## Notas técnicas (limitações das APIs)

- **Foto do artista (Last.fm):** o Last.fm descontinuou as imagens de artista
  (só devolve um placeholder). As fotos vêm do **Deezer** (via JSONP, sem backend).
  No Spotify as imagens já vêm da própria API.
- **Minutos e nº de plays:** o Last.fm não expõe tempo real de escuta — os
  minutos são uma **estimativa** (nº de scrobbles no período × duração média das
  faixas). O **Spotify não expõe nem play count nem minutos** pela API pública
  (só listas rankeadas), então no modo Spotify esses números não aparecem.
- **Períodos do Spotify:** só há três janelas fixas — `short_term` (~4 semanas),
  `medium_term` (~6 meses) e `long_term` (~1 ano). Não existe visão semanal.
- **Export PNG:** as imagens passam pelo proxy `images.weserv.nl` para serem
  servidas com CORS, evitando o "canvas tainted" na hora de gerar o PNG.

## Estrutura

- `src/lib/lastfm.ts` — cliente da API do Last.fm + montagem do recap.
- `src/lib/spotify.ts` — auth OAuth (PKCE) + montagem do recap do Spotify.
- `src/lib/images.ts` — foto do artista (Deezer) e proxy de imagens.
- `src/lib/exportPng.ts` — export com `html-to-image`.
- `src/components/RecapCard.tsx` — o card compartilhável (variantes story/feed).
- `src/App.tsx` — UI (fonte, usuário/login, período, exportação, preview).

O visual é intencionalmente neutro — a identidade visual será refinada depois.
