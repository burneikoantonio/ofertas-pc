// Robô de avisos: roda na nuvem depois de cada coleta e manda notificações (Web Push) para os celulares.
//
// Como os celulares se conectam:
//  - cada aparelho tem um "canal" (código aleatório, aparece no Perfil do app);
//  - ao ativar as notificações, o app avisa no tópico de registro (REGISTRO) que aquele canal existe;
//  - curtidas, avisos de preço e a inscrição de notificação ficam no tópico "<canal>-prefs" do ntfy.sh.
// O robô guarda tudo em .prefs/ (cache privado do GitHub, fora do site público).
//
// Variáveis: VAPID_PUBLIC, VAPID_PRIVATE, SITE_URL, REGISTRO, DRY_RUN=1 (só imprime)
const fs = require('fs');
const path = require('path');

const PREFS = path.join(__dirname, '.prefs');
fs.mkdirSync(PREFS, { recursive: true });
const ler = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return padrao; } };
const gravar = (f, x) => fs.writeFileSync(f, JSON.stringify(x));
const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const REGISTRO = process.env.REGISTRO;
const DRY = !!process.env.DRY_RUN;
const brl = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });

const agora = new Date();
const hoje = agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const hora = +agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }) % 24;
const SILENCIO = hora >= 23 || hora < 7; // de madrugada não manda nada (fica para a próxima rodada)

async function ntfy(topico) {
  try {
    const r = await fetch(`https://ntfy.sh/${topico}/json?poll=1&since=all`);
    return (await r.text()).trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(m => m.event === 'message')
      .map(m => { try { return JSON.parse(m.message); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { console.error('ntfy falhou:', topico, e.message); return []; }
}

let webpush = null;
if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(SITE || 'https://burneikoantonio.github.io/ofertas-pc', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
  } catch (e) { console.error('web-push indisponível:', e.message); }
}

(async () => {
  // 1. canais conhecidos + novos registros + pedidos de teste
  const canais = new Set(ler(path.join(PREFS, 'canais.json'), []));
  const testes = new Set();
  if (REGISTRO) for (const m of await ntfy(REGISTRO)) {
    if (typeof m.canal !== 'string' || !/^[\w-]{8,64}$/.test(m.canal)) continue;
    canais.add(m.canal);
    if (m.teste) testes.add(m.canal);
  }
  gravar(path.join(PREFS, 'canais.json'), [...canais]);
  if (process.env.TESTE_TODOS) for (const c of canais) testes.add(c); // botão "teste_todos" no GitHub

  const { ofertas } = JSON.parse(fs.readFileSync(path.join(__dirname, 'app/data/ofertas.json'), 'utf8'));
  const porId = new Map(ofertas.map(o => [o.id, o]));
  const grupos = new Map();
  for (const o of ofertas) if (o.grupo) { if (!grupos.has(o.grupo)) grupos.set(o.grupo, []); grupos.get(o.grupo).push(o); }
  const link = o => SITE ? `${SITE}/#produto=${encodeURIComponent(o.id)}` : o.url;
  // imperdíveis: nota alta ou queda forte em relação ao preço normal
  const imperdiveis = ofertas.filter(o => o.nota >= 80 || (o.ref && o.pix <= o.ref * 0.85)).sort((a, b) => b.nota - a.nota);

  // mural de cada grupo "Juntos": cópia guardada pelo robô + o que chegou no ntfy desde a última rodada
  const murais = new Map();
  async function mural(grupo) {
    if (murais.has(grupo)) return murais.get(grupo);
    const m = ler(path.join(PREFS, `mural-${grupo}.json`), { itens: {}, apagados: [] });
    const apagados = new Set(m.apagados);
    for (const x of await ntfy(`${grupo}-mural`)) {
      if (x.tipo === 'rec' && x.chave) m.itens[x.chave] ||= x;
      if (x.tipo === 'del' && x.chave) apagados.add(x.chave);
      if (x.tipo === 'copia') { for (const r of x.itens || []) m.itens[r.chave] ||= r; for (const k of x.apagados || []) apagados.add(k); }
    }
    for (const k of apagados) delete m.itens[k];
    // guarda só os últimos 60 dias (no máximo 150 recomendações)
    m.itens = Object.fromEntries(Object.values(m.itens).filter(r => agora - r.em < 60 * 864e5).sort((a, b) => b.em - a.em).slice(0, 150).map(r => [r.chave, r]));
    m.apagados = [...apagados].slice(-300);
    murais.set(grupo, m);
    return m;
  }

  let total = 0;
  for (const canal of canais) {
    const arqP = path.join(PREFS, `prefs-${canal}.json`), arqE = path.join(PREFS, `enviados-${canal}.json`);
    // preferências mais recentes do celular (o ntfy só guarda 12 horas: o robô reenvia para não perder)
    let prefs = ler(arqP, null);
    const subs = [...(prefs?.pushes || [])];
    for (const p of await ntfy(`${canal}-prefs`)) {
      for (const s of p.pushes || []) subs.push(s);
      if (!prefs || (p.em || 0) > (prefs.em || 0)) prefs = { ...p, mortos: prefs?.mortos };
    }
    if (!prefs) { console.log(`Canal ${canal.slice(0, 6)}…: sem preferências ainda`); continue; }
    const mortos = new Set(prefs.mortos || []);
    prefs.pushes = [...new Map(subs.filter(s => s?.endpoint && !mortos.has(s.endpoint)).map(s => [s.endpoint, s])).values()];
    const enviados = ler(arqE, {});
    for (const [k, d] of Object.entries(enviados)) if ((agora - new Date(d)) > 30 * 864e5) delete enviados[k];

    let ok = 0, erro = 0;
    async function enviar(title, body, url, tag, image) {
      total++;
      if (DRY || !webpush) { console.log(`[${canal.slice(0, 6)}…] ${title} — ${body.replace(/\n/g, ' | ')}`); return; }
      for (const s of [...prefs.pushes]) {
        try { await webpush.sendNotification(s, JSON.stringify({ title, body, url, tag, image }), { TTL: 86400 }); ok++; }
        catch (e) {
          erro++;
          if (e.statusCode === 404 || e.statusCode === 410) { prefs.pushes = prefs.pushes.filter(x => x.endpoint !== s.endpoint); (prefs.mortos ||= []).push(s.endpoint); }
          else console.error('Web Push falhou:', e.statusCode, e.body || e.message);
        }
      }
    }

    if (testes.has(canal)) await enviar('Tekko', 'Teste: as notificações estão chegando. Toque para abrir as ofertas.', SITE || './', 'teste');

    // 1. recomendações da outra pessoa do grupo (até 5 por rodada; de madrugada esperam)
    const m = /^tk-[a-z0-9]{8,}$/.test(prefs.grupo || '') ? await mural(prefs.grupo) : null;
    if (!SILENCIO && m) {
      let n = 0;
      for (const r of Object.values(m.itens).sort((a, b) => a.em - b.em)) {
        const chave = `rec|${r.chave}`;
        if (r.canal === canal || enviados[chave]) continue;
        if (agora - r.em > 3 * 864e5) { enviados[chave] = hoje; continue; } // recomendação antiga: não avisa
        if (n >= 5) break;
        await enviar(`${String(r.de || 'Alguém').slice(0, 20)} recomendou`, `${String(r.t).slice(0, 80)}\n${brl(r.pix)} na ${r.loja}${r.msg ? `\n“${String(r.msg).slice(0, 120)}”` : ''}`,
          SITE ? `${SITE}/#juntos` : './', `rec-${r.chave}`, r.img);
        enviados[chave] = hoje; n++;
      }
    }

    if (!SILENCIO) {
      // 2. itens curtidos e avisos de preço: baixou desde que você salvou (ou chegou no menor preço já visto)
      const seguidos = { ...(prefs.curtidas || {}), ...(prefs.alertas || {}) };
      for (const [id, base] of Object.entries(seguidos)) {
        const o = porId.get(id); if (!o || !base) continue;
        // se o mesmo produto está mais barato em outra loja, avisa com a loja mais barata
        const melhor = o.grupo ? grupos.get(o.grupo).reduce((a, b) => (b.pix < a.pix ? b : a), o) : o;
        const caiu = melhor.pix <= base * 0.97;
        const recorde = o.min && o.pix < o.min;
        if (!caiu && !recorde) continue;
        const chave = `item|${id}|${Math.round(melhor.pix)}`; if (enviados[chave]) continue;
        await enviar(recorde && !caiu ? 'Menor preço já visto' : `Baixou ${Math.round((1 - melhor.pix / base) * 100)}%`,
          `${o.t.slice(0, 80)}\n${brl(melhor.pix)} na ${melhor.loja} (era ${brl(base)}) · nota ${melhor.nota}`, link(melhor), `item-${id}`, melhor.img);
        enviados[chave] = hoje;
      }

      // 3. ofertas imperdíveis (no máximo 3 por rodada e 10 por dia; o resto vai num resumo)
      const hojeJa = Object.entries(enviados).filter(([k, d]) => k.startsWith('top|') && d === hoje).length;
      const novas = imperdiveis.filter(o => !enviados[`top|${o.grupo || o.id}|${Math.round(o.pix)}`]);
      const vagas = Math.max(0, Math.min(3, 10 - hojeJa));
      for (const o of novas.slice(0, vagas)) {
        await enviar(`Nota ${o.nota}: ${o.loja}`, `${o.t.slice(0, 80)}\n${brl(o.pix)}${o.motivos?.length ? ' · ' + o.motivos[0] : ''}`, link(o), `top-${o.id}`, o.img);
        enviados[`top|${o.grupo || o.id}|${Math.round(o.pix)}`] = hoje;
      }
      const resto = novas.slice(vagas);
      if (resto.length >= 3 && !enviados[`resumo|${hoje}|${hora}`] && hojeJa + vagas < 12) {
        await enviar(`Mais ${resto.length} ofertas com nota alta`, resto.slice(0, 5).map(o => `• ${o.t.slice(0, 40)}: ${brl(o.pix)}`).join('\n'), SITE || './', 'resumo');
        enviados[`resumo|${hoje}|${hora}`] = hoje;
        for (const o of resto) enviados[`top|${o.grupo || o.id}|${Math.round(o.pix)}`] = hoje;
      }
    }

    gravar(arqE, enviados);
    gravar(arqP, prefs);
    // reenvia as preferências para o canal não esquecer (o ntfy apaga depois de 12h)
    if (!DRY) try { await fetch(`https://ntfy.sh/${canal}-prefs`, { method: 'POST', body: JSON.stringify({ ...prefs, mortos: undefined }) }); } catch (e) {}
    console.log(`Canal ${canal.slice(0, 6)}…: ${prefs.pushes.length} aparelho(s), ${ok} enviada(s), ${erro} erro(s)`);
  }
  // guarda os murais e republica uma cópia no ntfy (que apaga depois de 12h) para os celulares sempre acharem
  for (const [grupo, m] of murais) {
    gravar(path.join(PREFS, `mural-${grupo}.json`), m);
    if (DRY) continue;
    // o ntfy aceita mensagens de até 4 KB: manda a cópia em pedaços
    const pedacos = [[]];
    let tam = 0;
    for (const r of Object.values(m.itens)) {
      const t = JSON.stringify(r).length;
      if (tam + t > 3200 && pedacos[pedacos.length - 1].length) { pedacos.push([]); tam = 0; }
      pedacos[pedacos.length - 1].push(r); tam += t;
    }
    for (const [i, itens] of pedacos.entries()) {
      const corpo = { tipo: 'copia', itens, apagados: i === 0 ? m.apagados.slice(-20) : [] };
      try { await fetch(`https://ntfy.sh/${grupo}-mural`, { method: 'POST', body: JSON.stringify(corpo) }); } catch (e) {}
    }
  }
  console.log(`${murais.size} grupo(s) Juntos`);
  console.log(`${canais.size} canal(is), ${total} aviso(s)${SILENCIO ? ' (horário de silêncio: só testes)' : ''}`);
})();
