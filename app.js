// ============================================================
//  GGList — frontend (HTML/CSS/JS puro)
// ============================================================

// >>> COLE AQUI a URL do Web App do Apps Script (termina em /exec) <<<
const API_URL = 'https://script.google.com/macros/s/AKfycbw_zU5IVqbycYB3-1cUAVYNQBOOES1dmdJRhBgFdy2PUu0XgNKXxqJ4ypAsy70z4D7vrw/exec';

// Estado em memória
const estado = { telefone: '', jogos: [] };

// ---------- Utilidades ----------

const $ = (id) => document.getElementById(id);

/** Escapa texto antes de colocar em HTML (evita injeção de código). */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
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
  timerMensagem = setTimeout(() => { el.hidden = true; }, 4000);
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
  $('usuario').hidden = true;
  $('tela-app').hidden = true;
  $('tela-login').hidden = false;
}

// ---------- Renderização ----------

async function recarregar() {
  const r = await chamarApi('listar');
  estado.jogos = r.jogos;
  desenhar();
}

function desenhar() {
  const abertos = estado.jogos.filter((j) => !j.comprado);
  const comprados = estado.jogos.filter((j) => j.comprado);
  $('lista').innerHTML = abertos.map(cartaoJogo).join('');
  $('lista-comprados').innerHTML = comprados.map(cartaoJogo).join('');
  $('vazio').hidden = abertos.length > 0;
  $('bloco-comprados').hidden = comprados.length === 0;
}

function cartaoJogo(j) {
  const desconto = j.preco_regular_centavos && j.preco_atual_centavos !== null &&
                   j.preco_atual_centavos < j.preco_regular_centavos;
  const podeAlvo = j.meu_voto === 1 && !j.comprado;
  const valorAlvo = j.meu_alvo ? (j.meu_alvo / 100).toFixed(2).replace('.', ',') : '';

  return `
  <article class="jogo" data-id="${esc(j.id)}">
    ${j.capa_url ? `<img src="${esc(j.capa_url)}" alt="" loading="lazy">` : ''}
    <div class="corpo">
      <h3><a href="${esc(j.loja_url)}" target="_blank" rel="noopener">${esc(j.nome)}</a></h3>
      <div class="preco">
        ${reais(j.preco_atual_centavos)}
        ${desconto ? `<small class="riscado">${reais(j.preco_regular_centavos)}</small>` : ''}
        ${j.preco_atualizado_em ? `<small>atualizado ${esc(dataBR(j.preco_atualizado_em))}</small>` : ''}
      </div>

      ${j.comprado ? `<div class="quem">Comprado por ${esc(j.comprado_por)}</div>` : `
      <div class="votos">
        <button data-acao="votar" data-voto="1" class="up ${j.meu_voto === 1 ? 'ativo' : ''}">👍 ${j.votos_up.length}</button>
        <button data-acao="votar" data-voto="-1" class="down ${j.meu_voto === -1 ? 'ativo' : ''}">👎 ${j.votos_down.length}</button>
      </div>
      <div class="quem">
        ${j.votos_up.length ? '👍 ' + esc(j.votos_up.join(', ')) : ''}
        ${j.votos_down.length ? ' · 👎 ' + esc(j.votos_down.join(', ')) : ''}
      </div>

      <div class="alvo">
        <input type="text" inputmode="decimal" placeholder="${podeAlvo ? 'Seu preço-alvo (ex.: 49,90)' : 'Vote 👍 para definir alvo'}"
               value="${esc(valorAlvo)}" ${podeAlvo ? '' : 'disabled'}>
        <button data-acao="alvo" ${podeAlvo ? '' : 'disabled'}>Salvar</button>
      </div>
      <div class="grupo">
        ${j.alvo_medio !== null
          ? `Média dos alvos do grupo: <b>${reais(j.alvo_medio)}</b> (${j.alvos_qtd} pessoas)`
          : (j.alvos_qtd === 1 ? '1 pessoa definiu alvo (a média do grupo precisa de 2+)' : 'Ninguém definiu alvo ainda')}
      </div>
      <button class="comprar" data-acao="comprado">Marcar como comprado</button>`}
      ${j.comprado ? `<button class="comprar" data-acao="desfazer">Desfazer "comprado"</button>` : ''}
    </div>
  </article>`;
}

// ---------- Ações ----------

/** Executa uma ação, mostra erro se houver e redesenha a lista. */
async function executar(acao, dados, textoOk) {
  try {
    const r = await chamarApi(acao, dados);
    estado.jogos = r.jogos;
    desenhar();
    if (textoOk) mostrarMensagem(textoOk, 'ok');
  } catch (e) {
    mostrarMensagem(e.message, 'erro');
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
  await executar('adicionarJogo', { url: $('url-steam').value }, 'Jogo adicionado!');
  $('url-steam').value = '';
  botao.disabled = false;
  botao.textContent = 'Adicionar';
});

// Um único "ouvinte" para os botões de todos os cartões (delegação de eventos)
document.addEventListener('click', async (ev) => {
  const botao = ev.target.closest('button[data-acao]');
  if (!botao) return;
  const cartao = botao.closest('.jogo');
  if (!cartao) return;
  const jogoId = cartao.dataset.id;
  const jogo = estado.jogos.find((j) => j.id === jogoId);

  switch (botao.dataset.acao) {
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
    case 'comprado':
      if (confirm('Marcar "' + jogo.nome + '" como comprado?')) {
        await executar('marcarComprado', { jogoId, comprado: true }, 'Marcado como comprado.');
      }
      break;
    case 'desfazer':
      await executar('marcarComprado', { jogoId, comprado: false }, 'Voltou para a lista.');
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
