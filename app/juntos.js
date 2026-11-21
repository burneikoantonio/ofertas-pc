// Juntos: grupo de duas (ou mais) pessoas que recomendam ofertas uma para a outra.
// O grupo é um código secreto. As recomendações ficam no tópico "<grupo>-mural" do ntfy.sh;
// o robô guarda uma cópia, republica (o ntfy apaga depois de 12h) e avisa a outra pessoa no celular.

S.mural ||= {}; // cópia local: { chave: recomendação }

function novoCodigo(prefixo) {
  return prefixo + Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}
function criarGrupo() {
  if (!S.nome) return toast('Escreva seu nome primeiro');
  S.juntos = novoCodigo('tk-'); salvar(); sincronizar(); telaPerfil(); convidar();
}
function entrarGrupo(cod) {
  cod = (cod || '').trim().replace(/^.*entrar=/, '');
  if (!/^tk-[a-z0-9]{8,}$/.test(cod)) return toast('Código inválido');
  S.juntos = cod; salvar(); sincronizar(); toast('Você entrou no grupo');
}
function sairGrupo() {
  if (!confirm('Sair do grupo? As recomendações continuam lá para a outra pessoa.')) return;
  delete S.juntos; S.mural = {}; salvar(); sincronizar(); telaPerfil();
}
async function convidar() {
  const url = location.origin + location.pathname + '#entrar=' + S.juntos;
  const texto = `${S.nome || 'Eu'} te convidou para o grupo do Tekko: vamos recomendar ofertas um pro outro. Abra no celular com o Tekko instalado:`;
  try { if (navigator.share) await navigator.share({ title: 'Tekko', text: texto, url }); else { await navigator.clipboard.writeText(texto + ' ' + url); toast('Convite copiado'); } } catch (e) {}
}

// ---------- mural ----------
async function lerMural() {
  if (!S.juntos) return;
  try {
    const r = await fetch(`https://ntfy.sh/${S.juntos}-mural/json?poll=1&since=all`);
    const msgs = (await r.text()).trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(JSON.parse(l).message); } catch (e) { return null; } }).filter(Boolean);
    const apagados = new Set();
    for (const m of msgs) {
      if (m.tipo === 'copia') for (const x of m.itens || []) S.mural[x.chave] ||= x;
      if (m.tipo === 'copia') for (const k of m.apagados || []) apagados.add(k);
      if (m.tipo === 'rec' && m.chave) S.mural[m.chave] ||= m;
      if (m.tipo === 'del' && m.chave) apagados.add(m.chave);
    }
    for (const k of apagados) delete S.mural[k];
    salvar();
  } catch (e) {}
}
async function recomendar(id) {
  const o = POR_ID.get(id);
  if (!S.juntos) { toast('Crie ou entre num grupo no Perfil primeiro'); return irAba('perfil'); }
  if (!S.nome) { toast('Escreva seu nome no Perfil primeiro'); return irAba('perfil'); }
  const msg = prompt('Quer mandar um recado junto? (opcional)', '');
  if (msg === null) return;
  const rec = { tipo: 'rec', chave: S.canal + '-' + Date.now(), id, t: o.t, img: o.img, pix: o.pix, loja: o.loja, nota: o.nota, url: o.url, msg: msg.slice(0, 200), de: S.nome, canal: S.canal, em: Date.now() };
  S.mural[rec.chave] = rec; salvar();
  try { await fetch(`https://ntfy.sh/${S.juntos}-mural`, { method: 'POST', body: JSON.stringify(rec) }); toast('Recomendado! A outra pessoa recebe um aviso.'); }
  catch (e) { toast('Sem internet: tente de novo'); }
}
async function apagarRec(chave) {
  delete S.mural[chave]; salvar(); telaJuntos();
  try { await fetch(`https://ntfy.sh/${S.juntos}-mural`, { method: 'POST', body: JSON.stringify({ tipo: 'del', chave }) }); } catch (e) {}
}

function quando(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 60 ? `há ${Math.max(1, m)} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dia(s)`;
}
async function telaJuntos(atualizar) {
  const app = document.getElementById('app');
  if (!S.juntos) {
    app.innerHTML = `<div class="tela"><h1>Juntos</h1>
      <div class="texto">Um espaço compartilhado: vocês recomendam ofertas um para o outro e cada um recebe um aviso no celular.
      <div class="sub" style="margin-top:8px">Cada pessoa continua com as próprias curtidas e avisos.</div></div>
      <h2>Seu nome</h2><input class="campo" placeholder="Como o outro vai te ver" value="${esc(S.nome || '')}" onchange="S.nome=this.value.trim().slice(0,20);salvar();sincronizar()">
      <div class="acoes" style="flex-direction:column">
        <button class="btn cheio" onclick="S.nome=document.querySelector('.campo').value.trim().slice(0,20);salvar();criarGrupo()">Criar grupo e convidar</button>
        <button class="btn fraco cheio" onclick="const c=prompt('Cole o código ou o link do convite');if(c){entrarGrupo(c);telaJuntos(true)}">Tenho um código de convite</button>
      </div></div>`;
    return;
  }
  if (atualizar !== false) { lerMural().then(() => { if (ABA === 'juntos' && !location.hash.includes('produto=')) telaJuntos(false); }); }
  const itens = Object.values(S.mural).sort((a, b) => b.em - a.em);
  app.innerHTML = `<div class="tela"><div class="linha"><h1>Juntos</h1><button class="ordem" onclick="convidar()">Convidar</button></div>
    ${itens.length ? itens.map(r => {
      const o = POR_ID.get(r.id), meu = r.canal === S.canal;
      const agora = o?.pix;
      const dif = o && Math.abs(agora - r.pix) >= 1 ? (agora < r.pix ? `<small style="color:var(--verde)">baixou ${brl(Math.round(r.pix - agora))}</small>` : `<small>subiu ${brl(Math.round(agora - r.pix))}</small>`) : o ? '' : '<small>saiu de oferta</small>';
      return `<div class="peca">
        <button class="foto" onclick="${o ? `abrir('${esc(r.id)}')` : `window.open('${esc(r.url)}')`}">${r.img ? `<img src="${esc(r.img)}" alt="" onerror="this.remove()">` : ''}</button>
        <div class="info" onclick="${o ? `abrir('${esc(r.id)}')` : ''}">
          <div class="rotulo">${meu ? 'Você recomendou' : esc(r.de) + ' recomendou'} · ${quando(r.em)}</div>
          <div class="nm">${esc(r.t)}</div>
          ${r.msg ? `<div class="serve" style="color:var(--txt)">“${esc(r.msg)}”</div>` : ''}
          <div style="display:flex;gap:14px">
            ${o ? `<button class="troca" onclick="event.stopPropagation();curtir('${esc(r.id)}');telaJuntos(false)">${S.curtidas[r.id] ? 'Curtido' : 'Curtir'}</button>` : ''}
            ${meu ? `<button class="troca" style="color:var(--sec)" onclick="event.stopPropagation();apagarRec('${esc(r.chave)}')">Apagar</button>` : ''}
          </div>
        </div>
        <div class="pr">${brl(agora ?? r.pix)}${dif}<div class="sub" style="font-weight:400">${esc(o?.loja || r.loja)}</div></div>
      </div>`; }).join('') : `<div class="vazio">Nenhuma recomendação ainda.<br>Abra uma oferta e toque em <b>Recomendar</b>.</div>`}
  </div>`;
}
