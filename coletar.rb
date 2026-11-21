# Robô de coleta: junta ofertas de hardware, periféricos e games de várias lojas,
# compara o mesmo produto entre lojas, guarda o histórico de preços e dá uma nota de 0 a 100.
#
# Fontes:
#   KaBuM!   -> catálogo da própria loja (preço no Pix)
#   Zoom     -> comparador: Amazon, Magazine Luiza, Fast Shop, Americanas, KaBuM!...
#   Promobit -> promoções postadas pela comunidade: Pichau, Terabyte, Mercado Livre, AliExpress, Casas Bahia...
#
# Uso: ruby coletar.rb          (grava app/data/ofertas.json e app/data/historico.json)
#      RAPIDO=1 ruby coletar.rb  (1 página por busca, para testar)
require 'json'
require 'open3'
require 'date'
require 'time'

DIR = File.expand_path('app', __dir__)
DATA = File.join(DIR, 'data')
Dir.mkdir(DATA) unless Dir.exist?(DATA)
CFG = JSON.parse(File.read(File.join(DIR, 'categorias.json')))
PERF = JSON.parse(File.read(File.join(DIR, 'desempenho.json')))
RAPIDO = ENV['RAPIDO'] == '1'
HOJE = (Time.now.utc - 3 * 3600).strftime('%Y-%m-%d') # horário de Brasília
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
EXCLUIR = Regexp.new(CFG['excluir'], Regexp::IGNORECASE)
CATS = CFG['categorias']
CAT = CATS.map { |c| [c['id'], c] }.to_h
LOG = Hash.new(0)

def baixar(url, tentativas = 2)
  tentativas.times do |i|
    out, st = Open3.capture2('curl', '-s', '-L', '--compressed', '-m', '30', '-A', UA,
                             '-H', 'Accept-Language: pt-BR,pt;q=0.9', '-w', '\n%{http_code}', url)
    corpo, _, codigo = out.force_encoding('UTF-8').rpartition("\n")
    return corpo if st.success? && codigo == '200'
    warn "  #{codigo} #{url}" if i == tentativas - 1
    sleep 2
  end
  nil
end

def next_data(html)
  j = html && html[/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/m, 1]
  j ? JSON.parse(j) : nil
rescue JSON::ParserError
  nil
end

# percorre qualquer JSON e devolve os objetos (Hash) que passam no teste
def objetos(x, &teste)
  achados = []
  pilha = [x]
  until pilha.empty?
    o = pilha.pop
    if o.is_a?(Hash)
      achados << o if teste.call(o)
      pilha.concat(o.values)
    elsif o.is_a?(Array)
      pilha.concat(o)
    end
  end
  achados
end

def sem_acento(s)
  s.to_s.unicode_normalize(:nfd).gsub(/\p{Mn}/, '').downcase
end

# categoria pelo nome do produto (usada para o Promobit, que mistura tudo)
def classificar(titulo)
  t = sem_acento(titulo).strip
  return nil if t =~ EXCLUIR
  CATS.each { |c| return c['id'] if t =~ Regexp.new(sem_acento(c['re']), Regexp::IGNORECASE) }
  nil
end

# ---------- chip da placa de vídeo / processador (para custo-benefício e "mesmo chip") ----------
def chip_gpu(t)
  s = t.upcase.gsub(/GEFORCE|RADEON|NVIDIA|AMD/, ' ').gsub(/\s+/, ' ')
  if (m = s.match(/\b(RTX|GTX)\s?-?(\d{4})\s?(TI\s?SUPER|TI|SUPER)?\b/))
    nome = "#{m[1]} #{m[2]}#{m[3] ? ' ' + m[3].gsub(/\s/, ' ') : ''}".sub('TISUPER', 'TI SUPER')
  elsif (m = s.match(/\bRX\s?(\d{3,4})\s?(XTX|XT|GRE)?\b/))
    nome = "RX #{m[1]}#{m[2] ? ' ' + m[2] : ''}"
  elsif (m = s.match(/\bARC\s?([AB]\d{3})\b/))
    nome = "ARC #{m[1]}"
  else
    return nil
  end
  vram = s[/\b(\d{1,2})\s?GB\b/, 1]
  [nome.strip, vram]
end

def chip_cpu(t)
  s = t.upcase.gsub(/[®™]/, '')
  if (m = s.match(/RYZEN\s?([3579])\s?(\d{4}[A-Z0-9]*)/))
    "RYZEN #{m[1]} #{m[2]}"
  elsif (m = s.match(/\bI([3579])[-\s]?(\d{4,5}[A-Z]*)/))
    "I#{m[1]} #{m[2]}"
  elsif (m = s.match(/ULTRA\s?([579])\s?(\d{3}[A-Z]*)/))
    "ULTRA #{m[1]} #{m[2]}"
  end
end

def desempenho(cat, titulo)
  case cat
  when 'gpu'
    c, vram = chip_gpu(titulo)
    return [nil, nil] unless c
    [PERF['gpu'][c], vram ? "#{c} #{vram}GB" : c]
  when 'cpu'
    c = chip_cpu(titulo)
    return [nil, nil] unless c
    [PERF['cpu'][c], c]
  else
    [nil, nil]
  end
end

# códigos de fabricante (ex.: GV-N5060EAGLEMAX, 912-V537-037, CT1000P3SSD8) identificam o mesmo produto em lojas diferentes
def codigos(titulo)
  titulo.upcase.scan(/\b[A-Z0-9]+(?:[-\/][A-Z0-9]+)+\b|\b[A-Z0-9]{8,}\b/)
        .map { |x| x.gsub(/[-\/]/, '') }
        .select { |x| x.length >= 7 && x =~ /\d/ && x =~ /[A-Z]/ && x !~ /^\d+(GB|TB|MHZ|HZ|W|MM)$/ && x !~ /^(DDR\d|PCIE|GDDR|USB|HDMI|RGB|ARGB)/ }
        .uniq
end

PARADAS = %w[de da do para com e o a em gamer placa video processador memoria monitor notebook mouse teclado headset fonte gabinete
             jogo midia fisica sem fio preto preta branco branca rgb argb new novo original oficial pc ps5 ps4 playstation].freeze
def fichas(titulo)
  sem_acento(titulo).scan(/[a-z0-9]+/).reject { |w| w.length < 2 || PARADAS.include?(w) }.uniq
end

ofertas = []
def item(h)
  h['pix'] = h['pix'].to_f.round(2)
  h
end

# ---------- 1. KaBuM! ----------
puts 'KaBuM!...'
vistos = {}
CATS.each do |c|
  menu = Regexp.new(c['menu'])
  c['kabum'].each do |q|
    (RAPIDO ? 1 : 2).times do |pg|
      url = "https://servicespub.prod.api.aws.grupokabum.com.br/catalog/v2/products?page_size=100&page_number=#{pg + 1}&sort=most_searched&query=#{q.gsub(' ', '%20')}"
      j = (JSON.parse(baixar(url) || '{}') rescue {})
      (j['data'] || []).each do |d|
        a = d['attributes'] || {}
        next if vistos[d['id']] || a['menu'].to_s !~ menu
        next if a['is_marketplace'] || a['is_openbox'] || !a['available']
        next if sem_acento(a['title']) =~ EXCLUIR
        pix = (a['offer'] && a['offer']['price_with_discount']) || a['price_with_discount']
        parc = (a['offer'] && a['offer']['price']) || a['price']
        next unless pix && pix > 5
        vistos[d['id']] = true
        de = a['old_price'].to_f > parc.to_f ? a['old_price'] : nil
        ofertas << item('id' => "kabum:#{d['id']}", 'cat' => c['id'], 't' => a['title'].strip, 'img' => (a['images'] || [])[0],
                        'loja' => 'KaBuM!', 'pix' => pix, 'parc' => parc.to_f.round(2), 'de' => de,
                        'url' => "https://www.kabum.com.br/produto/#{d['id']}", 'fonte' => 'kabum',
                        'aval' => (a['number_of_ratings'].to_i >= 5 ? [a['score_of_ratings'].to_f.round(1), a['number_of_ratings']] : nil),
                        'relampago' => a['offer'] ? true : nil)
        LOG['KaBuM!'] += 1
      end
      sleep 0.4
    end
  end
end

# ---------- 2. Zoom (Amazon, Magalu, Fast Shop...) ----------
puts 'Zoom...'
zoom_cat = {}
CATS.each { |c| c['zoomCat'].each { |n| zoom_cat[sem_acento(n)] = c['id'] } }
confiaveis = CFG['lojasConfiaveis']
vistos = {}
CATS.each do |c|
  c['zoom'].each do |q|
    (RAPIDO ? 1 : 3).times do |pg|
      j = next_data(baixar("https://www.zoom.com.br/search?q=#{q.gsub(' ', '%20')}&page=#{pg + 1}"))
      break unless j
      objetos(j) { |o| o['price'] && o['name'] && o['type'] && o['url'] }.each do |o|
        cat = zoom_cat[sem_acento(o['categoryName'])] || (classificar(o['name']) == c['id'] ? c['id'] : nil)
        next unless cat
        next if sem_acento(o['name']) =~ EXCLUIR
        loja = o['merchantName'] || (o['bestOffer'] || {})['merchantName']
        produto = o['type'] == 'product'
        next if !produto && !confiaveis.include?(loja)
        next if o['marketplace']
        id = "zoom:#{o['type']}:#{o['sourceId'] || o['objectId']}"
        next if vistos[id]
        vistos[id] = true
        inst = o['installments'] || {}
        ofertas << item('id' => id, 'cat' => cat, 't' => o['name'].strip, 'img' => o['image'],
                        'loja' => loja || 'Várias lojas', 'pix' => o['price'], 'parc' => inst['total_value'] ? inst['total_value'].round(2) : nil,
                        'url' => "https://www.zoom.com.br#{o['url']}", 'fonte' => 'zoom',
                        'nlojas' => produto ? o['storeCount'] : nil, 'queda' => o['loweringPercentage'].to_f > 0 ? o['loweringPercentage'] : nil)
        LOG["Zoom (#{loja || 'várias'})"] += 1
      end
      sleep 0.6
    end
  end
end

# ---------- 3. Promobit (Pichau, Terabyte, Mercado Livre, AliExpress...) ----------
puts 'Promobit...'
limite = Date.parse(HOJE) - 4
CFG['promobitLojas'].each do |l|
  j = next_data(baixar("https://www.promobit.com.br/promocoes/loja/#{l['slug']}/"))
  lista = (((j || {})['props'] || {})['pageProps'] || {}).dig('serverOffers', 'offers') || []
  lista.each do |o|
    next if o['offerStatusName'] == 'FINISHED' || o['offerPriceType'] != 'NORMAL' || o['offerPrice'].to_f < 5
    next if (Date.parse(o['offerPublished'][0, 10]) rescue limite) < limite
    cat = classificar(o['offerTitle'])
    next unless cat
    foto = o['offerPhoto'].to_s
    foto = "https://i.promobit.com.br/268#{foto}" if foto.start_with?('/')
    ofertas << item('id' => "promobit:#{o['offerId']}", 'cat' => cat, 't' => o['offerTitle'].strip, 'img' => foto,
                    'loja' => l['loja'], 'pix' => o['offerPrice'], 'de' => o['offerOldPrice'].to_f > o['offerPrice'].to_f ? o['offerOldPrice'] : nil,
                    'url' => "https://www.promobit.com.br/oferta/#{o['offerSlug']}/", 'fonte' => 'promobit',
                    'cupom' => o['offerCoupon'], 'importado' => l['importado'] ? true : nil, 'postado' => o['offerPublished'][0, 16])
    LOG["Promobit (#{l['loja']})"] += 1
  end
  sleep 0.8
end

abort 'Nenhuma oferta coletada — mantendo os dados anteriores.' if ofertas.size < 50

# ---------- histórico de preços (menor preço de cada dia, 120 dias) ----------
arq_hist = File.join(DATA, 'historico.json')
hist = File.exist?(arq_hist) ? JSON.parse(File.read(arq_hist)) : {}
ofertas.each do |o|
  h = (hist[o['id']] ||= [])
  if h.last && h.last[0] == HOJE
    h.last[1] = [h.last[1], o['pix']].min
  else
    h << [HOJE, o['pix']]
  end
end
corte = (Date.parse(HOJE) - 120).to_s
hist.each_value { |h| h.reject! { |d, _| d < corte } }
hist.reject! { |_, h| h.empty? }

# ---------- mesmo produto em lojas diferentes ----------
pai = {}
achar = ->(x) { pai[x] == x ? x : (pai[x] = achar.(pai[x])) }
unir = ->(a, b) { pai[achar.(a)] = achar.(b) }
ofertas.each { |o| pai[o['id']] = o['id'] }
ofertas.group_by { |o| o['cat'] }.each_value do |lista|
  por_codigo = {}
  lista.each do |o|
    o['_f'] = fichas(o['t'])
    o['_n'] = o['_f'].select { |w| w =~ /\d/ }
    codigos(o['t']).each { |cd| por_codigo[cd] ? unir.(o['id'], por_codigo[cd]) : por_codigo[cd] = o['id'] }
  end
  # nomes muito parecidos (mesmas palavras e mesmos números) = mesmo produto
  lista.each_with_index do |a, i|
    next if a['_n'].empty?
    lista[(i + 1)..-1].each do |b|
      next if a['loja'] == b['loja'] || b['_n'].empty?
      menor, maior = [a['_n'], b['_n']].sort_by(&:size)
      next unless (menor - maior).empty?
      inter = (a['_f'] & b['_f']).size
      uniao = (a['_f'] | b['_f']).size
      unir.(a['id'], b['id']) if uniao > 0 && inter.to_f / uniao >= 0.6
    end
  end
end
grupos = ofertas.group_by { |o| achar.(o['id']) }
grupos.each_value do |g|
  g.sort_by! { |o| o['pix'] }
  lojas = g.map { |o| o['loja'] }.uniq
  g.each_with_index do |o, i|
    o['grupo'] = g.size > 1 ? g.first['id'] : nil
    o['maisBarato'] = lojas.size > 1 && o['pix'] <= g.first['pix'] + 0.01 ? true : nil
  end
end

# ---------- nota: metade histórico de preço, metade custo-benefício ----------
def mediana(v)
  s = v.sort
  s.empty? ? nil : (s[(s.size - 1) / 2] + s[s.size / 2]) / 2.0
end
def limitar(x, a, b)
  [[x, a].max, b].min
end

ofertas.each do |o|
  perf, chip = desempenho(o['cat'], o['t'])
  o['perf'] = perf
  o['chip'] = chip
end
# custo-benefício de placas e processadores: desempenho por real, comparado com a categoria
%w[gpu cpu].each do |cat|
  l = ofertas.select { |o| o['cat'] == cat && o['perf'] }
  next if l.empty?
  ordem = l.map { |o| o['perf'] / o['pix'] }.sort
  l.each { |o| o['_pct'] = ordem.index(o['perf'] / o['pix']).to_f / [ordem.size - 1, 1].max }
end

ofertas.each do |o|
  h = (hist[o['id']] || []).map { |_, p| p }
  ult30 = (hist[o['id']] || []).select { |d, _| d >= (Date.parse(HOJE) - 30).to_s }.map { |_, p| p }
  ref = ult30.size >= 3 ? mediana(ult30[0..-2]) : nil
  minimo = h.size >= 2 ? h[0..-2].min : nil
  motivos = []
  if ref
    queda = (ref - o['pix']) / ref
    hn = limitar(15 + queda * 100, 0, 35)
    motivos << (queda >= 0.03 ? "#{(queda * 100).round}% abaixo do normal" : queda <= -0.03 ? "#{(-queda * 100).round}% acima do normal" : 'no preço de sempre')
    o['acima'] = true if queda <= -0.03
  else
    off = o['de'] ? (o['de'] - o['pix']) / o['de'] : 0
    hn = limitar(10 + off * 40, 0, 28)
    motivos << "#{(off * 100).round}% off anunciado" if off >= 0.05
  end
  if minimo && o['pix'] <= minimo
    hn += 15
    motivos << 'menor preço já visto'
  elsif minimo && o['pix'] <= minimo * 1.03
    hn += 8
  end
  hn += 5 if o['queda']
  hn += 5 if o['relampago']
  cb = if o['_pct']
         10 + 40 * o['_pct']
       else
         base = 20
         base += 15 if o['maisBarato']
         base += 5 if !o['grupo']
         base += limitar((o['aval'][0] - 4) * 15, 0, 15) if o['aval']
         base
       end
  motivos << 'mais barato entre as lojas' if o['maisBarato']
  motivos << 'ótimo desempenho pelo preço' if o['_pct'] && o['_pct'] >= 0.8
  o['nota'] = limitar((limitar(hn, 0, 50) + limitar(cb, 0, 50)).round, 0, 100)
  o['np'] = [limitar(hn, 0, 50).round, limitar(cb, 0, 50).round]
  o['ref'] = ref&.round(2)
  o['min'] = minimo
  o['motivos'] = motivos
end

# ---------- grava ----------
ofertas.each { |o| o.delete_if { |k, v| k.start_with?('_') || v.nil? || v == [] } }
ofertas.sort_by! { |o| -o['nota'] }
info = { 'atualizado' => Time.now.utc.iso8601, 'total' => ofertas.size, 'porFonte' => LOG }
File.write(File.join(DATA, 'ofertas.json'), JSON.generate('info' => info, 'ofertas' => ofertas))
File.write(arq_hist, JSON.generate(hist))
puts "#{ofertas.size} ofertas: " + LOG.map { |k, v| "#{k} #{v}" }.join(', ')
