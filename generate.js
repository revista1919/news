const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const crypto = require('crypto');
const sharp = require('sharp');

// ========== CONFIGURACIÓN ==========
const NEWS_JSON = path.join(__dirname, 'news.json');
const OUTPUT_HTML_DIR = __dirname;  // El directorio actual
const DOMAIN = 'https://www.revistacienciasestudiantes.com';
const JOURNAL_NAME_ES = 'Revista Nacional de las Ciencias para Estudiantes';
const JOURNAL_NAME_EN = 'The National Review of Sciences for Students';
const LOGO_ES = 'https://www.revistacienciasestudiantes.com/assets/logo.png';
const LOGO_EN = 'https://www.revistacienciasestudiantes.com/logoEN.png';

// Asegurar que existe el directorio de salida
if (!fs.existsSync(OUTPUT_HTML_DIR)) {
  fs.mkdirSync(OUTPUT_HTML_DIR, { recursive: true });
}

// Directorio para imágenes procesadas
const IMAGES_DIR = path.join(__dirname, 'images', 'news');
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// ========== UTILIDADES ==========
function generateSlug(text) {
  if (!text) return '';
  
  // 1. Convertir a minúsculas
  let slug = text.toLowerCase();
  
  // 2. Eliminar tildes
  slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // 3. Reemplazar puntos seguidos de letras o espacios por un guión
  slug = slug.replace(/\.(?=[a-z]|\s)/g, '-');
  
  // 4. Reemplazar cualquier otro carácter no deseado por guiones
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  
  // 5. Eliminar guiones múltiples y guiones al principio o final
  slug = slug.replace(/-+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  
  return slug;
}

function formatDateEs(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('es-CL', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

function formatDateEn(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: 'numeric' 
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
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  } catch (err) {
    console.error('Error decoding Base64:', err);
    return '';
  }
}

function isBase64(str) {
  if (!str) return false;
  const base64Regex = /^data:image\/(png|jpe?g|gif|webp);base64,/;
  return base64Regex.test(str);
}

async function processImages(html, slug, lang) {
  const $ = cheerio.load(html);
  const images = $('img');
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const src = $(img).attr('src');
    
    if (src && src.startsWith('data:image/')) {
      // Es una imagen base64, procesarla
      const base64Data = src.split(';base64,').pop();
      const buffer = Buffer.from(base64Data, 'base64');
      const hash = crypto.createHash('md5').update(buffer).digest('hex').slice(0, 8);
      
      const imgDir = IMAGES_DIR;
      const imgPath = path.join(imgDir, `${slug}-${hash}-${lang}.webp`);
      
      if (!fs.existsSync(imgPath)) {
        await sharp(buffer)
          .resize({ width: 800, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(imgPath);
        console.log(`  🖼️ Imagen procesada: ${slug}-${hash}-${lang}.webp`);
      }
      
      $(img).attr('src', `/images/news/${slug}-${hash}-${lang}.webp`);
    } else if (src && !src.startsWith('http')) {
      // Es una ruta relativa, mantenerla igual pero asegurar que apunta a la ubicación correcta
      if (src.startsWith('/')) {
        // Ya es absoluta dentro del sitio
        $(img).attr('src', src);
      } else {
        // Es relativa, asumir que está en /images/news/
        $(img).attr('src', `/images/news/${src}`);
      }
    }
    // Si es URL absoluta (http), dejarla igual
  }
  
  return $.html();
}

// ========== SVG ICONS ==========
const oaSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 53" width="24" height="36" style="vertical-align:middle; margin-right:4px;">
  <path fill="#F48120" d="M18 21.3c-8.7 0-15.8 7.1-15.8 15.8S9.3 52.9 18 52.9s15.8-7.1 15.8-15.8S26.7 21.3 18 21.3zm0 25.1c-5.1 0-9.3-4.2-9.3-9.3s4.2-9.3 9.3-9.3 9.3 4.2 9.3 9.3-4.2 9.3-9.3 9.3z"/>
  <path fill="#F48120" d="M18 0c-7.5 0-13.6 6.1-13.6 13.6V23h6.5v-9.4c0-3.9 3.2-7.1 7.1-7.1s7.1 3.2 7.1 7.1V32h6.5V13.6C31.6 6.1 25.5 0 18 0z"/>
  <circle fill="#F48120" cx="18" cy="37.1" r="4.8"/>
</svg>`;

// ========== FUNCIÓN PRINCIPAL ==========
async function generateNews() {
  console.log('🚀 Iniciando generación de noticias estáticas...');
  console.log('📁 Directorio de salida:', OUTPUT_HTML_DIR);
  
  try {
    // 1. Leer news.json
    if (!fs.existsSync(NEWS_JSON)) {
      throw new Error(`No se encuentra ${NEWS_JSON}`);
    }
    
    const newsItems = JSON.parse(fs.readFileSync(NEWS_JSON, 'utf8'));
    console.log(`📄 ${newsItems.length} noticias cargadas`);

    // 2. Generar HTML para cada noticia
    for (const newsItem of newsItems) {
      await generateNewsHtml(newsItem);
    }

    // 3. Generar índices
    generateIndexes(newsItems);

    console.log('🎉 ¡Proceso completado con éxito!');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

async function generateNewsHtml(item) {
  // Decodificar contenidos
  const cuerpoDecoded = base64DecodeUnicode(item.cuerpo);
  const contentDecoded = base64DecodeUnicode(item.content);
  
  // Generar slug
  const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
  
  console.log(`📝 Procesando: ${item.titulo} (${slug})`);

  // Procesar imágenes en el contenido
  const processedCuerpo = await processImages(cuerpoDecoded, slug, 'es');
  const processedContent = await processImages(contentDecoded, slug, 'en');

  // ========== HTML ESPAÑOL ==========
  const headerImageHtmlEs = item.photo
    ? `<div class="hero-header" style="background-image: url('${item.photo}')">
         <div class="hero-overlay">
           <div class="hero-content">
             <span class="kicker">Noticias Académicas</span>
             <h1>${item.titulo}</h1>
             <div class="hero-meta">
               <span class="author">Redacción Editorial</span> •
               <span class="date">${formatDateEs(item.fecha)}</span>
             </div>
           </div>
         </div>
       </div>`
    : `<div class="standard-header">
         <span class="kicker">Noticias Académicas</span>
         <h1>${item.titulo}</h1>
         <div class="hero-meta" style="color: #666">
           <span class="author">Redacción Editorial</span> •
           <span class="date">${formatDateEs(item.fecha)}</span>
         </div>
       </div>`;

  const htmlContentEs = generateNewsHtmlTemplate({
    lang: 'es',
    title: item.titulo,
    content: processedCuerpo,
    fecha: item.fecha,
    slug,
    headerImageHtml: headerImageHtmlEs,
    domain: DOMAIN,
    oaSvg,
    journalName: JOURNAL_NAME_ES,
    logo: LOGO_ES
  });

  const filePathEs = path.join(OUTPUT_HTML_DIR, `${slug}.html`);
  fs.writeFileSync(filePathEs, htmlContentEs, 'utf8');
  console.log(`  ✅ Español: ${slug}.html`);

  // ========== HTML INGLÉS ==========
  const headerImageHtmlEn = item.photo
    ? `<div class="hero-header" style="background-image: url('${item.photo}')">
         <div class="hero-overlay">
           <div class="hero-content">
             <span class="kicker">Academic News</span>
             <h1>${item.title}</h1>
             <div class="hero-meta">
               <span class="author">Editorial Staff</span> •
               <span class="date">${formatDateEn(item.fecha)}</span>
             </div>
           </div>
         </div>
       </div>`
    : `<div class="standard-header">
         <span class="kicker">Academic News</span>
         <h1>${item.title}</h1>
         <div class="hero-meta" style="color: #666">
           <span class="author">Editorial Staff</span> •
           <span class="date">${formatDateEn(item.fecha)}</span>
         </div>
       </div>`;

  const htmlContentEn = generateNewsHtmlTemplate({
    lang: 'en',
    title: item.title,
    content: processedContent,
    fecha: item.fecha,
    slug,
    headerImageHtml: headerImageHtmlEn,
    domain: DOMAIN,
    oaSvg,
    journalName: JOURNAL_NAME_EN,
    logo: LOGO_EN
  });

  const filePathEn = path.join(OUTPUT_HTML_DIR, `${slug}.EN.html`);
  fs.writeFileSync(filePathEn, htmlContentEn, 'utf8');
  console.log(`  ✅ Inglés: ${slug}.EN.html`);
}

function generateNewsHtmlTemplate({
  lang,
  title,
  content,
  fecha,
  slug,
  headerImageHtml,  // <-- Esto ya contiene el HTML del header procesado
  domain,
  oaSvg,
  journalName,
  logo,
  photo  // <-- Añade photo como parámetro opcional
}) {
  const isSpanish = lang === 'es';
  
  const texts = {
    es: {
      backToNews: 'Volver a Noticias',
      backToHome: 'Volver al inicio',
      share: 'Compartir',
      published: 'Publicado',
      editorialStaff: 'Redacción Editorial',
      license: 'Licencia',
      licenseText: 'Este trabajo está bajo una licencia',
      ccLicense: 'Creative Commons Atribución 4.0 Internacional',
      excellence: 'Excelencia en Divulgación Científica Estudiantil'
    },
    en: {
      backToNews: 'Back to News',
      backToHome: 'Back to home',
      share: 'Share',
      published: 'Published',
      editorialStaff: 'Editorial Staff',
      license: 'License',
      licenseText: 'This work is licensed under a',
      ccLicense: 'Creative Commons Attribution 4.0 International License',
      excellence: 'Excellence in Student Scientific Outreach'
    }
  };

  const t = texts[lang];

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <meta name="description" content="${title.substring(0, 160)}...">
  <meta name="keywords" content="${isSpanish ? 'noticias, revista ciencias estudiantes, divulgación científica' : 'news, student science journal, scientific outreach'}, ${title.replace(/[^a-zA-Z0-9]/g, ' ').substring(0, 100)}">
  <meta name="author" content="${isSpanish ? 'Revista Nacional de las Ciencias para Estudiantes' : 'The National Review of Sciences for Students'}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${title.substring(0, 160)}...">
  ${photo ? `<meta property="og:image" content="${photo}">` : ''}  <!-- <-- Ahora usa photo correctamente -->
  <meta property="og:url" content="${domain}/news/${slug}${isSpanish ? '' : '.EN'}.html">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${fecha}">
  <meta name="twitter:card" content="summary_large_image">
  <title>${title} - ${isSpanish ? 'Noticias' : 'News'} - ${journalName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Lora:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #005a7d;
      --primary-dark: #003e56;
      --nyt-black: #121212;
      --text-main: #222222;
      --text-light: #595959;
      --text-muted: #6b7280;
      --border-color: #e5e7eb;
      --bg-soft: #f8f9fa;
      --bg-hover: #f3f4f6;
      --accent: #c2410c;
    }

    * {
      max-width: 100vw;
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: 'Lora', serif;
      color: var(--text-main);
      background-color: #fff;
      line-height: 1.8;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* Navigation minimal */
    .nav-minimal {
      border-bottom: 1px solid var(--border-color);
      padding: 0.75rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      position: sticky;
      top: 0;
      z-index: 100;
      font-family: 'Inter', sans-serif;
    }

    .nav-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--nyt-black);
    }

    .nav-logo-img {
      height: 36px;
      width: auto;
      object-fit: contain;
    }

    .nav-logo-text {
      font-weight: 600;
      font-size: 0.85rem;
      border-left: 1px solid var(--border-color);
      padding-left: 12px;
      color: var(--text-main);
    }

    .nav-links {
      display: flex;
      gap: 2rem;
      align-items: center;
    }

    .nav-link {
      text-decoration: none;
      color: var(--text-main);
      font-size: 0.8rem;
      font-weight: 500;
      transition: color 0.2s;
    }

    .nav-link:hover {
      color: var(--primary);
    }

    /* Hero Header */
    .hero-header {
      height: 70vh;
      min-height: 400px;
      background-size: cover;
      background-position: center;
      position: relative;
      display: flex;
      align-items: flex-end;
      color: white;
    }

    .hero-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%);
      display: flex;
      align-items: flex-end;
      padding: 60px 20px;
    }

    .hero-content, .standard-header {
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }

    .standard-header {
      padding: 80px 20px 40px;
      text-align: center;
      max-width: 800px;
      margin: 0 auto;
    }

    .kicker {
      display: block;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.7rem;
      letter-spacing: 3px;
      color: var(--primary);
      margin-bottom: 15px;
    }

    h1 {
      font-family: 'Playfair Display', serif;
      font-size: clamp(2.5rem, 5vw, 4rem);
      line-height: 1.1;
      margin: 0 0 20px 0;
      font-weight: 900;
    }

    .hero-meta {
      font-family: 'Inter', sans-serif;
      font-size: 0.85rem;
      opacity: 0.9;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    /* Article Body */
    .article-body {
      max-width: 700px;
      margin: 60px auto;
      padding: 0 20px;
      font-size: 1.2rem;
    }

    .article-body p {
      margin-bottom: 2rem;
    }

    .article-body > p:first-of-type::first-letter {
      float: left;
      font-size: 5rem;
      line-height: 4rem;
      padding-top: 4px;
      padding-right: 8px;
      padding-left: 3px;
      font-family: 'Playfair Display', serif;
      font-weight: 700;
      color: var(--primary);
    }

    .article-body h2, .article-body h3 {
      font-family: 'Playfair Display', serif;
      font-size: 2rem;
      margin-top: 50px;
      border-top: 2px solid var(--primary);
      padding-top: 20px;
    }

    .article-body h3 {
      font-size: 1.5rem;
      border-top: 1px solid var(--border-color);
    }

    .article-body strong {
      color: var(--primary);
    }

    .article-body a {
      color: var(--primary);
      text-decoration: none;
      border-bottom: 1px dotted var(--primary);
    }

    .article-body a:hover {
      border-bottom: 1px solid var(--primary);
    }

    .article-body img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 1.5rem 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .article-body blockquote {
      margin: 3rem 2rem;
      padding: 1rem 2rem;
      border-left: 4px solid var(--primary);
      background: var(--bg-soft);
      font-style: italic;
      color: var(--text-light);
    }

    .article-body ul, .article-body ol {
      margin: 1.5rem 0 1.5rem 2rem;
    }

    .article-body li {
      margin-bottom: 0.5rem;
    }

    .article-body code:not(pre code) {
      background: var(--bg-soft);
      padding: 2px 4px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      color: var(--primary-dark);
    }

    .article-body pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 1.5rem;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      margin: 2rem 0;
    }

    /* Action Bar */
    .action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 700px;
      margin: 40px auto 20px;
      padding: 20px 20px 0;
      border-top: 1px solid var(--border-color);
      font-family: 'Inter', sans-serif;
    }

    .share-buttons {
      display: flex;
      gap: 1rem;
    }

    .share-btn {
      background: none;
      border: none;
      padding: 8px;
      cursor: pointer;
      color: var(--text-muted);
      transition: color 0.2s;
    }

    .share-btn:hover {
      color: var(--primary);
    }

    .oa-label {
      display: flex;
      align-items: center;
      color: #F48120;
      font-weight: 500;
      font-size: 0.9rem;
      gap: 4px;
    }

    /* Back Navigation */
    .back-nav {
      max-width: 700px;
      margin: 40px auto 20px;
      border-top: 2px solid var(--nyt-black);
      padding: 20px 20px 0;
      display: flex;
      justify-content: space-between;
      font-family: 'Inter', sans-serif;
    }

    .back-nav a {
      font-size: 0.85rem;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--nyt-black);
      text-decoration: none;
      transition: color 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .back-nav a:hover {
      color: var(--primary);
    }

    /* Footer */
    .footer {
      background: var(--bg-soft);
      border-top: 1px solid var(--border-color);
      padding: 60px 20px;
      text-align: center;
      font-family: 'Inter', sans-serif;
      margin-top: 60px;
    }

    .footer-content {
      max-width: 700px;
      margin: 0 auto;
    }

    .footer-logo {
      font-family: 'Playfair Display', serif;
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: var(--primary);
    }

    .footer-text {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 2rem;
      font-size: 0.8rem;
    }

    .footer-links a {
      color: var(--text-main);
      text-decoration: none;
    }

    .footer-links a:hover {
      color: var(--primary);
    }

    .license-section {
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border-color);
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .license-section a {
      color: var(--primary);
      text-decoration: none;
    }

    /* Mobile Optimizations */
    @media (max-width: 768px) {
      .nav-minimal {
        padding: 0.5rem 1rem;
      }

      .nav-logo-img {
        height: 28px;
      }

      .nav-logo-text {
        display: none;
      }

      .nav-links {
        gap: 1rem;
      }

      .hero-header {
        height: 60vh;
      }

      h1 {
        font-size: 2.2rem;
      }

      .article-body {
        font-size: 1.1rem;
        margin: 40px auto;
      }

      .article-body > p:first-of-type::first-letter {
        font-size: 4rem;
        line-height: 3.2rem;
      }

      .article-body blockquote {
        margin: 2rem 1rem;
        padding: 1rem;
      }

      .article-body ul, .article-body ol {
        margin: 1rem 0 1rem 1.5rem;
      }

      .action-bar {
        flex-direction: column;
        gap: 1rem;
        align-items: flex-start;
      }

      .back-nav {
        flex-direction: column;
        gap: 1rem;
        align-items: center;
      }

      .footer-links {
        flex-direction: column;
        gap: 1rem;
      }
    }

    @media (max-width: 480px) {
      h1 {
        font-size: 1.8rem;
      }

      .article-body {
        font-size: 1rem;
      }

      .article-body > p:first-of-type::first-letter {
        font-size: 3.5rem;
        line-height: 2.8rem;
      }
    }
  </style>
</head>
<body>
  <nav class="nav-minimal">
    <a href="/" class="nav-logo">
      <img src="${logo}" alt="Logo" class="nav-logo-img">
      <span class="nav-logo-text">${journalName}</span>
    </a>
    <div class="nav-links">
      <a href="${isSpanish ? '/es/new' : '/en/new'}" class="nav-link">${t.backToNews}</a>
      <a href="${isSpanish ? '/submit' : '/en/submit'}" class="nav-link">${isSpanish ? 'Envíos' : 'Submissions'}</a>
      <a href="${isSpanish ? '/faq' : '/en/faq'}" class="nav-link">${isSpanish ? 'Ayuda' : 'Help'}</a>
    </div>
  </nav>

  <header>
    ${headerImageHtml}
  </header>

  <main class="article-body">
    <article class="ql-editor">
      ${content}
    </article>

    <div class="action-bar">
      <div class="share-buttons">
        <button class="share-btn" onclick="shareOnTwitter()" title="Twitter">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>
          </svg>
        </button>
        <button class="share-btn" onclick="shareOnFacebook()" title="Facebook">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
          </svg>
        </button>
        <button class="share-btn" onclick="shareOnLinkedIn()" title="LinkedIn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
            <rect x="2" y="9" width="4" height="12"/>
            <circle cx="4" cy="4" r="2"/>
          </svg>
        </button>
      </div>
      <span class="oa-label">
        ${oaSvg}
        Open Access
      </span>
    </div>

    <div class="back-nav">
      <a href="${isSpanish ? '/es/new' : '/en/new'}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
        </svg>
        ${t.backToNews}
      </a>
      <a href="/">
        ${t.backToHome}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </a>
    </div>
  </main>

  <footer class="footer">
    <div class="footer-content">
      <div class="footer-logo">${journalName}</div>
      <div class="footer-text">
        ${t.excellence}<br>
        ISSN: 3087-2839
      </div>
      <div class="footer-links">
        <a href="${isSpanish ? '/about' : '/en/about'}">${isSpanish ? 'Sobre Nosotros' : 'About'}</a>
        <a href="${isSpanish ? '/guidelines' : '/en/guidelines'}">${isSpanish ? 'Directrices' : 'Guidelines'}</a>
        <a href="${isSpanish ? '/faq' : '/en/faq'}">FAQ</a>
        <a href="${isSpanish ? '/contact' : '/en/contact'}">${isSpanish ? 'Contacto' : 'Contact'}</a>
      </div>
      <div class="license-section">
        <p>
          ${t.licenseText} 
          <a href="https://creativecommons.org/licenses/by/4.0/deed.${lang}" target="_blank" rel="license noopener">
            ${t.ccLicense}
          </a>
        </p>
        <p style="margin-top: 0.5rem;">© ${new Date().getFullYear()} ${journalName}</p>
      </div>
    </div>
  </footer>

  <script>
    // Funciones de compartir en redes sociales
    function shareOnTwitter() {
      const url = encodeURIComponent(window.location.href);
      const text = encodeURIComponent("${title}");
      window.open(\`https://twitter.com/intent/tweet?url=\${url}&text=\${text}\`, '_blank');
    }

    function shareOnFacebook() {
      const url = encodeURIComponent(window.location.href);
      window.open(\`https://www.facebook.com/sharer/sharer.php?u=\${url}\`, '_blank');
    }

    function shareOnLinkedIn() {
      const url = encodeURIComponent(window.location.href);
      const title = encodeURIComponent("${title}");
      window.open(\`https://www.linkedin.com/sharing/share-offsite/?url=\${url}\`, '_blank');
    }

    // Smooth scroll para enlaces internos
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Detectar y resaltar el código si existe
    if (document.querySelector('pre code')) {
      // Aquí podrías cargar highlight.js dinámicamente si quisieras
      console.log('Bloques de código detectados');
    }
  </script>
</body>
</html>`;
}

function generateIndexes(newsItems) {
  // Agrupar por año
  const newsByYear = newsItems.reduce((acc, item) => {
    const year = new Date(item.fecha).getFullYear() || 'Sin fecha';
    if (!acc[year]) acc[year] = [];
    acc[year].push(item);
    return acc;
  }, {});

  // Ordenar años descendente
  const sortedYears = Object.keys(newsByYear).sort().reverse();

  // ========== ÍNDICE ESPAÑOL ==========
  const indexContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Archivo de Noticias - Revista Nacional de las Ciencias para Estudiantes</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Lora:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #005a7d;
      --text-main: #222222;
      --text-light: #595959;
      --border-color: #e5e7eb;
      --bg-soft: #f8f9fa;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Lora', serif;
      color: var(--text-main);
      background-color: #f5f5f5;
      line-height: 1.8;
    }
    .nav-minimal {
      background: white;
      border-bottom: 1px solid var(--border-color);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      font-family: 'Inter', sans-serif;
    }
    .nav-logo {
      font-weight: 700;
      color: var(--primary);
      text-decoration: none;
      font-size: 0.9rem;
      letter-spacing: 0.5px;
    }
    .main-wrapper {
      max-width: 1000px;
      margin: 3rem auto;
      padding: 0 2rem;
    }
    .content-card {
      background: white;
      padding: 3rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    h1 {
      font-family: 'Playfair Display', serif;
      font-size: 3rem;
      margin: 0 0 1rem;
      line-height: 1.2;
      color: var(--primary);
    }
    .description {
      color: var(--text-light);
      margin-bottom: 3rem;
      font-size: 1.1rem;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 1rem;
    }
    .year-section {
      margin-bottom: 3rem;
    }
    .year-title {
      font-family: 'Inter', sans-serif;
      font-size: 2rem;
      color: var(--primary);
      margin: 0 0 1.5rem;
      border-left: 4px solid var(--primary);
      padding-left: 1rem;
    }
    .news-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .news-item {
      margin-bottom: 1.5rem;
      padding: 1.5rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      transition: all 0.2s;
    }
    .news-item:hover {
      background: var(--bg-soft);
      transform: translateX(5px);
      border-left: 4px solid var(--primary);
    }
    .news-link {
      color: var(--primary);
      text-decoration: none;
      font-size: 1.3rem;
      font-weight: 600;
      display: block;
      margin-bottom: 0.5rem;
      font-family: 'Playfair Display', serif;
    }
    .news-link:hover {
      text-decoration: underline;
    }
    .news-meta {
      color: var(--text-light);
      font-size: 0.9rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-family: 'Inter', sans-serif;
    }
    .news-excerpt {
      margin-top: 1rem;
      color: var(--text-main);
      font-size: 1rem;
    }
    footer {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-light);
      font-size: 0.9rem;
      background: white;
      border-top: 1px solid var(--border-color);
    }
    @media (max-width: 768px) {
      .main-wrapper { padding: 0 1rem; }
      .content-card { padding: 1.5rem; }
      h1 { font-size: 2.2rem; }
      .year-title { font-size: 1.6rem; }
      .news-link { font-size: 1.1rem; }
    }
  </style>
</head>
<body>
  <nav class="nav-minimal">
    <a href="/" class="nav-logo">REVISTA NACIONAL DE LAS CIENCIAS PARA ESTUDIANTES</a>
    <div class="issn">ISSN: 3087-2839</div>
  </nav>
  <div class="main-wrapper">
    <main class="content-card">
      <h1>Archivo de Noticias</h1>
      <p class="description">Todas las noticias de la revista, ordenadas por año de publicación.</p>
      
      ${sortedYears.map(year => `
      <section class="year-section">
        <h2 class="year-title">${year}</h2>
        <ul class="news-list">
          ${newsByYear[year].map(item => {
            const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
            const excerpt = base64DecodeUnicode(item.cuerpo).replace(/<[^>]*>/g, '').substring(0, 150) + '...';
            return `
            <li class="news-item">
              <a href="/news/${slug}.html" class="news-link">${item.titulo}</a>
              <div class="news-meta">
                <span class="date">${formatDateEs(item.fecha)}</span>
                <span class="author">Redacción Editorial</span>
              </div>
              <div class="news-excerpt">${excerpt}</div>
            </li>
          `;
          }).join('')}
        </ul>
      </section>
      `).join('')}
    </main>
  </div>
  <footer>
    <p>&copy; ${new Date().getFullYear()} Revista Nacional de las Ciencias para Estudiantes</p>
    <p style="margin-top: 0.5rem;"><a href="/" style="color: var(--primary); text-decoration: none;">Volver al inicio</a></p>
  </footer>
</body>
</html>`;

  const indexPath = path.join(OUTPUT_HTML_DIR, 'index.html');
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log(`✅ Índice español: index.html`);

  // ========== ÍNDICE INGLÉS ==========
  const indexContentEn = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>News Archive - The National Review of Sciences for Students</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Lora:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #005a7d;
      --text-main: #222222;
      --text-light: #595959;
      --border-color: #e5e7eb;
      --bg-soft: #f8f9fa;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Lora', serif;
      color: var(--text-main);
      background-color: #f5f5f5;
      line-height: 1.8;
    }
    .nav-minimal {
      background: white;
      border-bottom: 1px solid var(--border-color);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      font-family: 'Inter', sans-serif;
    }
    .nav-logo {
      font-weight: 700;
      color: var(--primary);
      text-decoration: none;
      font-size: 0.9rem;
      letter-spacing: 0.5px;
    }
    .main-wrapper {
      max-width: 1000px;
      margin: 3rem auto;
      padding: 0 2rem;
    }
    .content-card {
      background: white;
      padding: 3rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    h1 {
      font-family: 'Playfair Display', serif;
      font-size: 3rem;
      margin: 0 0 1rem;
      line-height: 1.2;
      color: var(--primary);
    }
    .description {
      color: var(--text-light);
      margin-bottom: 3rem;
      font-size: 1.1rem;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 1rem;
    }
    .year-section {
      margin-bottom: 3rem;
    }
    .year-title {
      font-family: 'Inter', sans-serif;
      font-size: 2rem;
      color: var(--primary);
      margin: 0 0 1.5rem;
      border-left: 4px solid var(--primary);
      padding-left: 1rem;
    }
    .news-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .news-item {
      margin-bottom: 1.5rem;
      padding: 1.5rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      transition: all 0.2s;
    }
    .news-item:hover {
      background: var(--bg-soft);
      transform: translateX(5px);
      border-left: 4px solid var(--primary);
    }
    .news-link {
      color: var(--primary);
      text-decoration: none;
      font-size: 1.3rem;
      font-weight: 600;
      display: block;
      margin-bottom: 0.5rem;
      font-family: 'Playfair Display', serif;
    }
    .news-link:hover {
      text-decoration: underline;
    }
    .news-meta {
      color: var(--text-light);
      font-size: 0.9rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      font-family: 'Inter', sans-serif;
    }
    .news-excerpt {
      margin-top: 1rem;
      color: var(--text-main);
      font-size: 1rem;
    }
    footer {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-light);
      font-size: 0.9rem;
      background: white;
      border-top: 1px solid var(--border-color);
    }
    @media (max-width: 768px) {
      .main-wrapper { padding: 0 1rem; }
      .content-card { padding: 1.5rem; }
      h1 { font-size: 2.2rem; }
      .year-title { font-size: 1.6rem; }
      .news-link { font-size: 1.1rem; }
    }
  </style>
</head>
<body>
  <nav class="nav-minimal">
    <a href="/" class="nav-logo">THE NATIONAL REVIEW OF SCIENCES FOR STUDENTS</a>
    <div class="issn">ISSN: 3087-2839</div>
  </nav>
  <div class="main-wrapper">
    <main class="content-card">
      <h1>News Archive</h1>
      <p class="description">All news from the journal, sorted by year of publication.</p>
      
      ${sortedYears.map(year => `
      <section class="year-section">
        <h2 class="year-title">${year}</h2>
        <ul class="news-list">
          ${newsByYear[year].map(item => {
            const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
            const excerpt = base64DecodeUnicode(item.content).replace(/<[^>]*>/g, '').substring(0, 150) + '...';
            return `
            <li class="news-item">
              <a href="/news/${slug}.EN.html" class="news-link">${item.title}</a>
              <div class="news-meta">
                <span class="date">${formatDateEn(item.fecha)}</span>
                <span class="author">Editorial Staff</span>
              </div>
              <div class="news-excerpt">${excerpt}</div>
            </li>
          `;
          }).join('')}
        </ul>
      </section>
      `).join('')}
    </main>
  </div>
  <footer>
    <p>&copy; ${new Date().getFullYear()} The National Review of Sciences for Students</p>
    <p style="margin-top: 0.5rem;"><a href="/" style="color: var(--primary); text-decoration: none;">Back to home</a></p>
  </footer>
</body>
</html>`;

  const indexPathEn = path.join(OUTPUT_HTML_DIR, 'index.EN.html');
  fs.writeFileSync(indexPathEn, indexContentEn, 'utf8');
  console.log(`✅ Índice inglés: index.EN.html`);

  // También generar un RSS feed opcional
  generateRssFeed(newsItems);
}

function generateRssFeed(newsItems) {
  const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Revista Nacional de las Ciencias para Estudiantes - Noticias</title>
    <link>${DOMAIN}/news/</link>
    <description>Últimas noticias de la revista académica estudiantil</description>
    <language>es-cl</language>
    <atom:link href="${DOMAIN}/news/feed.xml" rel="self" type="application/rss+xml"/>
    ${newsItems.slice(0, 10).map(item => {
      const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
      const description = base64DecodeUnicode(item.cuerpo).replace(/<[^>]*>/g, '').substring(0, 500);
      return `
    <item>
      <title><![CDATA[${item.titulo}]]></title>
      <link>${DOMAIN}/news/${slug}.html</link>
      <guid>${DOMAIN}/news/${slug}.html</guid>
      <pubDate>${new Date(item.fecha).toUTCString()}</pubDate>
      <description><![CDATA[${description}]]></description>
    </item>`;
    }).join('')}
  </channel>
</rss>`;

  const rssPath = path.join(OUTPUT_HTML_DIR, 'feed.xml');
  fs.writeFileSync(rssPath, rssContent, 'utf8');
  console.log(`✅ RSS feed generado`);
}

// ========== EJECUCIÓN ==========
generateNews();