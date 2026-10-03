// ============================================================
//  GGList — frontend (HTML/CSS/JS puro)  — versão 2
// ============================================================

// URL do Web App do Apps Script (termina em /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbw_zU5IVqbycYB3-1cUAVYNQBOOES1dmdJRhBgFdy2PUu0XgNKXxqJ4ypAsy70z4D7vrw/exec';

// Estado em memória
//   jogos:  lista vinda da API
//   aberto: id do jogo aberto na tela de detalhes (ou null)
//   det:    detalhes já carregados, por id de jogo
const estado = { telefone: '', jogos: [], aberto: null, det: {} };

const TEXTO_DICA_POSSE =
  'Sinaliza se você já tem este jogo. Quem já tem não recebe alerta de preço. ' +
  'Quando todos que deram 👍 já tiverem, o jogo vai para Reviews.';

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

let timerMensagem;
function mostrarMensagem(texto, tipo) {
  const el = $('mensagem');
  el.textContent = texto;
  el.className = 'mensagem ' + (tipo || '');
  el.hidden = false;
  clearTimeout(timerMensagem);
  timerMensagem = setTimeout(() => { el.hidden = true; }, 5000);
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

async function entrar(telefone, lembrar) {
  estado.telefone = telefone;
  const r = await chamarApi('login');
  if (lembrar) {
    try { localStorage.setItem('ggl_telefone', telefone); } catch (e) { /* ignora */ }
  }
  $('nome-usuario').textContent = r.nome;
  $('usuario').hidden = false;
  $('tela-login').hidden = true;
  $('tela-app').hidden = false;
  await recarregar();
}

function sair() {
  try { localStorage.removeItem('ggl_telefone'); } catch (e) { /* ignora */ }
  estado.telefone = '';
  estado.jogos = [];
  estado.det = {};
  fecharModal();
  $('usuario').hidden = true;
  $('tela-app').hidden = true;
  $('tela-login').hidden = false;
}

// ---------- Lista principal e Reviews ----------

async function recarregar() {
  const r = await chamarApi('listar');
  estado.jogos = r.jogos;
  desenhar();
}

function desenhar() {
  // Na lista principal ficam os jogos que ainda não foram "zerados" por todos os 👍
  const naLista = estado.jogos.filter((j) => !j.todos_tem);
  const emReviews = estado.jogos.filter((j) => j.todos_tem);
  $('lista').innerHTML = naLista.map(cartaoJogo).join('');
  $('vazio').hidden = naLista.length > 0;
  $('bloco-reviews').hidden = emReviews.length === 0;
  $('lista-reviews').innerHTML = emReviews.map(cartaoReview).join('');
  if (estado.aberto) renderModal();
}

/** Chips do cartão: cross-play e preços de PlayStation/Switch. */
function chipsJogo(j) {
  const chips = [];
  if (j.crossplay === 'SIM') {
    chips.push('<span class="chip cp" title="A Steam marca este jogo como multijogador multiplataforma">Cross-play</span>');
  }
  j.consoles.forEach((c) => {
    const nome = c.plataforma === 'playstation' ? 'PlayStation' : 'Switch';
    const classe = c.plataforma === 'playstation' ? 'ps' : 'sw';
    const rotulo = nome + (c.preco_centavos !== null ? ' ' + reais(c.preco_centavos) : '');
    const link = seguro(c.url);
    chips.push(link
      ? `<a class="chip ${classe}" href="${esc(link)}" target="_blank" rel="noopener">${esc(rotulo)}</a>`
      : `<span class="chip ${classe}">${esc(rotulo)}</span>`);
  });
  return chips.join('');
}

function cartaoJogo(j) {
  const desconto = j.preco_regular_centavos && j.preco_atual_centavos !== null &&
                   j.preco_atual_centavos < j.preco_regular_centavos;
  const podeAlvo = j.meu_voto === 1 && !j.meu_tem;
  const valorAlvo = j.meu_alvo ? (j.meu_alvo / 100).toFixed(2).replace('.', ',') : '';
  const placeholderAlvo = j.meu_tem ? 'Você já tem este jogo'
    : (j.meu_voto === 1 ? 'Seu preço-alvo (ex.: 49,90)' : 'Vote 👍 para definir alvo');

  return `
  <article class="jogo ${j.meu_tem ? 'tenho' : ''}" data-id="${esc(j.id)}">
    <button class="capa" data-acao="detalhes" aria-label="Abrir detalhes de ${esc(j.nome)}">
      ${j.capa_url ? `<img src="${esc(j.capa_url)}" alt="" loading="lazy">` : ''}
    </button>
    <div class="corpo">
      <h3><button class="titulo" data-acao="detalhes">${esc(j.nome)}</button></h3>
      <div class="preco">
        ${reais(j.preco_atual_centavos)}
        ${desconto ? `<small class="riscado">${reais(j.preco_regular_centavos)}</small>` : ''}
        ${j.preco_atualizado_em ? `<small>atualizado ${esc(dataBR(j.preco_atualizado_em))}</small>` : ''}
      </div>
      <div class="chips">
        <a class="chip" href="${esc(seguro(j.loja_url))}" target="_blank" rel="noopener">Ver na Steam ↗</a>
        ${chipsJogo(j)}
      </div>

      <div class="votos">
        <button data-acao="votar" data-voto="1" class="up ${j.meu_voto === 1 ? 'ativo' : ''}">👍 ${j.votos_up.length}</button>
        <button data-acao="votar" data-voto="-1" class="down ${j.meu_voto === -1 ? 'ativo' : ''}">👎 ${j.votos_down.length}</button>
      </div>
      <div class="quem">
        ${j.votos_up.length ? '👍 ' + esc(j.votos_up.join(', ')) : ''}
        ${j.votos_down.length ? ' · 👎 ' + esc(j.votos_down.join(', ')) : ''}
      </div>

      <button class="toggle ${j.meu_tem ? 'ativo' : ''}" data-acao="posse" aria-pressed="${j.meu_tem}"
              data-dica="${esc(TEXTO_DICA_POSSE)}">
        📥 ${j.meu_tem ? 'Eu já tenho' : 'Já tenho este jogo'}${j.nomes_tem.length ? ' · ' + j.nomes_tem.length : ''}
      </button>
      <div class="quem">${j.nomes_tem.length ? 'Já têm: ' + esc(j.nomes_tem.join(', ')) : ''}</div>

      <div class="alvo">
        <input type="text" inputmode="decimal" placeholder="${esc(placeholderAlvo)}"
               value="${esc(valorAlvo)}" ${podeAlvo ? '' : 'disabled'}>
        <button data-acao="alvo" ${podeAlvo ? '' : 'disabled'}>Salvar</button>
      </div>
      <div class="grupo">
        ${j.alvo_medio !== null
          ? `Média dos alvos do grupo: <b>${reais(j.alvo_medio)}</b> (${j.alvos_qtd} pessoas)`
          : (j.alvos_qtd === 1 ? '1 pessoa definiu alvo (a média do grupo precisa de 2+)' : 'Ninguém definiu alvo ainda')}
      </div>
    </div>
  </article>`;
}

function cartaoReview(j) {
  const comentarios = j.reviews.filter((r) => r.comentario).slice(0, 2)
    .map((r) => `<div class="comentario"><b>${esc(r.nome)}</b> (${r.nota}★): ${esc(r.comentario)}</div>`).join('');
  return `
  <article class="jogo" data-id="${esc(j.id)}">
    <button class="capa" data-acao="detalhes" aria-label="Abrir detalhes de ${esc(j.nome)}">
      ${j.capa_url ? `<img src="${esc(j.capa_url)}" alt="" loading="lazy">` : ''}
    </button>
    <div class="corpo">
      <h3><button class="titulo" data-acao="detalhes">${esc(j.nome)}</button></h3>
      <div class="nota">${j.nota_media !== null ? '★ ' + j.nota_media.toString().replace('.', ',') + ' (' + j.reviews.length + ')' : 'Sem reviews ainda'}</div>
      ${comentarios}
      <button class="neutro" data-acao="detalhes">${j.meu_tem && !j.minha_review ? 'Avaliar' : 'Abrir'}</button>
    </div>
  </article>`;
}

// ---------- Tela de detalhes ----------

function fecharModal() {
  estado.aberto = null;
  $('modal').hidden = true;
  document.body.style.overflow = '';
}

/** Abre a tela de detalhes e busca os dados (Steam + IsThereAnyDeal) na API. */
async function abrirDetalhes(id, forcar) {
  estado.aberto = id;
  $('modal').hidden = false;
  document.body.style.overflow = 'hidden';

  if (estado.det[id] && !forcar) { renderModal(); return; }

  estado.det[id] = { carregando: true };
  renderModal();
  try {
    const r = await chamarApi('detalhes', { jogoId: id, forcar: !!forcar });
    estado.jogos = r.jogos;
    estado.det[id] = r.detalhes;
  } catch (e) {
    estado.det[id] = { erro: e.message };
  }
  desenhar();
}

function renderModal() {
  const j = estado.jogos.find((x) => x.id === estado.aberto);
  if (!j) { fecharModal(); return; }
  const det = estado.det[j.id] || { carregando: true };
  const corpo = document.querySelector('.modal-corpo');
  const rolagem = corpo.scrollTop;

  $('modal-conteudo').innerHTML =
    modalTopo(j, det) + modalInfo(j, det) + modalPrecos(j, det) +
    modalOfertas(det) + modalPessoas(j) + modalReviews(j);

  corpo.scrollTop = rolagem;
}

function modalTopo(j, det) {
  const cross = det.steam ? det.steam.crossplay : j.crossplay === 'SIM';
  return `
  <div class="topo-jogo">
    ${j.capa_url ? `<img src="${esc(j.capa_url)}" alt="">` : ''}
    <div class="acoes">
      <h2>${esc(j.nome)}</h2>
      <div class="chips">${cross ? '<span class="chip cp">Cross-play</span>' : ''}</div>
      <a class="botao-link" href="${esc(seguro(j.loja_url))}" target="_blank" rel="noopener">Ver na Steam ↗</a>
      <button class="neutro" data-acao="atualizar-det">Atualizar dados</button>
    </div>
  </div>`;
}

function modalInfo(j, det) {
  if (det.carregando) return '<section><p class="ajuda">Carregando detalhes…</p></section>';
  if (det.erro) return `<section><p class="erro-texto">${esc(det.erro)}</p></section>`;
  const s = det.steam;
  if (!s) return `<section><p class="erro-texto">${esc(det.steam_erro || 'Sem dados da Steam.')}</p></section>`;

  const pcs = [s.pc.windows && 'Windows', s.pc.mac && 'Mac', s.pc.linux && 'Linux'].filter(Boolean);
  return `
  <section>
    <h3>Sobre o jogo</h3>
    <p>${esc(decodificar(s.descricao))}</p>
    <p class="ajuda">
      ${s.generos.length ? esc(s.generos.join(', ')) + ' · ' : ''}
      ${s.lancamento ? 'Lançamento: ' + esc(s.lancamento) + ' · ' : ''}
      ${s.desenvolvedoras.length ? esc(s.desenvolvedoras.join(', ')) + ' · ' : ''}
      PC: ${esc(pcs.join(', ') || '—')}
    </p>
    <p>${s.crossplay
      ? '<b>Cross-play:</b> a Steam marca este jogo como multijogador multiplataforma.'
      : '<b>Cross-play:</b> a Steam não marca este jogo como multijogador multiplataforma.'}
      <span class="ajuda">(Isso não diz com quais plataformas específicas.)</span></p>
  </section>`;
}

function blocoConsole(j, det, plataforma, rotulo) {
  const c = j.consoles.find((x) => x.plataforma === plataforma);
  const buscaUrl = seguro(det && det.busca ? det.busca[plataforma] : '');
  const resumo = c
    ? `<b>${c.preco_centavos !== null ? reais(c.preco_centavos) : 'sem preço'}</b>
       <span class="etiqueta">${c.origem === 'auto' ? 'automático' : 'manual'}</span>
       ${seguro(c.url) ? `<a href="${esc(seguro(c.url))}" target="_blank" rel="noopener">abrir loja ↗</a>` : ''}
       ${c.atualizado_em ? `<span class="ajuda"> · ${esc(dataBR(c.atualizado_em))}</span>` : ''}`
    : '<span class="ajuda">Ainda não cadastrado</span>';
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
      <button data-acao="salvar-console">Salvar</button>
      ${plataforma === 'playstation' ? '<button class="neutro" data-acao="buscar-ps">Buscar automático</button>' : ''}
      ${c ? '<button class="neutro" data-acao="remover-console">Remover</button>' : ''}
      ${buscaUrl ? `<a href="${esc(buscaUrl)}" target="_blank" rel="noopener">Abrir busca na loja ↗</a>` : ''}
    </div>
    <div class="aviso-texto">
      ${plataforma === 'switch'
        ? 'Com o link ou NSUID, o preço é buscado e atualizado sozinho (confira na loja). Se digitar o preço, ele fica manual.'
        : 'A busca automática da PlayStation Store é uma tentativa e pode não funcionar. Se não achar, cole o link ou digite o preço.'}
    </div>
  </div>`;
}

function modalPrecos(j, det) {
  return `
  <section>
    <h3>Preços nas lojas</h3>
    <div class="linha-preco">
      <span>Steam (PC)</span>
      <span><b>${reais(j.preco_atual_centavos)}</b>
        ${j.preco_regular_centavos && j.preco_atual_centavos < j.preco_regular_centavos
          ? `<span class="ajuda"> (de ${reais(j.preco_regular_centavos)})</span>` : ''}</span>
    </div>
    ${blocoConsole(j, det, 'playstation', 'PlayStation')}
    ${blocoConsole(j, det, 'switch', 'Nintendo Switch')}
  </section>`;
}

function modalOfertas(det) {
  if (det.carregando) return '';
  const it = det.itad;
  if (!it) return '';
  if (it.erro) {
    return `<section><h3>Onde está mais barato (IsThereAnyDeal)</h3>
      <p class="erro-texto">Não consegui consultar agora: ${esc(it.erro)}</p></section>`;
  }
  const linhas = it.ofertas.map((o, i) => {
    const link = seguro(o.url);
    const loja = link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(o.loja)}</a>` : esc(o.loja);
    return `<div class="linha-preco"><span>${loja}${o.desconto ? ` <span class="ajuda">-${o.desconto}%</span>` : ''}</span>
            <span class="${i === 0 ? 'melhor' : ''}">${reais(o.preco)}</span></div>`;
  }).join('');
  return `
  <section>
    <h3>Onde está mais barato (IsThereAnyDeal)</h3>
    ${linhas || '<p class="ajuda">Nenhuma oferta encontrada.</p>'}
    ${it.menor_historico !== null && it.menor_historico !== undefined
      ? `<p class="ajuda">Menor preço histórico: ${reais(it.menor_historico)}</p>` : ''}
    <p class="ajuda">Só lojas de PC. Preços de console não aparecem aqui.</p>
  </section>`;
}

function modalPessoas(j) {
  return `
  <section>
    <h3>Grupo</h3>
    <p class="quem">👍 ${esc(j.votos_up.join(', ') || '—')} &nbsp;·&nbsp; 👎 ${esc(j.votos_down.join(', ') || '—')}</p>
    <p class="quem">📥 Já têm: ${esc(j.nomes_tem.join(', ') || '—')}</p>
    <button class="toggle ${j.meu_tem ? 'ativo' : ''}" data-acao="posse" aria-pressed="${j.meu_tem}"
            data-dica="${esc(TEXTO_DICA_POSSE)}">📥 ${j.meu_tem ? 'Eu já tenho' : 'Já tenho este jogo'}</button>
  </section>`;
}

function modalReviews(j) {
  const lista = j.reviews.map((r) =>
    `<div class="review"><span class="nota">${'★'.repeat(r.nota)}</span> <b>${esc(r.nome)}</b>
     ${r.comentario ? ': ' + esc(r.comentario) : ''}</div>`).join('');
  const minha = j.minha_review;
  const form = j.meu_tem ? `
    <div class="form-review">
      <label>Sua nota
        <select class="rev-nota">
          ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${minha && minha.nota === n ? 'selected' : ''}>${n} ★</option>`).join('')}
        </select>
      </label>
      <textarea class="rev-texto" rows="3" maxlength="500" placeholder="Comentário curto (opcional)">${esc(minha ? minha.comentario : '')}</textarea>
      <div class="botoes">
        <button data-acao="salvar-review">Salvar review</button>
        ${minha ? '<button class="neutro" data-acao="apagar-review">Apagar minha review</button>' : ''}
      </div>
    </div>`
    : '<p class="ajuda">Marque 📥 "Já tenho" para avaliar este jogo.</p>';
  return `
  <section>
    <h3>Reviews ${j.nota_media !== null ? '· ★ ' + j.nota_media.toString().replace('.', ',') : ''}</h3>
    ${lista || '<p class="ajuda">Ninguém avaliou ainda.</p>'}
    ${form}
  </section>`;
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

// ---------- Eventos ----------

$('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await entrar($('telefone').value, true);
  } catch (e) {
    mostrarMensagem(e.message, 'erro');
  }
});

$('btn-sair').addEventListener('click', sair);

$('btn-atualizar').addEventListener('click', async () => {
  try { await recarregar(); } catch (e) { mostrarMensagem(e.message, 'erro'); }
});

$('form-adicionar').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const botao = ev.target.querySelector('button');
  botao.disabled = true;
  botao.textContent = 'Buscando...';
  const ok = await executar('adicionarJogo', { url: $('url-steam').value }, 'Jogo adicionado!');
  if (ok) $('url-steam').value = '';
  botao.disabled = false;
  botao.textContent = 'Adicionar';
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && estado.aberto) fecharModal();
});

/** Ações dos botões dentro da tela de detalhes. */
async function acaoModal(botao, acao) {
  const jogoId = estado.aberto;
  const bloco = botao.closest('.console');
  const plataforma = bloco ? bloco.dataset.plataforma : '';

  switch (acao) {
    case 'atualizar-det':
      await abrirDetalhes(jogoId, true);
      break;
    case 'posse':
      await alternarPosse(jogoId);
      break;
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
      }, 'Review salva.');
      break;
    case 'apagar-review':
      await executar('salvarReview', { jogoId, nota: 0, comentario: '' }, 'Review apagada.');
      break;
  }
}

// Um único "ouvinte" para os botões de todos os cartões e da tela de detalhes
document.addEventListener('click', async (ev) => {
  const botao = ev.target.closest('button[data-acao]') || ev.target.closest('.modal-fundo[data-acao]');
  if (!botao) return;
  const acao = botao.dataset.acao;

  if (acao === 'fechar') { fecharModal(); return; }
  if (botao.closest('#modal')) { await acaoModal(botao, acao); return; }

  const cartao = botao.closest('.jogo');
  if (!cartao) return;
  const jogoId = cartao.dataset.id;
  const jogo = estado.jogos.find((j) => j.id === jogoId);

  switch (acao) {
    case 'detalhes':
      await abrirDetalhes(jogoId, false);
      break;
    case 'votar': {
      const voto = Number(botao.dataset.voto);
      // Clicar de novo no mesmo voto remove o voto
      await executar('votar', { jogoId, voto: jogo.meu_voto === voto ? 0 : voto });
      break;
    }
    case 'alvo': {
      const centavos = paraCentavos(cartao.querySelector('.alvo input').value);
      await executar('definirAlvo', { jogoId, centavos }, centavos ? 'Preço-alvo salvo.' : 'Preço-alvo removido.');
      break;
    }
    case 'posse':
      await alternarPosse(jogoId);
      break;
  }
});

// ---------- Início: tenta entrar com o telefone lembrado ----------

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
