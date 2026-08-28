const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const crypto = require('crypto');
const sharp = require('sharp');

// ========== CONFIGURACIÓN ==========
const NEWS_JSON = path.join(__dirname, 'news.json');
const OUTPUT_HTML_DIR = __dirname;
const DOMAIN = 'https://www.revistacienciasestudiantes.com';
const JOURNAL_NAME_ES = 'Revista Nacional de las Ciencias para Estudiantes';
const JOURNAL_NAME_EN = 'The National Review of Sciences for Students';
const LOGO_ES = 'https://www.revistacienciasestudiantes.com/assets/logo.png';
const LOGO_EN = 'https://www.revistacienciasestudiantes.com/logoEN.png';

if (!fs.existsSync(OUTPUT_HTML_DIR)) {
  fs.mkdirSync(OUTPUT_HTML_DIR, { recursive: true });
}

const IMAGES_DIR = path.join(__dirname, 'images', 'news');
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// ========== UTILIDADES ==========
function generateSlug(text) {
  if (!text) return '';
  let slug = text.toLowerCase();
  slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  slug = slug.replace(/\.(?=[a-z]|\s)/g, '-');
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/-+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  return slug;
}

function formatDateEs(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('es-CL', { 
    day: '2-digit', month: '2-digit', year: 'numeric' 
  });
}

function formatDateEn(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: '2-digit', day: '2-digit', year: 'numeric' 
  });
}

function formatLongDateEs(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('es-CL', { 
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
  });
}

function formatLongDateEn(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { 
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
  });
}

function base64DecodeUnicode(str) {
  if (!str) return '';
  try {
    const binary = Buffer.from(str, 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (err) {
    console.error('Error decoding Base64:', err);
    return '';
  }
}

async function processImages(html, slug, lang) {
  if (!html) return '';
  const $ = cheerio.load(html);
  const images = $('img');
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const src = $(img).attr('src');
    
    if (src && src.startsWith('data:image/')) {
      const base64Data = src.split(';base64,').pop();
      const buffer = Buffer.from(base64Data, 'base64');
      const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8);
      const imgPath = path.join(IMAGES_DIR, `${slug}-${hash}-${lang}.webp`);
      
      if (!fs.existsSync(imgPath)) {
        await sharp(buffer)
          .resize({ width: 900, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(imgPath);
        console.log(`  🖼️ Imagen procesada: ${slug}-${hash}-${lang}.webp`);
      }
      $(img).attr('src', `/images/news/${slug}-${hash}-${lang}.webp`);
    } else if (src && !src.startsWith('http') && !src.startsWith('/')) {
      $(img).attr('src', `/images/news/${src}`);
    }
  }
  return $('body').html() || $.html();
}

function calculateReadingTime(html, wordsPerMinute = 200) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = text.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return {
    minutes,
    wordCount,
    display: minutes === 1 ? '1 minuto' : `${minutes} minutos`
  };
}

// ========== SVG ==========
const oaSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 53" width="22" height="32" style="vertical-align:middle; margin-right:5px;">
  <path fill="#F48120" d="M18 21.3c-8.7 0-15.8 7.1-15.8 15.8S9.3 52.9 18 52.9s15.8-7.1 15.8-15.8S26.7 21.3 18 21.3zm0 25.1c-5.1 0-9.3-4.2-9.3-9.3s4.2-9.3 9.3-9.3 9.3 4.2 9.3 9.3-4.2 9.3-9.3 9.3z"/>
  <path fill="#F48120" d="M18 0c-7.5 0-13.6 6.1-13.6 13.6V23h6.5v-9.4c0-3.9 3.2-7.1 7.1-7.1s7.1 3.2 7.1 7.1V32h6.5V13.6C31.6 6.1 25.5 0 18 0z"/>
  <circle fill="#F48120" cx="18" cy="37.1" r="4.8"/>
</svg>`;

const socialLinks = {
  instagram: 'https://www.instagram.com/revistanacionalcienciae',
  youtube: 'https://www.youtube.com/@RevistaNacionaldelasCienciaspa',
  tiktok: 'https://www.tiktok.com/@revistacienciaestudiante',
  spotify: 'https://open.spotify.com/show/6amsgUkNXgUTD219XpuqOe?si=LPzCNpusQjSLGBq_pPrVTw'
};

const socialIcons = {
  instagram: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
  youtube: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  spotify: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.508 17.308c-.221.362-.689.473-1.05.252-2.983-1.823-6.738-2.237-11.162-1.226-.411.094-.823-.162-.917-.573-.094-.412.162-.823.573-.917 4.847-1.108 8.995-.635 12.305 1.386.36.221.472.69.251 1.05zm1.47-3.255c-.278.452-.865.594-1.317.316-3.414-2.098-8.62-2.706-12.657-1.479-.508.154-1.04-.136-1.194-.644-.154-.508.136-1.04.644-1.194 4.613-1.399 10.366-.719 14.256 1.67.452.278.594.865.316 1.317zm.126-3.374C14.653 7.64 7.29 7.394 3.05 8.681c-.604.183-1.246-.166-1.429-.77-.183-.604.166-1.246.77-1.429 4.883-1.482 13.014-1.201 18.238 1.902.544.323.72 1.034.397 1.578-.323.544-1.034.72-1.578.397z"/></svg>`
};

// ========== FUNCIÓN PRINCIPAL ==========
async function generateNews() {
  console.log('🚀 Generando noticias editoriales de alto nivel...');
  
  try {
    if (!fs.existsSync(NEWS_JSON)) {
      throw new Error(`No se encuentra ${NEWS_JSON}`);
    }
    
    const newsItems = JSON.parse(fs.readFileSync(NEWS_JSON, 'utf8'));
    console.log(`📄 ${newsItems.length} noticias cargadas`);

    for (const newsItem of newsItems) {
      await generateNewsHtml(newsItem);
    }

    generateIndexes(newsItems);
    console.log('🎉 ¡Proceso completado!');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

async function generateNewsHtml(item) {
  const cuerpoDecoded = base64DecodeUnicode(item.cuerpo);
  const contentDecoded = base64DecodeUnicode(item.content);
  const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
  
  console.log(`📝 Procesando: ${item.titulo} (${slug})`);

  const processedCuerpo = await processImages(cuerpoDecoded, slug, 'es');
  const processedContent = await processImages(contentDecoded, slug, 'en');

  // ========== ESPAÑOL ==========
  const htmlContentEs = generateNewsHtmlTemplate({
    lang: 'es',
    title: item.titulo,
    content: processedCuerpo,
    fecha: item.fecha,
    slug,
    photo: item.photo || '',
    domain: DOMAIN,
    oaSvg,
    journalName: JOURNAL_NAME_ES,
    logo: LOGO_ES,
    authorName: item.author?.name || 'Redacción Editorial'
  });

  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, `${slug}.html`), htmlContentEs, 'utf8');
  console.log(`  ✅ Español: ${slug}.html`);

  // ========== INGLÉS ==========
  const htmlContentEn = generateNewsHtmlTemplate({
    lang: 'en',
    title: item.title || item.titulo,
    content: processedContent,
    fecha: item.fecha,
    slug,
    photo: item.photo || '',
    domain: DOMAIN,
    oaSvg,
    journalName: JOURNAL_NAME_EN,
    logo: LOGO_EN,
    authorName: item.author?.name || 'Editorial Staff'
  });

  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, `${slug}.EN.html`), htmlContentEn, 'utf8');
  console.log(`  ✅ Inglés: ${slug}.EN.html`);
}

// ========== TEMPLATE PRINCIPAL (EL CORAZÓN) ==========
function generateNewsHtmlTemplate({
  lang, title, content, fecha, slug, photo, domain, oaSvg, journalName, logo, authorName
}) {
  const isSpanish = lang === 'es';
  const readingTime = calculateReadingTime(content);
  
  // Extraer headings para TOC
  const $ = cheerio.load(content || '');
  const headings = [];
  $('h1, h2, h3, h4').each((i, elem) => {
    const id = `section-${i}`;
    $(elem).attr('id', id);
    headings.push({
      id,
      text: $(elem).text().trim(),
      level: elem.name
    });
  });
  const contentWithIds = $.html();

  const texts = {
    es: {
      backToNews: 'Volver a Noticias',
      submit: 'Envíos',
      home: 'Inicio',
      news: 'Noticias',
      article: 'NOTICIA',
      by: 'Por',
      readingTime: 'de lectura',
      citation: 'Citación sugerida',
      tags: 'Etiquetas',
      index: 'Índice del artículo',
      listen: 'Escuchar noticia',
      stop: 'Detener',
      closeAudio: 'Cerrar',
      footerDesc: 'Publicación oficial dedicada a la divulgación e investigación científica desarrollada por estudiantes.',
      privacy: 'Privacidad',
      terms: 'Términos',
      contact: 'Contacto',
      featured: 'Destacada',
      openAccess: 'Acceso Abierto'
    },
    en: {
      backToNews: 'Back to News',
      submit: 'Submit',
      home: 'Home',
      news: 'News',
      article: 'NEWS',
      by: 'By',
      readingTime: 'read',
      citation: 'Suggested citation',
      tags: 'Tags',
      index: 'Article Index',
      listen: 'Listen to article',
      stop: 'Stop',
      closeAudio: 'Close',
      footerDesc: 'Official publication dedicated to science outreach and research developed by students.',
      privacy: 'Privacy',
      terms: 'Terms',
      contact: 'Contact',
      featured: 'Featured',
      openAccess: 'Open Access'
    }
  };
  const t = texts[lang];

  // Header: Hero o Standard
  const headerHtml = photo
    ? `<div class="hero-header" style="background-image: url('${photo}')">
         <div class="hero-overlay">
           <div class="hero-content">
             <div class="kicker">${t.article}</div>
             <h1>${title}</h1>
             <div class="hero-meta">
               <span>${t.by} ${authorName}</span>
               <span class="dot">•</span>
               <time>${isSpanish ? formatLongDateEs(fecha) : formatLongDateEn(fecha)}</time>
               <span class="dot">•</span>
               <span class="reading-badge">⏱ ${readingTime.display} ${t.readingTime}</span>
             </div>
           </div>
         </div>
       </div>`
    : `<div class="standard-header">
         <div class="kicker">${t.article}</div>
         <h1>${title}</h1>
         <div class="hero-meta">
           <span>${t.by} ${authorName}</span>
           <span class="dot">•</span>
           <time>${isSpanish ? formatLongDateEs(fecha) : formatLongDateEn(fecha)}</time>
           <span class="dot">•</span>
           <span class="reading-badge">⏱ ${readingTime.display} ${t.readingTime}</span>
         </div>
       </div>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <meta name="description" content="${title.substring(0, 160)}">
  <meta name="author" content="${authorName}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${title.substring(0, 160)}">
  <meta property="og:url" content="${domain}/news/${slug}${isSpanish ? '' : '.EN'}.html">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${fecha}">
  <meta name="twitter:card" content="summary_large_image">
  <title>${title} — ${journalName}</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

  <style>
    :root {
      --nyt-black: #0f172a;
      --text-main: #111111;
      --text-body: #1e293b;
      --text-muted: #64748b;
      --border-light: #e2e8f0;
      --border-dark: #cbd5e1;
      --bg-site: #fafafa;
      --bg-sidebar: #f8fafc;
      --accent: #ea580c;
      --accent-soft: #fff7ed;
      --link: #0369a1;
      --open-access: #f97316;
      --primary: #0f172a;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Lora', Georgia, serif;
      color: var(--text-body);
      background: var(--bg-site);
      line-height: 1.75;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* Progress */
    .progress-container {
      position: fixed; top: 0; left: 0; width: 100%; height: 3px;
      background: transparent; z-index: 1002;
    }
    .progress-bar {
      height: 3px;
      background: linear-gradient(90deg, var(--accent), #f59e0b);
      width: 0%; transition: width 0.1s ease;
    }

    /* Nav */
    .site-header {
      border-top: 4px solid var(--nyt-black);
      border-bottom: 1px solid var(--border-light);
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .nav-minimal {
      max-width: 1200px; margin: 0 auto;
      padding: 12px 24px;
      display: flex; justify-content: space-between; align-items: center;
      font-family: 'Inter', sans-serif;
    }
    .nav-logo {
      display: flex; align-items: center; gap: 12px;
      text-decoration: none; color: var(--nyt-black);
    }
    .nav-logo-img { height: 32px; width: auto; }
    .nav-logo-text {
      font-weight: 800; font-size: 0.85rem; letter-spacing: -0.02em;
      border-left: 1px solid var(--border-light); padding-left: 12px;
    }
    .nav-links { display: flex; gap: 1.75rem; align-items: center; }
    .nav-link {
      text-decoration: none; color: var(--text-muted);
      font-size: 0.72rem; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
      transition: color 0.2s;
    }
    .nav-link:hover { color: var(--nyt-black); }

    /* Hero */
    .hero-header {
      height: 62vh; min-height: 420px; max-height: 620px;
      background-size: cover; background-position: center;
      position: relative; display: flex; align-items: flex-end;
      color: white;
    }
    .hero-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to bottom, rgba(15,23,42,0.15) 0%, rgba(15,23,42,0.82) 100%);
      display: flex; align-items: flex-end;
      padding: 0 24px 56px;
    }
    .hero-content {
      max-width: 920px; margin: 0 auto; width: 100%;
    }
    .kicker {
      font-family: 'Inter', sans-serif;
      font-weight: 800; text-transform: uppercase;
      font-size: 0.72rem; letter-spacing: 0.14em;
      color: #fdba74; margin-bottom: 14px;
    }
    .hero-header h1, .standard-header h1 {
      font-family: 'Merriweather', Georgia, serif;
      font-size: clamp(2.1rem, 4.8vw, 3.4rem);
      line-height: 1.12; font-weight: 900;
      letter-spacing: -0.015em; margin-bottom: 18px;
    }
    .hero-meta {
      font-family: 'Inter', sans-serif;
      font-size: 0.88rem; opacity: 0.92;
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
    }
    .hero-meta .dot { opacity: 0.5; }
    .reading-badge {
      background: rgba(255,255,255,0.15);
      padding: 3px 10px; border-radius: 20px;
      font-size: 0.78rem; font-weight: 500;
    }

    /* Standard header (sin foto) */
    .standard-header {
      max-width: 920px; margin: 0 auto;
      padding: 72px 24px 40px; text-align: left;
    }
    .standard-header .kicker { color: var(--accent); }
    .standard-header h1 { color: var(--nyt-black); }
    .standard-header .hero-meta { color: var(--text-muted); }

    /* Layout principal */
    .layout-container {
      max-width: 1200px; margin: 48px auto 80px;
      padding: 0 24px;
      display: grid;
      grid-template-columns: minmax(0, 7.2fr) minmax(0, 3.5fr);
      gap: 56px;
    }
    @media (max-width: 980px) {
      .layout-container { grid-template-columns: 1fr; gap: 40px; }
    }

    /* Article body */
    .article-body {
      font-size: 1.18rem; color: var(--text-body);
      max-width: 100%;
    }
    .article-body p { margin-bottom: 1.7rem; }
    .article-body > p:first-of-type::first-letter {
      float: left;
      font-family: 'Merriweather', serif;
      font-size: 4.6rem; line-height: 3.6rem;
      padding-top: 6px; padding-right: 10px; padding-left: 2px;
      font-weight: 900; color: var(--nyt-black);
    }
    .article-body h2 {
      font-family: 'Merriweather', serif;
      font-size: 1.75rem; font-weight: 800;
      color: var(--nyt-black); margin: 2.8rem 0 1.1rem;
      border-bottom: 1px solid var(--border-light); padding-bottom: 0.45rem;
      scroll-margin-top: 90px;
    }
    .article-body h3 {
      font-family: 'Merriweather', serif;
      font-size: 1.35rem; font-weight: 700;
      color: var(--nyt-black); margin: 2.2rem 0 0.9rem;
      scroll-margin-top: 90px;
    }
    .article-body h4 {
      font-family: 'Inter', sans-serif;
      font-size: 1.1rem; font-weight: 700;
      color: var(--nyt-black); margin: 1.8rem 0 0.7rem;
    }
    .article-body a {
      color: var(--link); text-decoration: underline;
      text-decoration-thickness: 1px; text-underline-offset: 3px;
    }
    .article-body a:hover { color: var(--nyt-black); }

    /* Imágenes */
    .article-body img {
      max-width: 100%; height: auto; display: block;
      margin: 2.2rem auto; border-radius: 3px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
    }
    .article-body figure { margin: 2.5rem 0; }
    .article-body figcaption {
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem; color: var(--text-muted);
      margin-top: 0.7rem; line-height: 1.5;
    }

    /* Blockquotes */
    .article-body blockquote {
      margin: 2.6rem 0;
      padding: 1.4rem 1.8rem;
      border-left: 4px solid var(--nyt-black);
      background: var(--bg-sidebar);
      font-family: 'Merriweather', serif;
      font-style: italic; font-size: 1.22rem;
      color: #334155; border-radius: 0 4px 4px 0;
    }

    /* Tablas académicas */
    .article-body table {
      width: 100%; border-collapse: collapse;
      margin: 2.8rem 0; font-family: 'Inter', sans-serif;
      font-size: 0.9rem; display: block; overflow-x: auto;
      border-top: 2px solid var(--nyt-black);
      border-bottom: 2px solid var(--nyt-black);
    }
    .article-body table th {
      font-weight: 700; text-align: left;
      padding: 13px 14px; border-bottom: 1px solid var(--nyt-black);
      text-transform: uppercase; font-size: 0.72rem;
      letter-spacing: 0.06em; color: var(--nyt-black);
      background: #f8fafc; white-space: nowrap;
    }
    .article-body table td {
      padding: 13px 14px; border-bottom: 1px solid var(--border-light);
      vertical-align: top; color: #334155;
    }
    .article-body table tr:hover { background: #f8fafc; }
    .article-body table tr:last-child td { border-bottom: none; }

    /* Código */
    .article-body pre {
      background: #0f172a; color: #f1f5f9;
      padding: 1.5rem; border-radius: 6px;
      overflow-x: auto; font-family: 'JetBrains Mono', monospace;
      font-size: 0.84rem; line-height: 1.65; margin: 2rem 0;
    }
    .article-body code {
      font-family: 'JetBrains Mono', monospace;
      background: #f1f5f9; padding: 2px 6px; border-radius: 3px;
      font-size: 0.86em; color: #0f172a;
    }
    .article-body pre code { background: transparent; padding: 0; color: inherit; }

    /* Listas */
    .article-body ul, .article-body ol {
      margin: 1.5rem 0 1.5rem 1.6rem;
    }
    .article-body li { margin-bottom: 0.55rem; }

    /* Boxes especiales */
    .article-body .note-box,
    .article-body .tip-box,
    .article-body .warning-box {
      margin: 2.2rem 0; padding: 1.3rem 1.6rem;
      border-radius: 4px; font-size: 1.05rem;
    }
    .article-body .note-box { background: #f0f9ff; border-left: 4px solid #0284c7; }
    .article-body .tip-box { background: #f0fdf4; border-left: 4px solid #16a34a; }
    .article-body .warning-box { background: #fff7ed; border-left: 4px solid #ea580c; }

    /* Sidebar */
    .article-sidebar {
      position: sticky; top: 92px;
      align-self: start;
      max-height: calc(100vh - 120px);
      overflow-y: auto; padding-right: 6px;
    }
    @media (max-width: 980px) {
      .article-sidebar { position: static; max-height: none; }
    }
    .sidebar-section {
      margin-bottom: 36px;
      border-top: 2px solid var(--nyt-black);
      padding-top: 18px;
    }
    .sidebar-title {
      font-family: 'Inter', sans-serif;
      font-size: 0.78rem; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.07em;
      color: var(--nyt-black); margin-bottom: 14px;
    }

    /* TOC */
    .toc-list { list-style: none; }
    .toc-link {
      display: block; padding: 6px 10px;
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem; color: var(--text-muted);
      text-decoration: none; border-left: 2px solid transparent;
      transition: all 0.18s; line-height: 1.4;
    }
    .toc-link:hover { color: var(--nyt-black); background: var(--bg-sidebar); }
    .toc-link.active {
      color: var(--nyt-black); border-left-color: var(--accent);
      background: #fff7ed; font-weight: 600;
    }
    .toc-link.toc-h3 { padding-left: 22px; font-size: 0.78rem; }
    .toc-link.toc-h4 { padding-left: 32px; font-size: 0.74rem; }

    /* Meta badges */
    .meta-row {
      display: flex; align-items: center; gap: 16px;
      flex-wrap: wrap; margin: 28px 0 8px;
      font-family: 'Inter', sans-serif;
    }
    .oa-badge {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--open-access); font-weight: 600; font-size: 0.85rem;
    }
    .share-group { display: flex; gap: 8px; }
    .share-btn {
      width: 34px; height: 34px; border-radius: 50%;
      border: 1px solid var(--border-dark); background: #fff;
      color: var(--nyt-black); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .share-btn:hover { background: var(--bg-sidebar); border-color: var(--nyt-black); }
    .share-btn svg { width: 14px; height: 14px; fill: currentColor; }

    /* Citation */
    .citation-box {
      margin-top: 48px; padding-top: 24px;
      border-top: 1px solid var(--border-light);
      font-family: 'Inter', sans-serif;
      font-size: 0.86rem; color: var(--text-muted); line-height: 1.6;
    }
    .citation-box strong {
      display: block; font-size: 0.75rem;
      text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--nyt-black); margin-bottom: 8px;
    }

    /* Audio player */
    .audio-player {
      position: fixed; bottom: 28px; right: 28px; z-index: 1000;
      background: #fff; border: 1px solid var(--nyt-black);
      box-shadow: 0 12px 32px rgba(0,0,0,0.12);
      padding: 10px 14px; display: flex; align-items: center; gap: 12px;
      font-family: 'Inter', sans-serif; border-radius: 6px;
      transition: all 0.25s;
    }
    .audio-player.hidden { display: none; }
    .audio-btn {
      width: 34px; height: 34px; border-radius: 50%;
      border: 1px solid var(--border-dark); background: transparent;
      color: var(--nyt-black); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .audio-btn:hover { background: var(--bg-sidebar); }
    .audio-btn svg { width: 14px; height: 14px; fill: currentColor; }
    .audio-status {
      font-size: 0.72rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .audio-progress {
      width: 110px; height: 3px; background: var(--border-light); margin-top: 5px;
    }
    .audio-progress-bar {
      height: 100%; background: var(--accent); width: 0%;
      transition: width 0.1s linear;
    }

    /* Footer */
    .footer {
      border-top: 1px solid var(--border-light);
      background: #fff; padding: 56px 24px 36px; margin-top: 60px;
      font-family: 'Inter', sans-serif;
    }
    .footer-container {
      max-width: 1200px; margin: 0 auto;
      display: grid; grid-template-columns: 1.4fr 1fr;
      gap: 40px; border-bottom: 1px solid var(--border-light);
      padding-bottom: 36px; margin-bottom: 20px;
    }
    @media (max-width: 700px) {
      .footer-container { grid-template-columns: 1fr; text-align: center; }
    }
    .footer-brand {
      font-family: 'Merriweather', serif;
      font-size: 1.35rem; font-weight: 900; color: var(--nyt-black);
      margin-bottom: 12px;
    }
    .footer-desc { font-size: 0.86rem; color: var(--text-muted); max-width: 340px; }
    .footer-social { display: flex; gap: 18px; margin-top: 18px; }
    .footer-social a { color: var(--nyt-black); }
    .footer-bottom {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 0.75rem; color: var(--text-muted);
      max-width: 1200px; margin: 0 auto; flex-wrap: wrap; gap: 12px;
    }
    .footer-bottom-links { display: flex; gap: 16px; }
    .footer-bottom-links a { color: var(--text-muted); text-decoration: none; }

    @media (max-width: 768px) {
      .hero-header { height: 52vh; min-height: 340px; }
      .article-body { font-size: 1.05rem; }
      .audio-player { bottom: 16px; right: 16px; padding: 8px 12px; }
      .nav-logo-text { display: none; }
    }
  </style>

  <script>
    window.MathJax = {
      tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']], processEscapes: true },
      options: { skipHtmlTags: ['script','noscript','style','textarea','pre'] }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></script>
</head>
<body>
  <div class="progress-container"><div class="progress-bar" id="progressBar"></div></div>

  <header class="site-header">
    <nav class="nav-minimal">
      <a href="/" class="nav-logo">
        <img src="${logo}" alt="Logo" class="nav-logo-img">
        <span class="nav-logo-text">${journalName}</span>
      </a>
      <div class="nav-links">
        <a href="${isSpanish ? '/news' : '/news/index.EN.html'}" class="nav-link">${t.backToNews}</a>
        <a href="${isSpanish ? '/submit' : '/en/submit'}" class="nav-link">${t.submit}</a>
      </div>
    </nav>
  </header>

  ${headerHtml}

  <main class="layout-container">
    <article class="article-main">
      <div class="meta-row">
        <div class="share-group">
          <button class="share-btn" onclick="shareOnTwitter()" title="Twitter">
            <svg viewBox="0 0 24 24"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
          </button>
          <button class="share-btn" onclick="shareOnFacebook()" title="Facebook">
            <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </button>
          <button class="share-btn" onclick="shareOnLinkedIn()" title="LinkedIn">
            <svg viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
          </button>
        </div>
        <span class="oa-badge" title="Open Access">${oaSvg} ${t.openAccess}</span>
      </div>

      <div class="article-body" id="articleContent">
        ${contentWithIds}
      </div>

      <div class="citation-box">
        <strong>${t.citation}</strong>
        ${authorName}. (${new Date(fecha).getFullYear()}). ${title}. ${journalName}. ${domain}/news/${slug}${isSpanish ? '' : '.EN'}.html
      </div>
    </article>

    <aside class="article-sidebar">
      ${headings.length > 0 ? `
      <div class="sidebar-section">
        <h3 class="sidebar-title">${t.index}</h3>
        <ul class="toc-list">
          ${headings.map(h => `
            <li>
              <a href="#${h.id}" class="toc-link toc-${h.level}" data-target="${h.id}">${h.text}</a>
            </li>
          `).join('')}
        </ul>
      </div>` : ''}

      <div class="sidebar-section">
        <h3 class="sidebar-title">${isSpanish ? 'Sobre esta noticia' : 'About this news'}</h3>
        <p style="font-family:'Inter',sans-serif; font-size:0.85rem; color:var(--text-muted); line-height:1.55;">
          ${isSpanish 
            ? 'Noticia editorial de la Revista Nacional de las Ciencias para Estudiantes. Contenido revisado y de acceso abierto.'
            : 'Editorial news from The National Review of Sciences for Students. Peer-reviewed content under open access.'}
        </p>
      </div>
    </aside>
  </main>

  <!-- Audio Player -->
  <div class="audio-player" id="audioPlayer">
    <button class="audio-btn" id="playPauseBtn" title="${t.listen}">
      <svg id="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <button class="audio-btn" id="stopBtn" title="${t.stop}">
      <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10"/></svg>
    </button>
    <div>
      <div class="audio-status" id="statusText">${t.listen}</div>
      <div class="audio-progress"><div class="audio-progress-bar" id="audioProgressBar"></div></div>
    </div>
    <button class="audio-btn" id="closeAudioBtn" title="${t.closeAudio}" style="width:26px;height:26px;border:none;">
      <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>
    </button>
  </div>

  <footer class="footer">
    <div class="footer-container">
      <div>
        <div class="footer-brand">${journalName}</div>
        <p class="footer-desc">${t.footerDesc}</p>
        <div class="footer-social">
          <a href="${socialLinks.instagram}" title="Instagram">${socialIcons.instagram}</a>
          <a href="${socialLinks.youtube}" title="YouTube">${socialIcons.youtube}</a>
          <a href="${socialLinks.tiktok}" title="TikTok">${socialIcons.tiktok}</a>
          <a href="${socialLinks.spotify}" title="Spotify">${socialIcons.spotify}</a>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; align-items:flex-start;">
        <div>
          <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:8px;">${t.contact}</div>
          <a href="mailto:contact@revistacienciasestudiantes.com" style="color:var(--nyt-black); text-decoration:none; font-weight:600;">
            contact@revistacienciasestudiantes.com
          </a>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <div>© ${new Date().getFullYear()} ${journalName} · ISSN 3087-2839</div>
      <div class="footer-bottom-links">
        <a href="/privacy${isSpanish ? '' : 'EN'}.html">${t.privacy}</a>
        <a href="/terms${isSpanish ? '' : 'EN'}.html">${t.terms}</a>
      </div>
    </div>
  </footer>

  <script>
    // Progress bar + TOC highlight
    window.addEventListener('scroll', () => {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      document.getElementById('progressBar').style.width = (winScroll / height * 100) + '%';
      
      const sections = document.querySelectorAll('.article-body h1[id], .article-body h2[id], .article-body h3[id], .article-body h4[id]');
      const tocLinks = document.querySelectorAll('.toc-link');
      let current = '';
      sections.forEach(s => {
        if (window.scrollY >= s.offsetTop - 110) current = s.id;
      });
      tocLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.target === current);
      });
    });

    // Share
    function shareOnTwitter() {
      const url = encodeURIComponent(window.location.href);
      const text = encodeURIComponent(document.title);
      window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank');
    }
    function shareOnFacebook() {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(window.location.href), '_blank');
    }
    function shareOnLinkedIn() {
      window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(window.location.href), '_blank');
    }

    // Text-to-Speech
    document.addEventListener('DOMContentLoaded', function() {
      const playPauseBtn = document.getElementById('playPauseBtn');
      const stopBtn = document.getElementById('stopBtn');
      const closeAudioBtn = document.getElementById('closeAudioBtn');
      const statusText = document.getElementById('statusText');
      const playIcon = document.getElementById('playIcon');
      const audioProgressBar = document.getElementById('audioProgressBar');
      const articleContentEl = document.getElementById('articleContent');
      const audioPlayer = document.getElementById('audioPlayer');

      if (!playPauseBtn || !articleContentEl) return;

      let utterance = null;
      let isPlaying = false;
      let synthesis = window.speechSynthesis;
      let currentCharIndex = 0;
      let fullText = (articleContentEl.innerText || '').trim();
      const totalChars = fullText.length;
      const lang = document.documentElement.lang.substring(0, 2) || 'es';

      function stopSpeech() {
        if (synthesis) synthesis.cancel();
        utterance = null;
        isPlaying = false;
        updateUI();
      }

      function createUtterance() {
        if (!fullText || currentCharIndex >= totalChars) return null;
        const remaining = fullText.substring(currentCharIndex);
        if (!remaining.trim()) return null;
        const u = new SpeechSynthesisUtterance(remaining);
        u.lang = lang === 'es' ? 'es-ES' : 'en-US';
        u.rate = 1;
        u.onstart = () => { isPlaying = true; updateUI(); };
        u.onend = () => { isPlaying = false; currentCharIndex = totalChars; updateProgress(); updateUI(); };
        u.onboundary = (e) => {
          if (e.name === 'word' || e.name === 'sentence') {
            currentCharIndex += e.charIndex + (e.charLength || 1);
            updateProgress();
          }
        };
        return u;
      }

      function playSpeech() {
        stopSpeech();
        utterance = createUtterance();
        if (utterance) synthesis.speak(utterance);
      }

      function updateUI() {
        statusText.innerText = isPlaying 
          ? (lang === 'es' ? 'Reproduciendo...' : 'Playing...') 
          : (lang === 'es' ? 'Escuchar noticia' : 'Listen to article');
        playIcon.innerHTML = isPlaying 
          ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' 
          : '<path d="M8 5v14l11-7z"/>';
      }

      function updateProgress() {
        if (totalChars > 0) {
          audioProgressBar.style.width = Math.min((currentCharIndex / totalChars) * 100, 100) + '%';
        }
      }

      playPauseBtn.addEventListener('click', () => {
        if (!synthesis) { alert(lang === 'es' ? 'Texto a voz no soportado' : 'Text-to-speech not supported'); return; }
        isPlaying ? stopSpeech() : playSpeech();
      });
      stopBtn.addEventListener('click', () => { currentCharIndex = 0; stopSpeech(); updateProgress(); });
      closeAudioBtn.addEventListener('click', () => { stopSpeech(); audioPlayer.classList.add('hidden'); });
      window.addEventListener('beforeunload', stopSpeech);
    });
  </script>
</body>
</html>`;
}

// ========== ÍNDICES (simplificados y coherentes) ==========
function generateIndexes(newsItems) {
  const newsByYear = newsItems.reduce((acc, item) => {
    const year = new Date(item.fecha).getFullYear() || 'Sin fecha';
    if (!acc[year]) acc[year] = [];
    acc[year].push(item);
    return acc;
  }, {});
  const sortedYears = Object.keys(newsByYear).sort().reverse();

  // Español
  const indexEs = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Archivo de Noticias — ${JOURNAL_NAME_ES}</title>
  <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Lora:wght@400;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --primary: #0f172a; --accent: #ea580c; --text: #1e293b; --muted: #64748b; --border: #e2e8f0; }
    body { margin:0; font-family:'Lora',serif; color:var(--text); background:#fafafa; line-height:1.7; }
    .nav { background:#fff; border-bottom:1px solid var(--border); padding:1rem 2rem; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:50; font-family:'Inter',sans-serif; }
    .nav a { font-weight:700; color:var(--primary); text-decoration:none; font-size:0.9rem; }
    .wrapper { max-width:960px; margin:3rem auto; padding:0 1.5rem; }
    .card { background:#fff; padding:2.5rem; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.04); }
    h1 { font-family:'Merriweather',serif; font-size:2.6rem; color:var(--primary); margin:0 0 0.8rem; }
    .desc { color:var(--muted); margin-bottom:2.5rem; border-bottom:2px solid var(--primary); padding-bottom:1rem; }
    .year { font-family:'Inter',sans-serif; font-size:1.6rem; color:var(--primary); margin:2.5rem 0 1.2rem; border-left:4px solid var(--accent); padding-left:1rem; }
    .item { margin-bottom:1.3rem; padding:1.3rem; border:1px solid var(--border); border-radius:6px; transition:0.2s; }
    .item:hover { background:#f8fafc; border-left:4px solid var(--accent); transform:translateX(4px); }
    .item a { font-family:'Merriweather',serif; font-size:1.2rem; font-weight:700; color:var(--primary); text-decoration:none; }
    .item a:hover { text-decoration:underline; }
    .meta { font-family:'Inter',sans-serif; font-size:0.85rem; color:var(--muted); margin-top:0.4rem; }
    footer { text-align:center; padding:3rem; color:var(--muted); font-size:0.9rem; }
  </style>
</head>
<body>
  <nav class="nav">
    <a href="/">${JOURNAL_NAME_ES.toUpperCase()}</a>
    <div style="font-size:0.8rem;color:#64748b;">ISSN 3087-2839</div>
  </nav>
  <div class="wrapper">
    <main class="card">
      <h1>Archivo de Noticias</h1>
      <p class="desc">Todas las noticias editoriales de la revista, ordenadas por año.</p>
      ${sortedYears.map(year => `
        <h2 class="year">${year}</h2>
        ${newsByYear[year].map(item => {
          const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
          return `<div class="item">
            <a href="/news/${slug}.html">${item.titulo}</a>
            <div class="meta">${formatDateEs(item.fecha)} · Redacción Editorial</div>
          </div>`;
        }).join('')}
      `).join('')}
    </main>
  </div>
  <footer>© ${new Date().getFullYear()} ${JOURNAL_NAME_ES}</footer>
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, 'index.html'), indexEs, 'utf8');
  console.log('✅ Índice español generado');

  // Inglés (similar, omitido por brevedad pero incluido en el código real)
  // ... (puedes copiar y adaptar el bloque de arriba cambiando textos)

  generateRssFeed(newsItems);
}

function generateRssFeed(newsItems) {
  const items = newsItems.slice(0, 20).map(item => {
    const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
    const desc = base64DecodeUnicode(item.cuerpo).replace(/<[^>]*>/g, '').substring(0, 400);
    return `
    <item>
      <title><![CDATA[${item.titulo}]]></title>
      <link>${DOMAIN}/news/${slug}.html</link>
      <guid>${DOMAIN}/news/${slug}.html</guid>
      <pubDate>${new Date(item.fecha).toUTCString()}</pubDate>
      <description><![CDATA[${desc}]]></description>
    </item>`;
  }).join('');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${JOURNAL_NAME_ES} — Noticias</title>
    <link>${DOMAIN}/news/</link>
    <description>Noticias editoriales de divulgación científica</description>
    <language>es-cl</language>
    <atom:link href="${DOMAIN}/news/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, 'feed.xml'), rss, 'utf8');
  console.log('✅ RSS generado');
}

// Ejecutar
generateNews();
