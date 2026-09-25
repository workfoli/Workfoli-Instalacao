#!/usr/bin/env node
/*
 * render.js — transforma HTML em imagem (slides) ou PDF.
 * Usado pelo /carrossel, /publicar-tema, /aprovar-post e /proposta.
 *
 * Uso:
 *   node scripts/render.js <arquivo.html>                       cada .slide vira PNG em <pasta do html>/instagram/
 *   node scripts/render.js <arquivo.html> --jpg                 também gera .jpg (a API do Instagram só aceita JPEG)
 *   node scripts/render.js <arquivo.html> --size 1080x1920 --out tiktok
 *   node scripts/render.js <arquivo.html> --pdf                 gera <arquivo>.pdf da página inteira (A4)
 *
 * Preparação (uma vez só, na raiz do projeto):
 *   npm install
 *   npx playwright install chromium    (opcional se a máquina já tiver Chrome ou Edge)
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright não encontrado. Rode uma vez, na raiz do projeto: npm install');
  process.exit(1);
}

const USO = 'Uso: node scripts/render.js <arquivo.html> [--jpg] [--pdf] [--size LARGURAxALTURA] [--out pasta]';

function lerArgumentos(argv) {
  const opcoes = { size: '1080x1350', out: 'instagram', jpg: false, pdf: false, html: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--jpg') opcoes.jpg = true;
    else if (arg === '--pdf') opcoes.pdf = true;
    else if (arg === '--size') opcoes.size = argv[++i];
    else if (arg === '--out') opcoes.out = argv[++i];
    else if (!opcoes.html) opcoes.html = arg;
  }
  return opcoes;
}

// Tenta o Chromium do Playwright; se não estiver instalado, usa o Chrome ou o Edge da máquina.
async function abrirNavegador() {
  for (const opcoes of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try {
      return await chromium.launch(opcoes);
    } catch {}
  }
  throw new Error('Nenhum navegador disponível. Rode: npx playwright install chromium');
}

async function main() {
  const opcoes = lerArgumentos(process.argv.slice(2));
  const [largura, altura] = String(opcoes.size).split('x').map(Number);
  if (!opcoes.html || !largura || !altura) throw new Error(USO);

  const arquivoHtml = path.resolve(opcoes.html);
  if (!fs.existsSync(arquivoHtml)) throw new Error(`Arquivo não encontrado: ${arquivoHtml}`);

  const navegador = await abrirNavegador();
  try {
    const pagina = await navegador.newPage({ viewport: { width: largura, height: altura }, deviceScaleFactor: 1 });
    await pagina.goto(pathToFileURL(arquivoHtml).href, { waitUntil: 'networkidle' });
    await pagina.evaluate(() => document.fonts.ready);

    if (opcoes.pdf) {
      const arquivoPdf = arquivoHtml.replace(/\.html?$/i, '') + '.pdf';
      await pagina.pdf({ path: arquivoPdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
      console.log(`✓ PDF: ${path.relative(process.cwd(), arquivoPdf)}`);
      return;
    }

    const slides = await pagina.$$('.slide');
    if (slides.length === 0) throw new Error('Nenhum elemento com class="slide" no HTML.');

    const pastaSaida = path.resolve(path.dirname(arquivoHtml), opcoes.out);
    fs.mkdirSync(pastaSaida, { recursive: true });

    for (let i = 0; i < slides.length; i++) {
      const caixa = await slides[i].boundingBox();
      if (caixa && (Math.round(caixa.width) !== largura || Math.round(caixa.height) !== altura)) {
        console.warn(`! slide ${i + 1} mede ${Math.round(caixa.width)}x${Math.round(caixa.height)} (esperado ${largura}x${altura})`);
      }
      const nome = `slide-${String(i + 1).padStart(2, '0')}`;
      await slides[i].screenshot({ path: path.join(pastaSaida, `${nome}.png`) });
      if (opcoes.jpg) {
        await slides[i].screenshot({ path: path.join(pastaSaida, `${nome}.jpg`), type: 'jpeg', quality: 92 });
      }
    }
    console.log(`✓ ${slides.length} slide(s) em ${path.relative(process.cwd(), pastaSaida)}`);
  } finally {
    await navegador.close();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
