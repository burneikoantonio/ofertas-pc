// Montar PC: questionário (uso, jogos, tela, orçamento, periféricos, marcas) e montagem automática
// com as ofertas do dia, conferindo a compatibilidade entre as peças.

// ---------- ler as especificações pelo nome do anúncio ----------
const SOQUETE_CHIPSET = {
  a320: 'AM4', a520: 'AM4', b450: 'AM4', b550: 'AM4', x470: 'AM4', x570: 'AM4',
  a620: 'AM5', b650: 'AM5', b650e: 'AM5', b840: 'AM5', b850: 'AM5', x670: 'AM5', x670e: 'AM5', x870: 'AM5', x870e: 'AM5',
  h410: 'LGA1200', b460: 'LGA1200', h470: 'LGA1200', z490: 'LGA1200', h510: 'LGA1200', b560: 'LGA1200', z590: 'LGA1200',
  h610: 'LGA1700', b660: 'LGA1700', h670: 'LGA1700', z690: 'LGA1700', b760: 'LGA1700', h770: 'LGA1700', z790: 'LGA1700',
  h810: 'LGA1851', b860: 'LGA1851', z890: 'LGA1851',
};
const DDR_PADRAO = { AM4: 4, AM5: 5, LGA1851: 5, LGA1200: 4 };
const SELO = { white: 1, bronze: 2, silver: 3, gold: 4, platinum: 5, titanium: 6 };

function spec(o) {
  if (o._s) return o._s;
  const t = norm(o.t);
  const s = {};
  if (o.cat === 'cpu') {
    let m;
    if ((m = t.match(/ryzen\s?([3579])\s?(\d)(\d{3})([a-z0-9]*)/))) {
      const ger = +m[2], suf = m[4];
      s.marca = 'amd'; s.soquete = ger >= 7 ? 'AM5' : 'AM4';
      s.igpu = /g/.test(suf) || (ger >= 7 && ger !== 8 && !/f/.test(suf)) || (ger === 8 && /g/.test(suf));
      s.cooler = !/x/.test(suf);
    } else if ((m = t.match(/\bi([3579])[-\s]?(1[0-4])(\d{3})([a-z]*)/))) {
      const ger = +m[2], suf = m[4];
      s.marca = 'intel'; s.soquete = ger >= 12 ? 'LGA1700' : 'LGA1200';
      s.igpu = !/f/.test(suf); s.cooler = !/k/.test(suf);
    } else if ((m = t.match(/ultra\s?([579])\s?(2\d{2})([a-z]*)/))) {
      s.marca = 'intel'; s.soquete = 'LGA1851'; s.igpu = !/f/.test(m[3]); s.cooler = !/k/.test(m[3]);
    }
    if (/sem cooler|\btray\b|\boem\b/.test(t)) s.cooler = false;
    else if (/com cooler|wraith|cooler incluso/.test(t)) s.cooler = true;
    s.ddr = DDR_PADRAO[s.soquete] || null;
  } else if (o.cat === 'placa-mae') {
    const m = t.match(/\b(a320|a520|b450|b550|x470|x570|a620|b650e?|b840|b850|x670e?|x870e?|h410|b460|h470|z490|h510|b560|z590|h610|b660|h670|z690|b760|h770|z790|h810|b860|z890)(m|i)?/);
    if (m) { s.chipset = m[1]; s.soquete = SOQUETE_CHIPSET[m[1]]; }
    s.ddr = /ddr5/.test(t) ? 5 : /ddr4/.test(t) ? 4 : (DDR_PADRAO[s.soquete] || null);
    s.formato = /mini[- ]?itx|\bitx\b/.test(t) || m?.[2] === 'i' ? 'itx' : /m-?atx|micro[- ]?atx|matx/.test(t) || m?.[2] === 'm' ? 'matx' : 'atx';
  } else if (o.cat === 'ram') {
    s.ddr = /ddr5/.test(t) ? 5 : /ddr4/.test(t) ? 4 : null;
    const k = t.match(/(\d)\s?x\s?(\d{1,2})\s?gb/), g = t.match(/(\d{1,3})\s?gb/);
    s.gb = k ? +k[1] * +k[2] : g ? +g[1] : null;
    s.mhz = +(t.match(/(\d{4})\s?mhz/)?.[1] || 0);
    s.notebook = /notebook|sodimm|so-dimm/.test(t);
  } else if (o.cat === 'ssd') {
    s.nvme = /nvme|pcie/.test(t);
    const c = t.match(/(\d+(?:[.,]\d+)?)\s?(tb|gb)\b/);
    s.gb = c ? Math.round(parseFloat(c[1].replace(',', '.')) * (c[2] === 'tb' ? 1000 : 1)) : null;
  } else if (o.cat === 'fonte') {
    s.w = +(t.match(/(\d{3,4})\s?w\b/)?.[1] || 0);
    const sl = t.match(/80\s?plus\s?(white|bronze|silver|gold|platinum|titanium)?/);
    s.selo = sl ? SELO[sl[1] || 'white'] : 0;
  } else if (o.cat === 'gabinete') {
    s.atx = /mid[- ]?tower|full[- ]?tower|e-?atx/.test(t) || !/m-?atx|micro|mini[- ]?tower|itx/.test(t);
    s.soItx = /mini[- ]?itx/.test(t) && !/atx/.test(t);
  } else if (o.cat === 'gpu') {
    const p = o.perf || 0;
    s.fonte = (p <= 70 ? 450 : p <= 105 ? 550 : p <= 150 ? 650 : p <= 200 ? 750 : p <= 260 ? 850 : 1000) + (/\brx\b|radeon/.test(t) ? 50 : 0);
    s.marca = /\brx\s?\d|radeon/.test(t) ? 'amd' : /\barc\b|intel/.test(t) ? 'intel' : 'nvidia';
  } else if (o.cat === 'cooler') {
    s.water = /water/.test(t);
    s.fan = /ventoinha|kit fan|^fan|^kit/.test(t) && !/cooler/.test(t.slice(0, 20));
  } else if (o.cat === 'monitor') {
    s.res = /4k|uhd|3840/.test(t) ? '4k' : /qhd|2k|1440|wqhd/.test(t) ? '2k' : /full ?hd|fhd|1080/.test(t) ? 'fhd' : null;
    s.hz = Math.max(0, ...[...t.matchAll(/(\d{2,3})\s?hz/g)].map(x => +x[1]));
    s.pol = parseFloat((t.match(/(\d{2}(?:[.,]\d)?)\s?(?:"|”|''|pol|polegadas)/)?.[1] || '0').replace(',', '.'));
  }
  return (o._s = s);
}

// ---------- ofertas disponíveis (uma por produto: a mais barata entre as lojas) ----------
function candidatos(cat) {
  const vistos = new Set(), l = [];
  for (const o of D.ofertas) {
    if (o.cat !== cat || o.importado) continue;
    const m = o.grupo ? GRUPOS.get(o.grupo)[0] : o;
    if (vistos.has(m.id)) continue;
    vistos.add(m.id); l.push(m);
  }
  return l.sort((a, b) => a.pix - b.pix);
}
const bemAvaliado = o => (o.aval && o.aval[0] >= 4.3) || o.nota >= 55;
// a mais barata de cada chip (placa de vídeo / processador)
function porChip(l) {
  const m = new Map();
  for (const o of l) if (o.perf && o.chip && (!m.has(o.chip) || o.pix < m.get(o.chip).pix)) m.set(o.chip, o);
  return [...m.values()];
}

// ---------- montagem ----------
const VAGAS = [
  ['cpu', 'Processador'], ['placa-mae', 'Placa-mãe'], ['ram', 'Memória RAM'], ['gpu', 'Placa de vídeo'], ['ssd', 'SSD'],
  ['fonte', 'Fonte'], ['gabinete', 'Gabinete'], ['cooler', 'Cooler'], ['monitor', 'Monitor'], ['mouse', 'Mouse'], ['teclado', 'Teclado'], ['headset', 'Headset'],
];
function alvoGpu(p) {
  if (p.uso === 'trabalho') return 0;
  if (p.uso === 'edicao') return 100;
  return { fhd: p.jogo === 'leves' ? 70 : 105, '2k': 150, '4k': 230 }[p.tela] || 105;
}
function cpuNecessaria(gp) { return gp >= 200 ? 110 : gp >= 140 ? 95 : gp >= 100 ? 85 : 70; }

function escolherPerifericos(p) {
  const r = {};
  if (p.incluir?.includes('monitor')) {
    const l = candidatos('monitor').filter(o => { const s = spec(o); return s.res && (p.uso === 'jogos' ? s.res === (p.tela || 'fhd') && s.hz >= (p.tela === '4k' ? 60 : 144) : s.res === 'fhd' && s.pol >= 23); });
    r.monitor = l.find(bemAvaliado) || l[0];
  }
  // periféricos de faixa de preço boa (nem os mais baratos, que costumam ser fracos), com a maior nota
  const faixa = (cat, min, max) => candidatos(cat).filter(o => o.pix >= min && o.pix <= max && bemAvaliado(o)).sort((a, b) => b.nota - a.nota)[0];
  const folga = p.orc >= 10000 ? 1.6 : 1;
  if (p.incluir?.includes('kit')) { r.mouse = faixa('mouse', 80, 250 * folga); r.teclado = faixa('teclado', 120, 350 * folga); }
  if (p.incluir?.includes('headset')) r.headset = faixa('headset', 120, 400 * folga);
  for (const k in r) if (!r[k]) delete r[k];
  return r;
}

function montar(p) {
  const perif = escolherPerifericos(p);
  const custoPerif = Object.values(perif).reduce((s, o) => s + o.pix, 0);
  const verba = p.orc - custoPerif;
  // memória e SSD estão caros: o app testa 16 e 32 GB, 500 GB, 1 TB e 2 TB e fica com o que render mais no orçamento
  const bonusRam = { jogos: { leves: 3, pesados: 12, ambos: 8 }[p.jogo] || 8, trabalho: 5, edicao: 25 }[p.uso];
  const bonusSsd = { 500: 0, 1000: p.uso === 'edicao' ? 8 : 6, 2000: p.uso === 'edicao' ? 14 : 7 };
  const ssdOps = [500, 1000, 2000].map(gb => ({
    gb, o: candidatos('ssd').filter(o => { const s = spec(o); return s.gb >= gb * 0.95 && s.gb <= gb * 1.1 && (s.nvme || gb === 500); }).find(bemAvaliado)
      || candidatos('ssd').find(o => { const s = spec(o); return s.gb >= gb * 0.95 && s.gb <= gb * 1.1; }),
  })).filter(x => x.o);
  const gabinete = candidatos('gabinete').filter(o => spec(o).atx && !spec(o).soItx && o.pix >= 150).find(bemAvaliado) || candidatos('gabinete').find(o => spec(o).atx);
  const ramPor = { 4: {}, 5: {} };
  const tamanhos = p.uso === 'trabalho' ? [8, 16, 32] : [16, 32];
  for (const ddr of [4, 5]) for (const gb of tamanhos) {
    const l = candidatos('ram').filter(o => { const s = spec(o); return s.ddr === ddr && !s.notebook && s.gb === gb; });
    ramPor[ddr][gb] = l.filter(o => spec(o).mhz >= (ddr === 4 ? 3000 : 4800)).find(bemAvaliado) || l.find(bemAvaliado) || l[0];
  }
  const placas = candidatos('placa-mae').filter(o => spec(o).soquete && spec(o).ddr);
  const coolerAr = candidatos('cooler').filter(o => !spec(o).water && !spec(o).fan && o.pix >= 60).find(bemAvaliado);
  const fontes = candidatos('fonte').filter(o => spec(o).w >= 400);
  const fontePara = w => fontes.find(o => spec(o).w >= w && spec(o).selo >= 2 && bemAvaliado(o)) || fontes.find(o => spec(o).w >= w && spec(o).selo >= 1) || fontes.find(o => spec(o).w >= w);

  // processador + placa-mãe + memória + cooler para cada processador possível
  let cpus = porChip(candidatos('cpu')).filter(o => spec(o).soquete && (!p.marcaCpu || spec(o).marca === p.marcaCpu));
  const plataformas = [];
  for (const cpu of cpus) {
    const sc = spec(cpu);
    const forte = cpu.perf >= 115;
    const cooler = !sc.cooler || cpu.perf >= 125 ? coolerAr : null;
    if ((!sc.cooler || cpu.perf >= 125) && !cooler) continue;
    for (const gb of tamanhos) {
      let melhor = null;
      for (const mb of placas) {
        const sm = spec(mb), ram = ramPor[sm.ddr]?.[gb];
        if (sm.soquete !== sc.soquete || !ram) continue;
        if (forte && /^(a320|a520|a620|h610|h410|h510|h810)$/.test(sm.chipset)) continue; // processador forte pede placa melhor
        const custo = mb.pix + ram.pix;
        if (!melhor || custo < melhor.custo) melhor = { mb, ram, custo };
      }
      if (melhor) plataformas.push({ cpu, mb: melhor.mb, ram: melhor.ram, gb, cooler, custo: cpu.pix + melhor.custo + (cooler?.pix || 0) });
    }
  }
  let gpus = porChip(candidatos('gpu')).filter(o => !p.marcaGpu || spec(o).marca === p.marcaGpu);
  const opcoesGpu = p.uso === 'trabalho' ? [null] : gpus;
  const fixo = gabinete?.pix || 0;
  const alvo = alvoGpu(p);

  let melhor = null, maisBarato = null;
  for (const pl of plataformas) {
    if (p.uso === 'trabalho' && !spec(pl.cpu).igpu) continue;
    for (const gpu of opcoesGpu) {
      const fonte = fontePara(gpu ? spec(gpu).fonte : 450);
      if (!fonte) continue;
      let base;
      if (p.uso === 'trabalho') base = pl.cpu.perf;
      else if (p.uso === 'edicao') base = 0.6 * pl.cpu.perf + 0.4 * gpu.perf;
      else {
        const fator = Math.min(1, pl.cpu.perf / cpuNecessaria(gpu.perf)) ** 0.7;
        // passar muito do necessário para a tela vale menos (melhor sobrar dinheiro)
        const g = gpu.perf <= alvo * 1.35 ? gpu.perf : alvo * 1.35 + (gpu.perf - alvo * 1.35) * 0.3;
        base = g * fator + 0.15 * pl.cpu.perf;
      }
      for (const sd of ssdOps) {
        const total = pl.custo + (gpu?.pix || 0) + fonte.pix + fixo + sd.o.pix;
        const cand = { ...pl, gpu, fonte, ssd: sd.o, total };
        if (!maisBarato || total < maisBarato.total) maisBarato = cand;
        if (total > verba) continue;
        const nota = base + (pl.gb === 32 ? bonusRam : pl.gb === 8 ? -15 : 0) + bonusSsd[sd.gb];
        if (!melhor || nota > melhor.nota + 0.01 || (Math.abs(nota - melhor.nota) <= 0.01 && total < melhor.total)) melhor = { ...cand, nota };
      }
    }
  }
  const r = melhor || maisBarato;
  if (!r) return null;
  const pecas = { cpu: r.cpu, 'placa-mae': r.mb, ram: r.ram, gpu: r.gpu, ssd: r.ssd, fonte: r.fonte, gabinete, cooler: r.cooler, ...perif };
  const ids = {};
  for (const [k, o] of Object.entries(pecas)) if (o) ids[k] = o.id;
  return { ids, cabe: !!melhor };
}

// alternativas compatíveis para trocar uma peça
function alternativas(vaga, atuais) {
  const cpu = atuais.cpu, mb = atuais['placa-mae'], gpu = atuais.gpu;
  let l = vaga === 'cpu' || vaga === 'gpu' ? porChip(candidatos(vaga)) : candidatos(vaga);
  if (vaga === 'cpu') l = l.filter(o => spec(o).soquete); // trocar o processador pode trocar a placa-mãe junto
  if (vaga === 'placa-mae' && cpu) l = l.filter(o => spec(o).soquete === spec(cpu).soquete && (!atuais.ram || spec(o).ddr === spec(atuais.ram).ddr));
  if (vaga === 'ram') l = l.filter(o => !spec(o).notebook && spec(o).gb >= 8 && (!mb || spec(o).ddr === spec(mb).ddr));
  if (vaga === 'fonte') l = l.filter(o => spec(o).w >= (gpu ? spec(gpu).fonte : 400));
  if (vaga === 'gabinete' && mb && spec(mb).formato === 'atx') l = l.filter(o => spec(o).atx);
  if (vaga === 'ssd') l = l.filter(o => spec(o).gb >= 240);
  if (vaga === 'cooler') l = l.filter(o => !spec(o).fan);
  if (vaga === 'monitor' || vaga === 'mouse' || vaga === 'teclado' || vaga === 'headset' || vaga === 'cooler' || vaga === 'gabinete' || vaga === 'ssd') l = l.filter(bemAvaliado);
  return l;
}

function checagens(pc) {
  const c = [];
  const { cpu, gpu, ram, fonte, gabinete, cooler } = pc, mb = pc['placa-mae'];
  if (cpu && mb) c.push([spec(cpu).soquete === spec(mb).soquete, `Processador ${spec(cpu).soquete} e placa-mãe ${spec(mb).soquete} (${spec(mb).chipset?.toUpperCase() || ''})`]);
  if (ram && mb) c.push([spec(ram).ddr === spec(mb).ddr, `Memória DDR${spec(ram).ddr} e placa-mãe DDR${spec(mb).ddr}`]);
  if (fonte) { const need = gpu ? spec(gpu).fonte : 400; c.push([spec(fonte).w >= need, `Fonte ${spec(fonte).w}W (recomendado ${need}W ou mais)${spec(fonte).selo >= 2 ? ', com selo 80 Plus' : ''}`]); }
  if (gabinete && mb) c.push([spec(mb).formato !== 'atx' || spec(gabinete).atx, `Gabinete comporta placa-mãe ${spec(mb).formato === 'matx' ? 'Micro-ATX' : spec(mb).formato.toUpperCase()}`]);
  if (cpu) c.push([!!(cooler || spec(cpu).cooler), cooler ? 'Cooler à parte para o processador' : spec(cpu).cooler ? 'Processador já vem com cooler' : 'Este processador vem SEM cooler: adicione um']);
  if (cpu && !gpu) c.push([!!spec(cpu).igpu, spec(cpu).igpu ? 'Sem placa de vídeo: usa o vídeo integrado do processador' : 'Este processador não tem vídeo integrado: precisa de placa de vídeo']);
  if (ram) c.push([true, `${spec(ram).gb} GB de memória${spec(ram).gb >= 32 ? ' (folga para edição e jogos pesados)' : ' (bom para jogos e uso geral)'}`]);
  return c;
}

function servePara(vaga, o) {
  const s = spec(o);
  if (vaga === 'gpu' && o.perf) return [...PERF.gpuUso].reverse().find(([m]) => o.perf >= m)?.[1];
  if (vaga === 'cpu' && o.perf) return `${s.soquete || ''}${s.igpu ? ', tem vídeo integrado' : ''}. ${[...PERF.cpuUso].reverse().find(([m]) => o.perf >= m)?.[1] || ''}`;
  if (vaga === 'placa-mae') return `Soquete ${s.soquete}, memória DDR${s.ddr}, tamanho ${s.formato === 'matx' ? 'Micro-ATX' : s.formato?.toUpperCase()}`;
  if (vaga === 'ram') return `${s.gb} GB DDR${s.ddr}${s.mhz ? ' ' + s.mhz + ' MHz' : ''}: memória de trabalho do PC`;
  if (vaga === 'ssd') return `${s.gb >= 1000 ? s.gb / 1000 + ' TB' : s.gb + ' GB'} ${s.nvme ? 'NVMe (muito rápido)' : 'SATA'}: guarda sistema e jogos`;
  if (vaga === 'fonte') return `${s.w}W${s.selo >= 2 ? ', 80 Plus' : ''}: dá energia estável a tudo`;
  if (vaga === 'monitor') return `${s.res === '2k' ? '2K' : s.res === '4k' ? '4K' : 'Full HD'}${s.hz ? ' ' + s.hz + 'Hz' : ''}`;
  return (CFG.cat[vaga]?.serve || '').split('. ')[0] + '.';
}

// ---------- telas ----------
const PERGUNTAS = [
  { id: 'uso', q: 'Para que você vai usar o PC?', op: [['jogos', 'Jogos', 'Jogar no PC é a prioridade'], ['trabalho', 'Trabalho e estudo', 'Navegador, Office, aulas, programas leves'], ['edicao', 'Edição e stream', 'Editar vídeo/foto, fazer live, programas pesados']] },
  { id: 'jogo', q: 'Que tipo de jogo?', so: p => p.uso === 'jogos', op: [['leves', 'Competitivos e leves', 'CS2, Valorant, LoL, Fortnite, Minecraft'], ['pesados', 'Lançamentos pesados', 'GTA, Cyberpunk, Black Myth, Call of Duty'], ['ambos', 'Um pouco de tudo', 'Quero rodar bem os dois tipos']] },
  { id: 'tela', q: 'Em que resolução você quer jogar?', so: p => p.uso === 'jogos', op: [['fhd', 'Full HD (1080p)', 'Monitor comum de 24". Mais FPS gastando menos'], ['2k', '2K (1440p)', 'Imagem mais nítida, pede placa de vídeo melhor'], ['4k', '4K', 'Máxima nitidez, o mais caro']] },
  { id: 'orc', q: 'Quanto você quer gastar no total?', tipo: 'orc' },
  { id: 'incluir', q: 'O que mais precisa entrar no orçamento?', multi: true, op: [['monitor', 'Monitor', 'Ainda não tenho monitor'], ['kit', 'Mouse e teclado', 'Preciso de mouse e teclado'], ['headset', 'Headset', 'Fone com microfone']] },
  { id: 'marcas', q: 'Tem preferência de marca?', tipo: 'marcas' },
];

function telaMontar() {
  const app = document.getElementById('app');
  if (!S.pc || S.pc.refazer) return perguntar(S.pc?.passo || 0);
  return mostrarPC();
}
function perguntasAtivas(p) { return PERGUNTAS.filter(x => !x.so || x.so(p)); }
function perguntar(i) {
  S.pcPerfil ||= { orc: 6000, incluir: [] };
  const p = S.pcPerfil, lista = perguntasAtivas(p), q = lista[i];
  if (!q) return gerarPC();
  S.pc = { ...(S.pc || {}), refazer: true, passo: i }; salvar();
  const op = (val, tit, sub, on, fn) => `<button class="opcao ${on ? 'on' : ''}" onclick="${fn}"><span><b>${tit}</b><small>${sub}</small></span><span class="marca">${on ? I.check : ''}</span></button>`;
  let corpo = '';
  if (q.tipo === 'orc') {
    corpo = `<div class="valor" id="orcV">${brl(p.orc)}</div>
      <input type="range" min="2000" max="25000" step="250" value="${p.orc}" oninput="S.pcPerfil.orc=+this.value;document.getElementById('orcV').textContent=brl(+this.value)" onchange="salvar()">
      <div class="chips" style="justify-content:center;flex-wrap:wrap">${[3000, 4500, 6000, 8000, 10000, 15000].map(v => `<button class="chip" onclick="S.pcPerfil.orc=${v};salvar();perguntar(${i})">${brl(v)}</button>`).join('')}</div>
      <div class="sub" style="text-align:center;margin-top:6px">Preço no Pix, somando todas as peças${p.incluir?.length ? ' e periféricos' : ''}.</div>
      <button class="btn" style="width:100%;margin-top:20px" onclick="perguntar(${i + 1})">Continuar</button>`;
  } else if (q.tipo === 'marcas') {
    const grupo = (campo, ops) => `<div class="seg" style="margin-bottom:14px">${ops.map(([v, n]) => `<button class="${(p[campo] || '') === v ? 'on' : ''}" onclick="S.pcPerfil.${campo}='${v}';salvar();perguntar(${i})">${n}</button>`).join('')}</div>`;
    corpo = `<div class="sub" style="margin-bottom:6px">Processador</div>${grupo('marcaCpu', [['', 'Tanto faz'], ['amd', 'AMD'], ['intel', 'Intel']])}
      ${p.uso !== 'trabalho' ? `<div class="sub" style="margin-bottom:6px">Placa de vídeo</div>${grupo('marcaGpu', [['', 'Tanto faz'], ['nvidia', 'NVIDIA'], ['amd', 'AMD']])}` : ''}
      <div class="sub">Na dúvida, deixe "Tanto faz": o app escolhe o melhor desempenho pelo preço.</div>
      <button class="btn" style="width:100%;margin-top:20px" onclick="gerarPC()">Montar meu PC</button>`;
  } else if (q.multi) {
    corpo = `<div class="opcoes">${q.op.map(([v, t, s]) => op(v, t, s, p[q.id].includes(v), `alternar('${q.id}','${v}',${i})`)).join('')}</div>
      <button class="btn" style="width:100%;margin-top:20px" onclick="perguntar(${i + 1})">${p[q.id].length ? 'Continuar' : 'Já tenho tudo isso'}</button>`;
  } else {
    corpo = `<div class="opcoes">${q.op.map(([v, t, s]) => op(v, t, s, p[q.id] === v, `S.pcPerfil.${q.id}='${v}';salvar();perguntar(${i + 1})`)).join('')}</div>`;
  }
  document.getElementById('app').innerHTML = `<div class="tela">
    <div class="topo">${i > 0 ? `<button class="voltar" onclick="perguntar(${i - 1})">${I.voltar} Voltar</button>` : `<span></span>`}${S.pc?.ids ? `<button class="voltar" onclick="S.pc.refazer=false;salvar();telaMontar()">Cancelar</button>` : ''}</div>
    <h1 style="margin-top:0">Montar PC</h1>
    <div class="passo">Pergunta ${i + 1} de ${lista.length}</div>
    <div class="progresso"><div style="width:${((i + 1) / lista.length) * 100}%"></div></div>
    <div class="pergunta">${q.q}</div>${corpo}</div>`;
  scrollTo(0, 0);
}
function alternar(campo, v, i) {
  const l = S.pcPerfil[campo];
  S.pcPerfil[campo] = l.includes(v) ? l.filter(x => x !== v) : [...l, v];
  salvar(); perguntar(i);
}
function gerarPC() {
  const r = montar(S.pcPerfil);
  if (!r) { toast('Não achei peças suficientes hoje. Tente outro orçamento.'); return; }
  S.pc = { ids: r.ids, cabe: r.cabe, perfil: { ...S.pcPerfil }, em: Date.now() };
  salvar(); mostrarPC(); scrollTo(0, 0);
}
function pecasAtuais() {
  const pc = {};
  for (const [k, id] of Object.entries(S.pc.ids || {})) { const o = POR_ID.get(id); if (o) pc[k] = o.grupo ? GRUPOS.get(o.grupo)[0] : o; }
  return pc;
}
function mostrarPC() {
  const pc = pecasAtuais(), p = S.pc.perfil || {};
  const total = Object.values(pc).reduce((s, o) => s + o.pix, 0);
  const sobra = p.orc - total;
  const titulo = p.uso === 'trabalho' ? 'para trabalho e estudo' : p.uso === 'edicao' ? 'para edição e stream' : `para jogos em ${{ fhd: 'Full HD', '2k': '2K', '4k': '4K' }[p.tela] || 'Full HD'}`;
  const faltando = Object.keys(S.pc.ids).filter(k => !pc[k]);
  const desemp = pc.gpu ? servePara('gpu', pc.gpu) : pc.cpu ? 'Uso do dia a dia, estudo e trabalho com folga' : '';
  document.getElementById('app').innerHTML = `<div class="tela">
    <h1>Montar PC</h1>
    <div class="total">
      <div class="sub">Seu PC ${titulo}</div>
      <div class="linha" style="margin-top:4px"><span class="precoGrande">${brl(Math.round(total * 100) / 100)}</span><span class="sub" style="text-align:right">orçamento<br>${brl(p.orc)}</span></div>
      <div class="sub" style="margin-top:4px">${sobra >= 0 ? `no Pix, somando a loja mais barata de cada peça. Sobram ${brl(Math.round(sobra))}.` : `Passou ${brl(Math.round(-sobra))} do orçamento${S.pc.trocou ? '.' : ': com as ofertas de hoje, esse é o PC mais barato que dá para montar.'}`}</div>
      ${desemp ? `<div class="aviso" style="margin-top:10px">${esc(desemp)}.</div>` : ''}
      ${faltando.length ? `<div class="aviso ruim">${faltando.length} peça(s) saíram de oferta. Toque em "Refazer" para atualizar.</div>` : ''}
    </div>
    ${VAGAS.filter(([k]) => pc[k]).map(([k, nome]) => { const o = pc[k]; return `
      <div class="peca">
        <button class="foto" onclick="abrir('${esc(o.id)}')">${o.img ? `<img src="${esc(o.img)}" alt="" onerror="this.remove()">` : ''}</button>
        <div class="info" onclick="abrir('${esc(o.id)}')">
          <div class="rotulo">${nome}</div>
          <div class="nm">${esc(o.t)}</div>
          <div class="serve">${esc(servePara(k, o) || '')}</div>
          <button class="troca" onclick="event.stopPropagation();trocar('${k}')">Trocar</button>
        </div>
        <div class="pr">${brl(o.pix)}<div class="sub" style="font-weight:400">${esc(o.loja)}</div></div>
      </div>`; }).join('')}
    <h2>Compatibilidade</h2>
    <div class="texto">${checagens(pc).map(([ok, txt]) => `<div class="compat"><span class="${ok ? 'ok' : 'nao'}">${ok ? I.check : I.alerta}</span><span>${esc(txt)}</span></div>`).join('')}</div>
    <div class="acoes" style="flex-direction:column">
      <button class="btn cheio" onclick="curtirPC()">Avisar quando as peças baixarem</button>
      <button class="btn fraco cheio" onclick="S.pc.refazer=true;S.pc.passo=0;salvar();telaMontar()">Refazer as perguntas</button>
      <button class="btn fraco cheio" onclick="gerarPC()">Montar de novo com as ofertas de agora</button>
    </div>
    <div class="sub" style="margin-top:12px">As peças são escolhidas pela compatibilidade (soquete, memória, potência da fonte e tamanho) lida no nome dos anúncios. Confira a descrição na loja antes de comprar.</div>
  </div>`;
}
function trocar(vaga) {
  const pc = pecasAtuais(), atual = pc[vaga];
  const l = alternativas(vaga, pc).filter(o => o.id !== atual?.id).slice(0, 60);
  const ordem = vaga === 'gpu' || vaga === 'cpu' ? l.sort((a, b) => a.pix - b.pix) : l;
  document.getElementById('app').innerHTML = `<div class="tela">
    <div class="topo"><button class="voltar" onclick="mostrarPC()">${I.voltar} Voltar</button></div>
    <h1 style="margin-top:0">Trocar ${VAGAS.find(v => v[0] === vaga)[1].toLowerCase()}</h1>
    <div class="sub">Só aparecem peças compatíveis com o resto do PC. Atual: ${esc(atual?.t.slice(0, 60) || 'nenhuma')} (${brl(atual?.pix)})</div>
    ${vaga === 'cooler' || vaga === 'gpu' && S.pc.perfil?.uso === 'trabalho' ? `<button class="mais" onclick="escolher('${vaga}','')">Sem ${vaga === 'gpu' ? 'placa de vídeo' : 'cooler extra'}</button>` : ''}
    <div class="grupo" style="margin-top:12px">${ordem.map(o => { const d = o.pix - (atual?.pix || 0); return `
      <button class="item" style="width:100%;text-align:left" onclick="escolher('${vaga}','${esc(o.id)}')">
        <span style="min-width:0">${esc(o.t.slice(0, 80))}<small>${esc(o.loja)}${o.perf ? ' · desempenho ' + o.perf : ''}${servePara(vaga, o) && vaga !== 'gpu' ? ' · ' + esc(servePara(vaga, o)) : ''}</small></span>
        <span class="dir">${brl(o.pix)}<small style="color:${d <= 0 ? 'var(--verde)' : 'var(--sec)'}">${d <= 0 ? '−' : '+'}${brl(Math.abs(Math.round(d)))}</small></span></button>`; }).join('') || '<div class="item">Nenhuma alternativa compatível hoje.</div>'}</div>
  </div>`;
  scrollTo(0, 0);
}
function escolher(vaga, id) {
  if (id) S.pc.ids[vaga] = id; else delete S.pc.ids[vaga];
  S.pc.trocou = true;
  // trocou o processador ou a placa de vídeo: ajusta o que ficou incompatível
  const pc = pecasAtuais();
  for (const k of ['placa-mae', 'ram', 'fonte', 'gabinete']) {
    if (!pc[k] || k === vaga) continue;
    const ok = alternativas(k, { ...pc, [k]: undefined }).some(o => o.id === pc[k].id);
    if (!ok) { const novo = alternativas(k, pecasAtuais())[0]; if (novo) S.pc.ids[k] = novo.id; }
    Object.assign(pc, pecasAtuais());
  }
  if (vaga === 'cpu' && pc.cpu && !spec(pc.cpu).cooler && !pc.cooler) { const c = alternativas('cooler', pc).find(o => !spec(o).water); if (c) S.pc.ids.cooler = c.id; }
  salvar(); mostrarPC(); scrollTo(0, 0);
}
function curtirPC() {
  for (const o of Object.values(pecasAtuais())) if (!S.curtidas[o.id]) S.curtidas[o.id] = { t: o.t, img: o.img, pix: o.pix, loja: o.loja, cat: o.cat, em: Date.now() };
  salvar(); sincronizar();
  toast(S.push ? 'Pronto: você recebe aviso quando alguma peça baixar' : 'Peças salvas. Ative as notificações no Perfil para receber avisos.');
}
