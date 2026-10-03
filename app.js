// ============================================================
//  GGList — frontend (HTML/CSS/JS puro) — versão 3 (visual do Figma)
// ============================================================

// URL do Web App do Apps Script (termina em /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbw_zU5IVqbycYB3-1cUAVYNQBOOES1dmdJRhBgFdy2PUu0XgNKXxqJ4ypAsy70z4D7vrw/exec';

// Estado em memória
//   jogos:  lista vinda da API
//   aba:    'ativos' | 'reviews' | 'todos'
//   aberto: id do jogo aberto no painel de detalhes (ou null)
//   det:    detalhes já carregados (Steam + IsThereAnyDeal), por id de jogo
const estado = { telefone: '', nome: '', membros: [], jogos: [], aba: 'ativos', aberto: null, det: {} };

const TEXTO_DICA_POSSE =
  'Sinaliza se você já tem este jogo. Quem já tem não recebe alerta de preço. ' +
  'Quando todos que deram 👍 já tiverem, o jogo vai para Reviews.';

// Jogos usados só como decoração na tela de entrada (pôsteres da Steam)
const COLAGEM_APPIDS = [1245620, 1086940, 1091500, 1145360, 2358720, 1593500, 367520, 413150, 1174180];

// ---------- Utilidades ----------

const $ = (id) => document.getElementById(id);

/** Escapa texto antes de colocar em HTML (evita injeção de código). */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** A Steam devolve textos com entidades HTML (&quot;). Converte antes de escapar. */
function decodificar(s) {
  return String(s ?? '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Só deixa passar links http(s) (bloqueia "javascript:" etc.). */
function seguro(url) {
  return /^https?:\/\//i.test(String(url || '')) ? url : '';
}

/** Centavos -> "R$ 49,90" */
function reais(centavos) {
  if (centavos === null || centavos === undefined) return '—';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "49,90" ou "1.049,90" -> 4990 (centavos inteiros). Retorna 0 se inválido. */
function paraCentavos(texto) {
  let s = String(texto).replace(/[^\d,.]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Data ISO (UTC) -> horário de São Paulo para exibir. */
function dataBR(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

/** "2026-10-03" -> "03/10" */
function dataCurta(d) {
  const p = String(d || '').split('-');
  return p.length === 3 ? p[2] + '/' + p[1] : d;
}

/** 4.5 -> "4,5" */
function notaFmt(n) {
  return Number(n).toFixed(1).replace('.', ',');
}

let timerMensagem;
function mostrarMensagem(texto, tipo) {
  const el = $('mensagem');
  el.textContent = texto;
  el.className = 'mensagem ' + (tipo || '');
  el.hidden = false;
  clearTimeout(timerMensagem);
  timerMensagem = setTimeout(() => { el.hidden = true; }, 5000);
}

// ---------- Avatares e ícones ----------

const CORES = ['#7c3aed', '#06b6d4', '#f59e0b', '#ec4899', '#22c55e', '#3b82f6'];

function corDe(nome) {
  let h = 0;
  for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

function iniciais(nome) {
  const p = String(nome).trim().split(/\s+/);
  return (((p[0] || '?')[0]) + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function avatar(nome, tam) {
  return `<span class="avatar" style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.38)}px;background:${corDe(nome)}" title="${esc(nome)}">${esc(iniciais(nome))}</span>`;
}

function faisca(tam, cor, animar) {
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" class="${animar ? 'sparkle-anim' : ''}"><path d="M12 2L13.8 9.2L21 8.5L15.5 13.2L18.5 20.5L12 16.8L5.5 20.5L8.5 13.2L3 8.5L10.2 9.2Z" fill="${cor}"/></svg>`;
}

// ---------- Imagens (pôster da Steam, com alternativas) ----------

/**
 * O design usa pôsteres 2:3. A Steam tem esse formato ("library_600x900").
 * Se falhar, tentamos outro endereço e por fim a capa horizontal.
 */
function imgPoster(j, classe) {
  const id = j.steam_appid;
  const src = id
    ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`
    : j.capa_url;
  const fb = id ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg` : '';
  return `<img class="${classe || ''}" src="${esc(src)}" data-fb="${esc(fb)}" data-fb2="${esc(j.capa_url)}" alt="" loading="lazy">`;
}

// Erros de imagem não "sobem" na página: precisamos ouvir na fase de captura
document.addEventListener('error', (ev) => {
  const el = ev.target;
  if (!el || el.tagName !== 'IMG') return;
  if (el.dataset.fb) { const n = el.dataset.fb; el.dataset.fb = ''; el.src = n; }
  else if (el.dataset.fb2) { const n = el.dataset.fb2; el.dataset.fb2 = ''; el.src = n; }
  else el.style.visibility = 'hidden';
}, true);

// ---------- Regras de exibição ----------

/** Objetivo do grupo: média dos alvos (2+) ou o alvo único. */
function metaDoJogo(j) {
  if (j.alvo_medio !== null) return j.alvo_medio;
  if (j.alvos.length === 1) return j.alvos[0].centavos;
  return null;
}

/** Quanto do caminho (preço cheio -> alvo) já foi percorrido, de 0 a 100. */
function pct(atual, meta, original) {
  if (atual === null || meta === null) return 0;
  if (atual <= meta) return 100;
  const orig = Math.max(original || atual, atual);
  return Math.min(100, Math.max(0, ((orig - atual) / (orig - meta)) * 100));
}

function classeProgresso(p) {
  return p >= 100 ? 'atingido' : (p >= 75 ? 'perto' : '');
}

/** Alerta "ativo" para você: preço já está no alvo do grupo ou no seu. */
function tipoAlerta(j) {
  if (j.meu_tem || j.preco_atual_centavos === null || j.meu_alvo === null) return null;
  if (j.alvo_medio !== null && j.preco_atual_centavos <= j.alvo_medio) return 'grupo';
  if (j.preco_atual_centavos <= j.meu_alvo) return 'individual';
  return null;
}

// ---------- Chamada à API ----------

/**
 * Envia um POST para o Apps Script.
 * TRUQUE DO CORS: usamos Content-Type "text/plain". Com "application/json"
 * o navegador faria uma requisição de pré-verificação (OPTIONS) que o
 * Apps Script não sabe responder, e a chamada seria bloqueada.
 * O corpo continua sendo JSON; o Apps Script lê com JSON.parse.
 */
async function chamarApi(acao, dados = {}) {
  if (API_URL.startsWith('COLE_AQUI')) {
    throw new Error('Configure a API_URL no app.js (veja o passo a passo).');
  }
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ acao, telefone: estado.telefone, ...dados })
  });
  const json = await resp.json();
  if (!json.ok) throw new Error(json.erro || 'Erro desconhecido.');
  return json;
}

// ---------- Login ----------

function montarColagem() {
  $('colagem').innerHTML = COLAGEM_APPIDS.map((id) =>
    `<div><img src="https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg"
      data-fb="https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg" alt="" loading="lazy"></div>`).join('');
}

async function entrar(telefone, lembrar) {
  estado.telefone = telefone;
  const r = await chamarApi('login');
  estado.nome = r.nome;
  estado.membros = r.membros || [];
  if (lembrar) {
    try { localStorage.setItem('ggl_telefone', telefone); } catch (e) { /* ignora */ }
  }
  $('tela-login').hidden = true;
  $('tela-app').hidden = false;
  await recarregar();
}

function sair() {
  try { localStorage.removeItem('ggl_telefone'); } catch (e) { /* ignora */ }
  estado.telefone = '';
  estado.jogos = [];
  estado.det = {};
  fecharPainel();
  $('tela-app').hidden = true;
  $('tela-login').hidden = false;
}

// ---------- Galeria ----------

async function recarregar() {
  const r = await chamarApi('listar');
  estado.jogos = r.jogos;
  estado.membros = r.membros || estado.membros;
  desenhar();
}

function jogosDaAba() {
  return estado.jogos.filter((j) =>
    estado.aba === 'todos' ? true : (estado.aba === 'reviews' ? j.todos_tem : !j.todos_tem));
}

function desenhar() {
  // Barra lateral
  $('nome-usuario').textContent = estado.nome;
  $('sb-avatar').innerHTML = avatar(estado.nome, 32);
  $('sb-membros-lista').innerHTML = estado.membros.map((n) =>
    `<div class="membro-linha">${avatar(n, 28)}<span>${esc(n.split(' ')[0])}</span></div>`).join('');
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.aba === (estado.aba === 'reviews' ? 'reviews' : 'ativos'));
  });
  const nReviews = estado.jogos.filter((j) => j.todos_tem).length;
  $('badge-reviews').hidden = nReviews === 0;
  $('badge-reviews').textContent = nReviews;

  // Barra superior
  $('tb-avatares').innerHTML = estado.membros.slice(0, 6).map((n) => avatar(n, 20)).join('');
  $('tb-membros-texto').textContent = estado.membros.length + (estado.membros.length === 1 ? ' membro' : ' membros');
  const nAlertas = estado.jogos.filter((j) => !j.todos_tem && tipoAlerta(j)).length;
  $('tb-alertas').hidden = nAlertas === 0;
  $('tb-alertas').innerHTML = faisca(10, '#a78bfa', false) + ' ' + nAlertas + ' alerta' + (nAlertas > 1 ? 's' : '');
  document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === estado.aba));

  // Grade
  const lista = jogosDaAba();
  $('lista').innerHTML = lista.map(cartao).join('');
  $('vazio').hidden = lista.length > 0;
  $('lista').hidden = lista.length === 0;
  $('vazio-texto').textContent = estado.aba === 'reviews'
    ? 'Quando todo mundo que deu 👍 já tiver um jogo, ele aparece aqui para ser avaliado.'
    : 'Cole o link de um jogo da Steam e o grupo vota se vale comprar.';
  document.querySelector('#vazio .btn').hidden = estado.aba === 'reviews';

  if (estado.aberto) renderPainel();
}

function cartao(j) {
  const meta = metaDoJogo(j);
  const p = pct(j.preco_atual_centavos, meta, j.preco_regular_centavos);
  const alerta = tipoAlerta(j);
  const corAlerta = alerta === 'grupo' ? '#06b6d4' : '#f59e0b';

  return `
  <button class="card ${j.meu_tem ? 'tenho' : ''} ${estado.aberto === j.id ? 'selecionado' : ''}"
          data-acao="abrir" data-id="${esc(j.id)}" aria-label="Abrir detalhes de ${esc(j.nome)}">
    <div class="poster">
      ${imgPoster(j)}
      ${j.todos_tem ? `<div class="poster-todos"><div class="pilula-verde">Todos têm${j.nota_media !== null ? ' · ★ ' + notaFmt(j.nota_media) : ''}</div></div>` : ''}
      ${alerta ? `<div class="selo-alerta ${alerta}">${faisca(14, corAlerta, true)}</div>` : ''}
      ${j.meu_tem && !j.todos_tem ? '<div class="selo-tenho">📥 Você tem</div>' : ''}
      ${!j.todos_tem && meta !== null
        ? `<div class="poster-barra"><div class="trilho"><div class="progresso ${classeProgresso(p)}" style="width:${p}%"></div></div></div>` : ''}
    </div>
    <div class="card-info">
      <div class="card-titulo">${esc(j.nome)}</div>
      <div class="card-stats">
        <span>👍 ${j.votos_up.length}</span>
        <span>👎 ${j.votos_down.length}</span>
        <span>📥 ${j.nomes_tem.length}</span>
      </div>
      <div class="card-precos">
        <div>
          <div class="mini-rotulo">Steam agora</div>
          <span class="preco-card ${j.todos_tem ? 'verde' : ''}">${reais(j.preco_atual_centavos)}</span>
        </div>
        <div class="dir">
          <div class="mini-rotulo">Objetivo</div>
          <span class="preco-card suave">${meta !== null ? reais(meta) : '—'}</span>
        </div>
      </div>
    </div>
  </button>`;
}

// ---------- Painel de detalhes ----------

function fecharPainel() {
  estado.aberto = null;
  $('painel').hidden = true;
  document.body.classList.remove('painel-aberto');
  if (!$('tela-app').hidden) desenhar();
}

/** Abre o painel e busca os dados (Steam + IsThereAnyDeal) na API. */
async function abrirDetalhes(id, forcar) {
  estado.aberto = id;
  $('painel').hidden = false;
  document.body.classList.add('painel-aberto');

  if (estado.det[id] && !forcar) { desenhar(); return; }

  estado.det[id] = { carregando: true };
  desenhar();
  try {
    const r = await chamarApi('detalhes', { jogoId: id, forcar: !!forcar });
    estado.jogos = r.jogos;
    estado.det[id] = r.detalhes;
  } catch (e) {
    estado.det[id] = { erro: e.message };
  }
  desenhar();
}

function renderPainel() {
  const j = estado.jogos.find((x) => x.id === estado.aberto);
  if (!j) { fecharPainel(); return; }
  const det = estado.det[j.id] || { carregando: true };
  const antigo = document.querySelector('.painel-corpo');
  const rolagem = antigo ? antigo.scrollTop : 0;

  $('painel-conteudo').innerHTML =
    pHero(j) +
    `<div class="painel-corpo">` +
      pAlerta(j) + pInfo(j, det) + pProgresso(j) + pPosse(j) + pVotos(j) + pAlvos(j) +
      pHistorico(j) + pLojas(j, det) + pReview(j) +
    `</div>`;

  const novo = document.querySelector('.painel-corpo');
  if (novo) novo.scrollTop = rolagem;
}

function pHero(j) {
  const preco = j.preco_atual_centavos;
  const desconto = j.preco_regular_centavos && preco !== null && preco < j.preco_regular_centavos;
  return `
  <div class="hero">
    ${imgPoster(j, 'hero-fundo')}
    <div class="hero-degrade"></div>
    <div class="hero-conteudo">
      ${imgPoster(j, 'hero-poster')}
      <div class="hero-texto">
        <div class="hero-loja">STEAM</div>
        <div class="hero-titulo">${esc(j.nome)}</div>
        <div class="hero-preco">
          <b class="${j.todos_tem ? 'verde' : ''}">${reais(preco)}</b>
          ${desconto ? `<s>${reais(j.preco_regular_centavos)}</s>` : ''}
        </div>
      </div>
    </div>
    <button class="fechar" data-acao="fechar-painel" aria-label="Fechar">×</button>
  </div>`;
}

function pAlerta(j) {
  const a = tipoAlerta(j);
  if (!a || j.todos_tem) return '';
  return `<div class="alerta-faixa ${a}">${faisca(14, a === 'grupo' ? '#06b6d4' : '#f59e0b', true)}
    ${a === 'grupo' ? 'Alerta do grupo disparado' : 'Alerta pessoal disparado'}</div>`;
}

function pInfo(j, det) {
  const s = det.steam;
  const cross = s ? s.crossplay : (j.crossplay === 'SIM' ? true : (j.crossplay === 'NAO' ? false : null));
  const crossTxt = cross === null ? '—' : (cross ? 'Disponível' : 'Não disponível');
  const crossCls = cross ? 'verde' : 'suave';

  let extra = '';
  if (det.carregando) extra = '<p class="descricao">Carregando detalhes…</p>';
  else if (det.erro) extra = `<p class="erro-texto" style="margin-top:12px">${esc(det.erro)}</p>`;
  else if (!s) extra = `<p class="erro-texto" style="margin-top:12px">${esc(det.steam_erro || 'Sem dados da Steam.')}</p>`;
  else {
    const pcs = [s.pc.windows && 'Windows', s.pc.mac && 'Mac', s.pc.linux && 'Linux'].filter(Boolean);
    extra = `
      <div class="generos">${s.generos.map((g) => `<span class="genero">${esc(g)}</span>`).join('')}</div>
      <p class="descricao">${esc(decodificar(s.descricao))}</p>
      <p class="descricao">${s.desenvolvedoras.length ? esc(s.desenvolvedoras.join(', ')) + ' · ' : ''}PC: ${esc(pcs.join(', ') || '—')}</p>`;
  }

  return `
  <div class="bloco">
    <div class="info-topo">
      <div>
        <div class="mini-rotulo">Preço na Steam</div>
        <div class="grande">${reais(j.preco_atual_centavos)}</div>
      </div>
      <div class="dir">
        <div class="mini-rotulo">Disponível em</div>
        <div class="medio">Steam</div>
      </div>
    </div>
    <div class="info-grade">
      <div class="info-celula">
        <div class="mini-rotulo">Crossplay</div>
        <div class="v ${crossCls}" ${s || cross !== null ? 'data-dica="A Steam marca se o jogo tem multijogador entre plataformas. Isso não diz com quais plataformas específicas."' : ''}>${crossTxt}</div>
      </div>
      <div class="info-celula">
        <div class="mini-rotulo">Lançamento</div>
        <div class="v">${s && s.lancamento ? esc(s.lancamento) : '—'}</div>
      </div>
    </div>
    ${extra}
    <div class="acoes-linha">
      <a class="botao-link" href="${esc(seguro(j.loja_url))}" target="_blank" rel="noopener">Ver na Steam ↗</a>
      <button class="btn btn-sec btn-mini" data-acao="atualizar-det">Atualizar dados</button>
    </div>
  </div>`;
}

function pProgresso(j) {
  const meta = metaDoJogo(j);
  if (j.todos_tem || meta === null || j.preco_atual_centavos === null) return '';
  const p = pct(j.preco_atual_centavos, meta, j.preco_regular_centavos);
  const falta = j.preco_atual_centavos - meta;
  return `
  <div class="bloco">
    <div class="bloco-cab">
      <span class="rotulo">Progresso do grupo</span>
      <span class="valor-destaque" style="color:${falta > 0 ? 'var(--suave)' : 'var(--verde)'}">${falta > 0 ? 'faltam ' + reais(falta) : '✓ atingido!'}</span>
    </div>
    <div class="trilho fino"><div class="progresso ${classeProgresso(p)}" style="width:${p}%"></div></div>
    <div class="prog-rotulos">
      <span>${p >= 100 ? '✓ Alvo atingido' : Math.round(p) + '% do alvo'}</span>
      <b style="color:${p >= 100 ? 'var(--verde)' : 'var(--suave)'}">alvo ${reais(meta)}</b>
    </div>
  </div>`;
}

function pPosse(j) {
  const totalUp = j.votos_up.length;
  const upTem = j.votos_up.filter((n) => j.nomes_tem.includes(n)).length;
  const pessoas = estado.membros.map((n) => {
    const tem = j.nomes_tem.includes(n);
    return `<div class="pessoa ${tem ? 'sim' : ''}"><div class="av">${avatar(n, 28)}${tem ? '<span class="check">✓</span>' : ''}</div>
            <div class="nome">${esc(n.split(' ')[0])}</div></div>`;
  }).join('');
  return `
  <div class="bloco">
    <div class="bloco-cab">
      <span class="rotulo">Quem já tem</span>
      <span class="valor-destaque" style="color:${j.todos_tem ? 'var(--verde)' : 'var(--texto)'}">${totalUp ? upTem + '/' + totalUp : j.nomes_tem.length}</span>
    </div>
    <div class="pessoas">${pessoas}</div>
    <button class="toggle-posse ${j.meu_tem ? 'ativo' : ''}" data-acao="posse" aria-pressed="${j.meu_tem}"
            data-dica="${esc(TEXTO_DICA_POSSE)}">
      📥 ${j.meu_tem ? 'Eu já tenho este jogo' : 'Marcar que eu já tenho'}
    </button>
  </div>`;
}

function pVotos(j) {
  const linha = (n, v) => `<div class="linha-pessoa"><div class="quem">${avatar(n, 22)}<b>${esc(n.split(' ')[0])}</b></div><span>${v}</span></div>`;
  return `
  <div class="bloco">
    <span class="rotulo">Votos</span>
    <div class="votos-caixas">
      <button class="voto-caixa up ${j.meu_voto === 1 ? 'ativo' : ''}" data-acao="votar" data-voto="1" aria-pressed="${j.meu_voto === 1}">
        <span class="icone">👍</span><span><span class="n">${j.votos_up.length}</span><br><span class="t">toparam</span></span>
      </button>
      <button class="voto-caixa down ${j.meu_voto === -1 ? 'ativo' : ''}" data-acao="votar" data-voto="-1" aria-pressed="${j.meu_voto === -1}">
        <span class="icone">👎</span><span><span class="n">${j.votos_down.length}</span><br><span class="t">não toparam</span></span>
      </button>
    </div>
    ${j.votos_up.map((n) => linha(n, '👍')).join('')}
    ${j.votos_down.map((n) => linha(n, '👎')).join('')}
    <p class="texto-mudo">${j.meu_voto === 0 ? 'Dê 👍 para poder definir seu preço-alvo. ' : ''}Clique no seu voto de novo para removê-lo.</p>
  </div>`;
}

function pAlvos(j) {
  if (j.meu_voto !== 1) return '';
  if (j.meu_tem) {
    return `<div class="bloco"><p class="ajuda-texto">Você já tem este jogo, então não recebe alertas de preço e fica fora da média do grupo.</p></div>`;
  }
  const valor = j.meu_alvo ? (j.meu_alvo / 100).toFixed(2).replace('.', ',') : '';
  const outros = j.alvos.filter((a) => a.nome !== estado.nome);
  return `
  <div class="bloco">
    <span class="rotulo">Preços-alvo</span>
    <div class="meu-alvo">
      <div class="quem">${avatar(estado.nome, 22)}<span>Meu alvo</span></div>
      <div class="campo"><span>R$</span>
        <input class="campo-alvo" type="text" inputmode="decimal" placeholder="0,00" value="${esc(valor)}" aria-label="Meu preço-alvo">
        <button class="btn btn-mini" data-acao="alvo">OK</button>
      </div>
    </div>
    ${outros.map((a) => `<div class="linha-pessoa"><div class="quem">${avatar(a.nome, 22)}<b>${esc(a.nome.split(' ')[0])}</b></div><span class="v">${reais(a.centavos)}</span></div>`).join('')}
    ${j.alvo_medio !== null
      ? `<div class="linha-pessoa total"><div class="quem">Média do grupo</div><span class="v">${reais(j.alvo_medio)}</span></div>`
      : `<p class="texto-mudo">A média do grupo aparece quando 2 ou mais pessoas definem alvo.</p>`}
  </div>`;
}

function pHistorico(j) {
  const h = j.historico || [];
  if (h.length < 2) {
    return `<div class="bloco"><span class="rotulo">Histórico de preço</span>
      <p class="ajuda-texto">O histórico é registrado uma vez por dia. Em alguns dias o gráfico aparece aqui.</p></div>`;
  }
  const precos = h.map((x) => x.p);
  const min = Math.min(...precos) * 0.95;
  const max = Math.max(...precos) * 1.02;
  const faixa = max - min || 1;
  const w = 400, alt = 80;
  const pontos = h.map((x, i) => `${(i / (h.length - 1)) * w},${alt - ((x.p - min) / faixa) * alt}`).join(' ');
  const bolinhas = h.map((x, i) =>
    `<circle cx="${(i / (h.length - 1)) * w}" cy="${alt - ((x.p - min) / faixa) * alt}" r="3.5" fill="#7c3aed"/>`).join('');
  return `
  <div class="grafico">
    <div class="grafico-topo"><span class="rotulo">Histórico de preço</span><b>${reais(precos[precos.length - 1])}</b></div>
    <svg viewBox="0 0 ${w} ${alt}" preserveAspectRatio="none">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.25"/><stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
      </linearGradient></defs>
      <polyline points="${pontos}" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <polygon points="0,${alt} ${pontos} ${w},${alt}" fill="url(#cg)"/>
      ${bolinhas}
    </svg>
    <div class="grafico-datas"><span>${esc(dataCurta(h[0].d))}</span><span>${esc(dataCurta(h[h.length - 1].d))}</span></div>
  </div>`;
}

function blocoConsole(j, det, plataforma, rotulo) {
  const c = j.consoles.find((x) => x.plataforma === plataforma);
  const buscaUrl = seguro(det && det.busca ? det.busca[plataforma] : '');
  const resumo = c
    ? `<b>${c.preco_centavos !== null ? reais(c.preco_centavos) : 'sem preço'}</b>
       <span class="etiqueta">${c.origem === 'auto' ? 'automático' : 'manual'}</span>
       ${seguro(c.url) ? `<a href="${esc(seguro(c.url))}" target="_blank" rel="noopener">abrir loja ↗</a>` : ''}
       ${c.atualizado_em ? `<span class="ajuda-texto"> · ${esc(dataBR(c.atualizado_em))}</span>` : ''}`
    : '<span class="ajuda-texto">Ainda não cadastrado</span>';
  const refAtual = c ? (plataforma === 'switch' ? (c.url || c.nsuid) : c.url) : '';

  return `
  <div class="console" data-plataforma="${plataforma}">
    <div><b>${rotulo}</b> — ${resumo}</div>
    <div class="campos">
      <input class="ref" type="text" value="${esc(refAtual)}"
             placeholder="${plataforma === 'switch' ? 'Link da eShop ou NSUID (14 dígitos)' : 'Link do jogo na PlayStation Store'}">
      <input class="valor" type="text" inputmode="decimal" placeholder="Preço (opcional)">
    </div>
    <div class="botoes">
      <button class="btn btn-mini" data-acao="salvar-console">Salvar</button>
      ${plataforma === 'playstation' ? '<button class="btn btn-sec btn-mini" data-acao="buscar-ps">Buscar automático</button>' : ''}
      ${c ? '<button class="btn btn-sec btn-mini" data-acao="remover-console">Remover</button>' : ''}
      ${buscaUrl ? `<a href="${esc(buscaUrl)}" target="_blank" rel="noopener">Abrir busca na loja ↗</a>` : ''}
    </div>
    <div class="aviso-texto">
      ${plataforma === 'switch'
        ? 'Com o link ou NSUID, o preço é buscado e atualizado sozinho (confira na loja). Se digitar o preço, ele fica manual.'
        : 'A busca automática da PlayStation Store é uma tentativa e pode não funcionar. Se não achar, cole o link ou digite o preço.'}
    </div>
  </div>`;
}

function pLojas(j, det) {
  let ofertas = '';
  if (det.carregando) ofertas = '<p class="ajuda-texto">Consultando o IsThereAnyDeal…</p>';
  else if (det.itad && det.itad.erro) ofertas = `<p class="erro-texto">Não consegui consultar agora: ${esc(det.itad.erro)}</p>`;
  else if (det.itad) {
    const it = det.itad;
    ofertas = (it.ofertas.map((o, i) => {
      const link = seguro(o.url);
      const loja = link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(o.loja)}</a>` : esc(o.loja);
      return `<div class="linha-preco"><span>${loja}${o.desconto ? ` <span class="ajuda-texto">-${o.desconto}%</span>` : ''}</span>
              <span class="${i === 0 ? 'melhor' : ''}">${reais(o.preco)}</span></div>`;
    }).join('') || '<p class="ajuda-texto">Nenhuma oferta encontrada.</p>') +
      (it.menor_historico !== null && it.menor_historico !== undefined
        ? `<p class="texto-mudo">Menor preço histórico: ${reais(it.menor_historico)}. Só lojas de PC.</p>` : '');
  }

  return `
  <div class="bloco">
    <span class="rotulo">Preços nas lojas</span>
    <div class="linha-preco"><span>Steam (PC)</span><span><b>${reais(j.preco_atual_centavos)}</b></span></div>
    <div class="sub-titulo">Consoles</div>
    ${blocoConsole(j, det, 'playstation', 'PlayStation')}
    ${blocoConsole(j, det, 'switch', 'Nintendo Switch')}
    <div class="sub-titulo">Onde está mais barato (IsThereAnyDeal)</div>
    ${ofertas}
  </div>`;
}

function pReview(j) {
  if (!j.meu_tem) return '';
  if (!j.todos_tem) {
    return `<div class="bloco-verde-texto"><b>✓ Você já tem este jogo</b><span>As avaliações abrem quando todos que deram 👍 tiverem.</span></div>`;
  }
  const minha = j.minha_review;
  const nota = minha ? minha.nota : 0;
  const outras = j.reviews.filter((r) => r.nome !== estado.nome).map((r) => `
    <div class="review-item">
      <div class="topo"><div class="quem">${avatar(r.nome, 22)}<span>${esc(r.nome.split(' ')[0])}</span></div>
        <span class="nota">★ ${notaFmt(r.nota)}</span></div>
      ${r.comentario ? `<p>${esc(r.comentario)}</p>` : ''}
    </div>`).join('');
  return `
  <div class="bloco verde">
    <div class="bloco-cab">
      <div><span class="rotulo" style="margin:0">Avaliação do grupo</span>
        <span class="texto-mudo" style="display:block;margin:0">${j.reviews.length} avaliações</span></div>
      <div class="nota-grande">★ ${j.nota_media !== null ? notaFmt(j.nota_media) : '—'}</div>
    </div>
    ${outras}
    <div class="review-form">
      <div class="minha-nota-topo"><label for="my-rating">Minha nota</label>
        <span id="rev-valor">${nota ? '★ ' + notaFmt(nota) : 'Sem nota'}</span></div>
      <input id="my-rating" class="rev-nota" type="range" min="0" max="5" step="0.5" value="${nota}"
             aria-label="Nota de zero a cinco, em intervalos de meia estrela">
      <textarea class="rev-texto" rows="3" maxlength="500" placeholder="Conte ao grupo o que achou...">${esc(minha ? minha.comentario : '')}</textarea>
      <button id="rev-salvar" class="btn" data-acao="salvar-review" ${nota ? '' : 'disabled'}>${minha ? 'Atualizar avaliação' : 'Publicar avaliação'}</button>
      ${minha ? '<button class="btn btn-sec btn-mini" data-acao="apagar-review">Apagar minha avaliação</button>' : ''}
    </div>
  </div>`;
}

// ---------- Ações ----------

/** Executa uma ação na API, mostra o resultado e redesenha a tela. */
async function executar(acao, dados, textoOk) {
  try {
    const r = await chamarApi(acao, dados);
    estado.jogos = r.jogos;
    desenhar();
    if (textoOk) mostrarMensagem(textoOk, 'ok');
    return true;
  } catch (e) {
    mostrarMensagem(e.message, 'erro');
    return false;
  }
}

/** Marca/desmarca "já tenho" e avisa se o jogo mudou para Reviews. */
async function alternarPosse(jogoId) {
  const jogo = estado.jogos.find((j) => j.id === jogoId);
  const vaiTer = !jogo.meu_tem;
  const ok = await executar('alternarPosse', { jogoId, tem: vaiTer });
  if (!ok) return;
  const novo = estado.jogos.find((j) => j.id === jogoId);
  if (vaiTer && novo.todos_tem) {
    mostrarMensagem('Todo mundo que deu 👍 já tem este jogo: ele foi para Reviews.', 'ok');
  } else {
    mostrarMensagem(vaiTer ? 'Marcado. Você não receberá alertas deste jogo.' : 'Desmarcado.', 'ok');
  }
}

function abrirAdd() {
  $('modal-add').hidden = false;
  $('url-steam').focus();
}
function fecharAdd() {
  $('modal-add').hidden = true;
}

// ---------- Eventos ----------

$('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = ev.target.querySelector('button');
  botao.disabled = true;
  try {
    await entrar($('telefone').value, true);
  } catch (e) {
    mostrarMensagem(e.message, 'erro');
  }
  botao.disabled = false;
});

$('btn-sair').addEventListener('click', sair);

$('form-adicionar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = ev.target.querySelector('button[type=submit]');
  botao.disabled = true;
  botao.textContent = 'Buscando...';
  const ok = await executar('adicionarJogo', { url: $('url-steam').value }, 'Jogo adicionado!');
  if (ok) {
    $('url-steam').value = '';
    fecharAdd();
    estado.aba = 'ativos';
    desenhar();
  }
  botao.disabled = false;
  botao.textContent = 'Adicionar ao grupo →';
});

document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (!$('modal-add').hidden) fecharAdd();
  else if (estado.aberto) fecharPainel();
});

// A nota é um controle deslizante: atualiza o texto e o botão enquanto arrasta
document.addEventListener('input', (ev) => {
  if (!ev.target.classList || !ev.target.classList.contains('rev-nota')) return;
  const v = Number(ev.target.value);
  $('rev-valor').textContent = v ? '★ ' + notaFmt(v) : 'Sem nota';
  $('rev-salvar').disabled = !v;
});

/** Ações dos botões dentro do painel de detalhes. */
async function acaoPainel(botao, acao) {
  const jogoId = estado.aberto;
  const bloco = botao.closest('.console');
  const plataforma = bloco ? bloco.dataset.plataforma : '';
  const jogo = estado.jogos.find((j) => j.id === jogoId);

  switch (acao) {
    case 'fechar-painel':
      fecharPainel();
      break;
    case 'atualizar-det':
      await abrirDetalhes(jogoId, true);
      break;
    case 'posse':
      await alternarPosse(jogoId);
      break;
    case 'votar': {
      const voto = Number(botao.dataset.voto);
      // Clicar de novo no mesmo voto remove o voto
      await executar('votar', { jogoId, voto: jogo.meu_voto === voto ? 0 : voto });
      break;
    }
    case 'alvo': {
      const centavos = paraCentavos(document.querySelector('.campo-alvo').value);
      await executar('definirAlvo', { jogoId, centavos }, centavos ? 'Preço-alvo salvo.' : 'Preço-alvo removido.');
      break;
    }
    case 'salvar-console':
      await executar('salvarConsole', {
        jogoId, plataforma,
        ref: bloco.querySelector('.ref').value,
        centavos: paraCentavos(bloco.querySelector('.valor').value)
      }, 'Salvo. Confira o preço na loja.');
      break;
    case 'remover-console':
      await executar('removerConsole', { jogoId, plataforma }, 'Removido.');
      break;
    case 'buscar-ps':
      botao.disabled = true;
      botao.textContent = 'Buscando...';
      await executar('buscarPlaystation', { jogoId }, 'Encontrado na PlayStation Store. Confira o preço.');
      break;
    case 'salvar-review':
      await executar('salvarReview', {
        jogoId,
        nota: Number(document.querySelector('.rev-nota').value),
        comentario: document.querySelector('.rev-texto').value
      }, 'Avaliação salva.');
      break;
    case 'apagar-review':
      await executar('salvarReview', { jogoId, nota: 0, comentario: '' }, 'Avaliação apagada.');
      break;
  }
}

// Um único "ouvinte" para todos os botões da tela
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-acao]');
  if (!el) return;
  const acao = el.dataset.acao;

  if (el.closest('#painel')) { await acaoPainel(el, acao); return; }

  switch (acao) {
    case 'abrir':
      if (estado.aberto === el.dataset.id) fecharPainel();
      else await abrirDetalhes(el.dataset.id, false);
      break;
    case 'aba':
      estado.aba = el.dataset.aba;
      desenhar();
      break;
    case 'nav':
      estado.aba = el.dataset.aba;
      desenhar();
      break;
    case 'recarregar':
      try { await recarregar(); } catch (e) { mostrarMensagem(e.message, 'erro'); }
      break;
    case 'abrir-add':
      abrirAdd();
      break;
    case 'fechar-add':
      fecharAdd();
      break;
  }
});

// ---------- Início ----------

montarColagem();

(async function iniciar() {
  let salvo = '';
  try { salvo = localStorage.getItem('ggl_telefone') || ''; } catch (e) { /* ignora */ }
  if (!salvo) return;
  try {
    await entrar(salvo, false);
  } catch (e) {
    sair(); // telefone salvo deixou de valer
  }
})();
