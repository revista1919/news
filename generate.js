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

const socialLinks = {
  instagram: 'https://www.instagram.com/revistanacionalcienciae',
  youtube: 'https://www.youtube.com/@RevistaNacionaldelasCienciaspa',
  tiktok: 'https://www.tiktok.com/@revistacienciaestudiante',
  spotify: 'https://open.spotify.com/show/6amsgUkNXgUTD219XpuqOe?si=LPzCNpusQjSLGBq_pPrVTw'
};

// ========== SVG ICONS para redes sociales ==========
const socialIcons = {
  instagram: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
  youtube: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  spotify: `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.508 17.308c-.221.362-.689.473-1.05.252-2.983-1.823-6.738-2.237-11.162-1.226-.411.094-.823-.162-.917-.573-.094-.412.162-.823.573-.917 4.847-1.108 8.995-.635 12.305 1.386.36.221.472.69.251 1.05zm1.47-3.255c-.278.452-.865.594-1.317.316-3.414-2.098-8.62-2.706-12.657-1.479-.508.154-1.04-.136-1.194-.644-.154-.508.136-1.04.644-1.194 4.613-1.399 10.366-.719 14.256 1.67.452.278.594.865.316 1.317zm.126-3.374C14.653 7.64 7.29 7.394 3.05 8.681c-.604.183-1.246-.166-1.429-.77-.183-.604.166-1.246.77-1.429 4.883-1.482 13.014-1.201 18.238 1.902.544.323.72 1.034.397 1.578-.323.544-1.034.72-1.578.397z"/></svg>`
};

// ========== FUNCIÓN PARA CALULAR TIEMPO DE LECTURA ==========
function calculateReadingTime(html, wordsPerMinute = 200) {
  // Eliminar etiquetas HTML y contar palabras
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = text.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return {
    minutes,
    wordCount,
    display: minutes === 1 ? '1 minuto' : `${minutes} minutos`
  };
}

// ========== TEMPLATE MODIFICADO CON NUEVAS FUNCIONALIDADES ==========
function generateNewsHtmlTemplate({
  lang,
  title,
  content,
  fecha,
  slug,
  headerImageHtml,
  domain,
  oaSvg,
  journalName,
  logo
}) {
  const isSpanish = lang === 'es';
  const readingTime = calculateReadingTime(content);
  
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
      excellence: 'Una revista por y para estudiantes',
      readingTime: 'tiempo de lectura',
      listen: 'Escuchar noticia',
      stop: 'Detener',
      play: 'Reproducir',
      pause: 'Pausa',
      contact: 'Contacto',
      followUs: 'Síguenos'
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
      excellence: 'A journal by and for students',
      readingTime: 'read time',
      listen: 'Listen to article',
      stop: 'Stop',
      play: 'Play',
      pause: 'Pause',
      contact: 'Contact',
      followUs: 'Follow us'
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
  <meta property="og:url" content="${domain}/news/${slug}${isSpanish ? '' : '.EN'}.html">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${fecha}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="language" content="${lang}">
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
      --progress-color: #007398;
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

    /* Progress Bar */
    .progress-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 4px;
      background: transparent;
      z-index: 1001;
    }

    .progress-bar {
      height: 4px;
      background: linear-gradient(90deg, var(--progress-color), #00a8c5);
      width: 0%;
      transition: width 0.1s ease;
      box-shadow: 0 0 10px rgba(0, 115, 152, 0.5);
    }

    /* Reading Time Indicator */
    .reading-time {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      color: var(--text-muted);
      background: var(--bg-soft);
      padding: 4px 10px;
      border-radius: 20px;
      margin-left: 15px;
    }

    /* Audio Player */
    .audio-player {
      position: fixed;
      bottom: 30px;
      right: 30px;
      z-index: 1000;
      background: white;
      border-radius: 60px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      padding: 8px 16px 8px 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(0,90,125,0.1);
      transition: all 0.3s ease;
    }

    .audio-player:hover {
      box-shadow: 0 6px 25px rgba(0,90,125,0.2);
      transform: translateY(-2px);
    }

    .audio-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .audio-btn {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: var(--primary);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .audio-btn:hover {
      background: var(--primary-dark);
      transform: scale(1.05);
    }

    .audio-btn svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }

    .audio-status {
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      color: var(--text-main);
      white-space: nowrap;
    }
      /* Controles avanzados de audio */
.speed-control {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 5px;
}

.speed-control input[type=range] {
  width: 60px;
  height: 4px;
  -webkit-appearance: none;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
}

.speed-control input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: var(--primary);
  border-radius: 50%;
  cursor: pointer;
}

#rateValue {
  font-size: 10px;
  font-weight: bold;
  color: var(--primary);
  min-width: 25px;
}

.voice-selector {
  font-size: 10px;
  padding: 3px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: white;
  max-width: 150px;
}

#toggleAdvancedBtn {
  transition: transform 0.3s;
}

#toggleAdvancedBtn.active {
  transform: rotate(30deg);
  background: var(--primary);
}

/* Estado expandido del reproductor */
.audio-player.expanded {
  flex-wrap: wrap;
  max-width: 400px;
  border-radius: 20px;
}

.audio-player.expanded .speed-control,
.audio-player.expanded .voice-selector {
  display: flex !important;
  margin: 5px 0;
}

/* Animaciones */
.audio-player {
  transition: all 0.3s ease;
}
/* Añade estos estilos */
.audio-progress {
  width: 100px;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  margin: 0 10px;
}

.audio-progress-bar {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  width: 0%;
  transition: width 0.1s linear;
}
    .language-indicator {
      display: flex;
      gap: 4px;
      margin-left: 8px;
      padding-left: 8px;
      border-left: 1px solid var(--border-color);
    }

    .lang-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ccc;
    }

    .lang-dot.active {
      background: var(--primary);
    }

    /* Navigation minimal (mantener el mismo) */
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

    /* Hero Header (mantener el mismo) */
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
      color: #e4dcb3;
      margin-bottom: 15px;
    }
/* Add to your existing styles */
.audio-player {
  position: fixed;
  bottom: 30px;
  right: 30px;
  z-index: 1000;
  background: white;
  border-radius: 60px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  padding: 8px 16px 8px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0,90,125,0.1);
  transition: all 0.3s ease;
  /* Add these for draggable behavior */
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none; /* Prevents scrolling while dragging */
}

.audio-player:active {
  cursor: grabbing;
}

/* When expanded, make it easier to drag from the top area */
.audio-player.expanded {
  cursor: default;
}

.audio-player.expanded:active {
  cursor: default;
}

/* Add a drag handle area */
.audio-player::before {
  content: '';
  position: absolute;
  top: -10px;
  left: 0;
  right: 0;
  height: 20px;
  background: transparent;
  display: none;
}

.audio-player.expanded::before {
  display: block;
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
      align-items: center;
    }

    /* Article Body (mantener el mismo, con pequeño ajuste para margen superior) */
    .article-body {
      max-width: 700px;
      margin: 60px auto;
      padding: 0 20px;
      font-size: 1.2rem;
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
/* Control de visibilidad para enlaces de contacto */
@media (min-width: 769px) {
  .desktop-only {
    display: inline-block;
  }
  .mobile-only {
    display: none;
  }
}

@media (max-width: 768px) {
  .desktop-only {
    display: none;
  }
  .mobile-only {
    display: inline-block;
  }
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
    /* Footer Styles */
    .footer {
      background: #1a1a1a;
      color: white;
      padding: 60px 20px 30px;
      margin-top: 60px;
      border-top: 1px solid #333;
      font-family: 'Inter', sans-serif;
    }

    .footer-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .footer-social {
      display: flex;
      justify-content: center;
      gap: 40px;
      margin-bottom: 40px;
    }

    .social-icon {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: #999;
      text-decoration: none;
      transition: all 0.3s;
    }

    .social-icon:hover {
      color: white;
      transform: translateY(-3px);
    }

    .social-icon svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .social-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 500;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .social-icon:hover .social-label {
      opacity: 1;
    }

    .footer-contact {
      text-align: center;
      margin: 40px 0;
      padding: 20px 0;
      border-top: 1px solid #333;
      border-bottom: 1px solid #333;
    }

    .contact-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: #666;
      display: block;
      margin-bottom: 10px;
    }

    .contact-email {
      color: white;
      text-decoration: none;
      font-size: 1rem;
      transition: color 0.3s;
    }

    .contact-email:hover {
      color: var(--primary);
    }

    .footer-bottom {
      text-align: center;
      font-size: 9px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 4px;
      padding-top: 30px;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin: 20px 0;
      font-size: 9px;
    }

    .footer-links a {
      color: #777;
      text-decoration: none;
      transition: color 0.3s;
    }

    .footer-links a:hover {
      color: white;
    }

    /* Mobile Optimizations */
    @media (max-width: 768px) {
      .audio-player {
        bottom: 20px;
        right: 20px;
        padding: 6px 12px;
      }
      
      .footer-social {
        gap: 20px;
        flex-wrap: wrap;
      }
      
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
    }
  </style>
</head>
<body>
  <!-- Progress Bar -->
  <div class="progress-container">
    <div class="progress-bar" id="progressBar"></div>
  </div>

  <!-- Audio Player Flotante con mejoras -->
<div class="audio-player" id="audioPlayer">
  <div class="audio-controls">
    <button class="audio-btn" id="playPauseBtn" title="${t.listen}">
      <svg id="playIcon" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
    </button>
    <button class="audio-btn" id="stopBtn" title="${t.stop}" style="background: #666;">
      <svg viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12"/>
      </svg>
    </button>
  </div>
  
  <!-- Control de velocidad (nuevo) -->
  <div class="speed-control" style="display: none;">
    <input type="range" id="rateControl" min="0.5" max="2" step="0.1" value="1">
    <span id="rateValue">1x</span>
  </div>
  
  <!-- Selector de voces (nuevo) -->
  <select id="voiceSelector" class="voice-selector" style="display: none;">
    <option value="">${isSpanish ? 'Voz por defecto' : 'Default voice'}</option>
  </select>
  
  <!-- Botón para mostrar/ocultar controles avanzados (nuevo) -->
  <button class="audio-btn" id="toggleAdvancedBtn" title="${isSpanish ? 'Configuración' : 'Settings'}" style="background: #4a5568; width: 30px; height: 30px;">
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </svg>
  </button>
  
  <div class="audio-progress">
    <div class="audio-progress-bar" id="audioProgressBar"></div>
  </div>
  
  <div class="audio-status" id="audioStatus">
    <span id="statusText">${t.listen}</span>
    <div class="language-indicator">
      <span class="lang-dot ${lang === 'es' ? 'active' : ''}"></span>
      <span class="lang-dot ${lang === 'en' ? 'active' : ''}"></span>
    </div>
  </div>
</div>

  <nav class="nav-minimal">
    <a href="/" class="nav-logo">
      <img src="${logo}" alt="Logo" class="nav-logo-img">
      <span class="nav-logo-text">${journalName}</span>
    </a>
    <div class="nav-links">
      <a href="${isSpanish ? '/es/new' : '/en/new'}" class="nav-link">${t.backToNews}</a>
      <a href="${isSpanish ? '/submit' : '/en/submit'}" class="nav-link">${isSpanish ? 'Envíos' : 'Submissions'}</a>
      <a href="${isSpanish ? '/faq' : '/en/faq'}" class="nav-link">FAQ</a>
    </div>
  </nav>

  <header>
    ${headerImageHtml}
    <div style="max-width: 700px; margin: 0 auto; padding: 0 20px;">
      <span class="reading-time">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
        </svg>
        ${readingTime.display} ${t.readingTime}
      </span>
    </div>
  </header>

  <main class="article-body" id="articleContent">
    <article class="ql-editor">
      ${content}
    </article>

   
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
      <a href="${isSpanish ? '/es/' : '/en/'}">
        ${t.backToHome}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
        </svg>
      </a>
    </div>
  </main>

  <!-- Footer con Redes Sociales y Contacto -->
    <!-- Footer con Redes Sociales y Contacto -->
  <footer class="footer">
    <div class="footer-container">
      <!-- Redes Sociales -->
      <div class="footer-social">
        <a href="${socialLinks.instagram}" target="_blank" rel="noopener" class="social-icon">
          ${socialIcons.instagram}
          <span class="social-label">Instagram</span>
        </a>
        <a href="${socialLinks.youtube}" target="_blank" rel="noopener" class="social-icon">
          ${socialIcons.youtube}
          <span class="social-label">YouTube</span>
        </a>
        <a href="${socialLinks.tiktok}" target="_blank" rel="noopener" class="social-icon">
          ${socialIcons.tiktok}
          <span class="social-label">TikTok</span>
        </a>
        <a href="${socialLinks.spotify}" target="_blank" rel="noopener" class="social-icon">
          ${socialIcons.spotify}
          <span class="social-label">Spotify</span>
        </a>
      </div>

      <!-- Contacto (abre Gmail directamente) -->
<div class="footer-contact">
  <span class="contact-label">${t.contact}</span>
  
  <!-- Versión para escritorio (Gmail) - visible solo en pantallas grandes -->
  <a href="https://mail.google.com/mail/?view=cm&fs=1&to=contact@revistacienciasestudiantes.com" 
     target="_blank" 
     class="contact-email desktop-only"
     rel="noopener">
    contact@revistacienciasestudiantes.com
  </a>
  
  <!-- Versión para móvil (mailto) - visible solo en pantallas pequeñas -->
  <a href="mailto:contact@revistacienciasestudiantes.com" 
     class="contact-email mobile-only"
     rel="noopener">
    contact@revistacienciasestudiantes.com
  </a>
</div>

      <!-- Copyright y enlaces legales - MODIFICADO CON SUFIJO DE IDIOMA -->
      <div class="footer-bottom">
        <div class="footer-links">
          <a href="/privacy${isSpanish ? '' : 'EN'}.html">Privacidad</a>
          <span>|</span>
          <a href="/terms${isSpanish ? '' : 'EN'}.html">Términos</a>
          <span>|</span>
          <a href="/credits${isSpanish ? '' : 'EN'}.html">Créditos</a>
        </div>
        <p>© ${new Date().getFullYear()} ${journalName} · ISSN 3087-2839</p>
      </div>
    </div>
  </footer>
  
  <script>
    // ========== PROGRESS BAR ==========
    window.addEventListener('scroll', () => {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      document.getElementById('progressBar').style.width = scrolled + '%';
    });

// ========== TEXTO A VOZ CON TODAS LAS MEJORAS ==========
document.addEventListener('DOMContentLoaded', function() {
  // Verificar que todos los elementos existen
  const playPauseBtn = document.getElementById('playPauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const toggleAdvancedBtn = document.getElementById('toggleAdvancedBtn');
  const statusText = document.getElementById('statusText');
  const playIcon = document.getElementById('playIcon');
  const voiceSelector = document.getElementById('voiceSelector');
  const rateControl = document.getElementById('rateControl');
  const rateValue = document.getElementById('rateValue');
  const audioProgressBar = document.getElementById('audioProgressBar');
  const audioPlayer = document.getElementById('audioPlayer');
  const articleContentEl = document.getElementById('articleContent');

  // Verificar elementos críticos
  if (!playPauseBtn || !stopBtn || !statusText || !playIcon || !voiceSelector || 
      !rateControl || !rateValue || !audioProgressBar || !audioPlayer || !articleContentEl) {
    console.warn('Algunos elementos de texto a voz no existen en la página');
    return; // Salir si faltan elementos esenciales
  }

  let utterance = null;
  let isPlaying = false;
  let voicesReady = false;
  let selectedVoice = null;
  let synthesis = window.speechSynthesis;
  let currentCharIndex = 0;
  let fullText = '';
  let rate = 1;
  let resumeTimer = null;

  // Obtener el texto del artículo con validación
  fullText = (articleContentEl.innerText || articleContentEl.textContent || '').trim();
  const totalChars = fullText.length;

  // Configurar idioma - DETECCIÓN INMUNE A ERRORES
  let lang = 'es'; // Valor por defecto
  
  // Método 1: Data attribute (recomendado - añade data-lang="es" o "en" al body en PHP)
  if (document.body.dataset.lang) {
    lang = document.body.dataset.lang;
  } 
  // Método 2: Meta tag
  else {
    const metaLang = document.querySelector('meta[name="language"]');
    if (metaLang && metaLang.content) {
      lang = metaLang.content;
    }
    // Método 3: Detectar del HTML
    else {
      const htmlLang = document.documentElement.lang;
      if (htmlLang) {
        lang = htmlLang.substring(0, 2);
      }
    }
  }
  
  const voiceLang = lang === 'es' ? 'es-ES' : 'en-US';

  // Función para cargar voces
  function loadVoices() {
    return new Promise((resolve) => {
      if (!synthesis) {
        console.error('Speech synthesis no soportado');
        resolve();
        return;
      }
      
      let voices = synthesis.getVoices();
      if (voices.length > 0) {
        populateVoiceList(voices);
        selectVoice(voices);
        voicesReady = true;
        resolve();
      } else {
        synthesis.onvoiceschanged = () => {
          voices = synthesis.getVoices();
          populateVoiceList(voices);
          selectVoice(voices);
          voicesReady = true;
          resolve();
        };
      }
    });
  }

  // Poblar el selector de voces - VERSIÓN INMUNE
  function populateVoiceList(voices) {
    if (!voiceSelector) return;
    
    // Limpiar selector
    voiceSelector.innerHTML = '';
    
    // Opción por defecto - SIN PHP EMBEBIDO
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = lang === 'es' ? 'Voz por defecto' : 'Default voice';
    voiceSelector.appendChild(defaultOption);
    
    if (!voices || voices.length === 0) {
      console.warn('No hay voces disponibles');
      return;
    }
    
    // Filtrar voces del idioma actual primero
    const langPrefix = voiceLang.split('-')[0];
    const langVoices = [];
    const otherVoices = [];
    
    voices.forEach(voice => {
      if (voice.lang && voice.lang.startsWith(langPrefix)) {
        langVoices.push(voice);
      } else {
        otherVoices.push(voice);
      }
    });
    
    // Agregar voces del idioma
    langVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name || '';
      const voiceName = String(voice.name || 'Voz sin nombre');
      const voiceLang_str = String(voice.lang || 'idioma desconocido');
      const isDefault = voice.default ? ' [Default]' : '';
      option.textContent = voiceName + ' (' + voiceLang_str + ')' + isDefault;
      option.dataset.lang = voiceLang_str;
      voiceSelector.appendChild(option);
    });
    
    // Agregar separador y otras voces si existen
    if (otherVoices.length > 0) {
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '──────────';
      voiceSelector.appendChild(separator);
      
      otherVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name || '';
        const voiceName = String(voice.name || 'Voz sin nombre');
        const voiceLang_str = String(voice.lang || 'idioma desconocido');
        option.textContent = voiceName + ' (' + voiceLang_str + ')';
        option.dataset.lang = voiceLang_str;
        voiceSelector.appendChild(option);
      });
    }
  }

  function selectVoice(voices) {
    if (!voices || voices.length === 0) return;
    
    // Priorizar voz exacta del idioma
    selectedVoice = voices.find(voice => voice.lang === voiceLang && voice.name && voice.name.includes('Google')) ||
                    voices.find(voice => voice.lang === voiceLang && voice.name && voice.name.includes('Premium')) ||
                    voices.find(voice => voice.lang === voiceLang);
    
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => voice.default);
    }
    
    // Seleccionar en el dropdown
    if (selectedVoice && voiceSelector) {
      const options = Array.from(voiceSelector.options);
      const option = options.find(opt => opt.value === selectedVoice.name);
      if (option) option.selected = true;
    }
    
    console.log('Voz seleccionada:', selectedVoice ? selectedVoice.name : 'Default');
  }

  // Limpiar reproducción
  function stopSpeech() {
    if (synthesis) {
      synthesis.cancel();
    }
    if (resumeTimer) {
      clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    utterance = null;
    isPlaying = false;
    updateUI();
  }

  // Crear nueva utterance desde posición actual
  function createUtteranceFromPosition() {
    if (!fullText || currentCharIndex >= totalChars) {
      return null;
    }

    const remainingText = fullText.substring(currentCharIndex);
    if (!remainingText.trim()) {
      return null;
    }

    const newUtterance = new SpeechSynthesisUtterance(remainingText);
    newUtterance.lang = voiceLang;

    if (selectedVoice) {
      newUtterance.voice = selectedVoice;
    }

    newUtterance.rate = rate;
    newUtterance.pitch = 1;
    newUtterance.volume = 1;

    // Eventos
    newUtterance.onstart = () => {
      isPlaying = true;
      updateUI();
    };

    newUtterance.onend = () => {
      isPlaying = false;
      currentCharIndex = totalChars;
      updateProgress();
      updateUI();
    };

    newUtterance.onboundary = (event) => {
      if (event.name === 'word' || event.name === 'sentence') {
        currentCharIndex += event.charIndex + (event.name === 'word' ? event.charLength || 1 : 0);
        updateProgress();
      }
    };

    newUtterance.onerror = (event) => {
      console.error('Error en reproducción:', event.error);
      isPlaying = false;
      updateUI();
    };

    return newUtterance;
  }

  // Iniciar o reanudar reproducción
  function playSpeech() {
    stopSpeech();

    utterance = createUtteranceFromPosition();
    if (utterance) {
      synthesis.speak(utterance);
      isPlaying = true;
      updateUI();
    }
  }

  // Pausar (simulado con cancel)
  function pauseSpeech() {
    if (isPlaying) {
      stopSpeech();
      isPlaying = false;
      updateUI();
    }
  }

  // Toggle play/pause
  function togglePlayPause() {
    if (isPlaying) {
      pauseSpeech();
    } else {
      playSpeech();
    }
  }

  // Actualizar UI - VERSIÓN CORREGIDA
function updateUI() {
  if (statusText) {
    // Usar lang directamente en lugar de t.listen
    statusText.innerText = isPlaying ? (lang === 'es' ? 'Reproduciendo...' : 'Playing...') : (lang === 'es' ? 'Escuchar noticia' : 'Listen to article');
  }
  if (playIcon) {
    playIcon.innerHTML = isPlaying ? 
      String('<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>') : 
      String('<path d="M8 5v14l11-7z"/>');
  }
}
  // Actualizar progreso
  // Actualizar progreso - VERSIÓN CORREGIDA
function updateProgress() {
  if (audioProgressBar && totalChars > 0) {
    const progress = (currentCharIndex / totalChars) * 100;
    // CORREGIDO: Usamos String() para asegurar compatibilidad
    audioProgressBar.style.width = String(Math.min(progress, 100)) + '%';
  }
}

  // Evento para cambiar la voz
  voiceSelector.addEventListener('change', (e) => {
    const voiceName = e.target.value;
    const voices = synthesis.getVoices();
    selectedVoice = voiceName ? voices.find(v => v.name === voiceName) : null;

    if (isPlaying) {
      const wasPlaying = true;
      pauseSpeech();
      if (wasPlaying) {
        playSpeech();
      }
    }
  });

  // Control de velocidad - VERSIÓN CORREGIDA
if (rateControl) {
  rateControl.addEventListener('input', function(e) {
    rate = parseFloat(e.target.value) || 1;
    
    // CORREGIDO: Evitamos template string con formato numérico
    if (rateValue) {
      // Método 1: Concatenación tradicional
      rateValue.textContent = rate.toFixed(1) + 'x';
      
      // Método 2: Si prefieres mantener el formato, usa String() primero
      // rateValue.textContent = String(rate.toFixed(1)) + 'x';
    }

    if (isPlaying) {
      // Simplificado: no necesitas variable wasPlaying
      pauseSpeech();
      playSpeech(); // Directamente, porque pauseSpeech() ya cambia isPlaying a false
    }
  });
}
// ========== DRAGGABLE AUDIO PLAYER FOR MOBILE ==========
function makeDraggable(element) {
  let startX, startY, startLeft, startTop;
  let isDragging = false;
  
  // Get computed position
  const getPosition = () => {
    const style = window.getComputedStyle(element);
    const left = parseInt(style.left) || 0;
    const top = parseInt(style.top) || 0;
    return { left, top };
  };
  
  // Initialize position if not set
  if (element.style.left === '' && element.style.right !== '') {
    // If using right positioning, convert to left for easier dragging
    const rect = element.getBoundingClientRect();
    element.style.left = rect.left + 'px';
    element.style.top = rect.top + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  } else if (element.style.left === '') {
    // Default position
    const rect = element.getBoundingClientRect();
    element.style.left = rect.left + 'px';
    element.style.top = rect.top + 'px';
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
  
  const onTouchStart = (e) => {
    e.preventDefault(); // Prevent scrolling while dragging
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    
    const pos = getPosition();
    startLeft = pos.left;
    startTop = pos.top;
    
    isDragging = true;
    element.style.transition = 'none'; // Disable transition during drag
    element.style.cursor = 'grabbing';
  };
  
  const onTouchMove = (e) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling
    
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    
    // Calculate new position
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;
    
    // Keep within viewport bounds
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    
    newLeft = Math.max(0, Math.min(newLeft, maxX));
    newTop = Math.max(0, Math.min(newTop, maxY));
    
    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';
  };
  
  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    element.style.transition = ''; // Restore transition
    element.style.cursor = 'grab';
  };
  
  // Add touch events
  element.addEventListener('touchstart', onTouchStart, { passive: false });
  element.addEventListener('touchmove', onTouchMove, { passive: false });
  element.addEventListener('touchend', onTouchEnd);
  element.addEventListener('touchcancel', onTouchEnd);
  
  // Also add mouse events for desktop (optional)
  element.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    
    const pos = getPosition();
    startLeft = pos.left;
    startTop = pos.top;
    
    isDragging = true;
    element.style.transition = 'none';
    element.style.cursor = 'grabbing';
  });
  
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;
    
    const maxX = window.innerWidth - element.offsetWidth;
    const maxY = window.innerHeight - element.offsetHeight;
    
    newLeft = Math.max(0, Math.min(newLeft, maxX));
    newTop = Math.max(0, Math.min(newTop, maxY));
    
    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';
  });
  
  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      element.style.transition = '';
      element.style.cursor = 'grab';
    }
  });
}

// Initialize draggable for the audio player
const audioPlayer = document.getElementById('audioPlayer');
if (audioPlayer) {
  makeDraggable(audioPlayer);
  
  // Save position to localStorage (optional)
  const savedPos = localStorage.getItem('audioPlayerPos');
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      audioPlayer.style.left = pos.left;
      audioPlayer.style.top = pos.top;
      audioPlayer.style.right = 'auto';
      audioPlayer.style.bottom = 'auto';
    } catch (e) {}
  }
  
  // Save position when dragging ends
  audioPlayer.addEventListener('dragend', function() {
    const pos = {
      left: audioPlayer.style.left,
      top: audioPlayer.style.top
    };
    localStorage.setItem('audioPlayerPos', JSON.stringify(pos));
  });
}
  // Toggle controles avanzados
  toggleAdvancedBtn.addEventListener('click', () => {
    audioPlayer.classList.toggle('expanded');
    toggleAdvancedBtn.classList.toggle('active');
  });

  // Inicializar voces
  if (synthesis) {
    loadVoices().then(() => {
      console.log('✅ Voces cargadas para:', voiceLang);
    });
  } else {
    console.warn('Speech synthesis no soportado en este navegador');
  }

  // Evento del botón play/pause
  playPauseBtn.addEventListener('click', async () => {
    if (!synthesis) {
      alert('Tu navegador no soporta texto a voz');
      return;
    }
    
    if (!voicesReady) {
      if (statusText) statusText.innerText = lang === 'es' ? 'Cargando...' : 'Loading...';
      await loadVoices();
    }
    
    togglePlayPause();
  });

  // Evento del botón stop
  stopBtn.addEventListener('click', () => {
    currentCharIndex = 0;
    stopSpeech();
    updateProgress();
  });

  // Limpiar al salir
  window.addEventListener('beforeunload', stopSpeech);

  // Workaround para bug de resume en algunos navegadores (llamar resume periódicamente si pausado, pero como usamos cancel, no necesario)
});

// ========== FUNCIONES DE COMPARTIR ==========
// Estas funciones deben estar fuera del DOMContentLoaded para ser accesibles globalmente

function shareOnTwitter() {
  try {
    const url = encodeURIComponent(window.location.href);
    // Título seguro sin PHP embebido
    let title = '';
    const metaTitle = document.querySelector('meta[property="og:title"]') || document.querySelector('title');
    if (metaTitle) {
      title = metaTitle.content || metaTitle.textContent || '';
    }
    const text = encodeURIComponent(title.substring(0, 100));
    window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank');
  } catch (e) {
    console.error('Error al compartir en Twitter:', e);
  }
}

function shareOnFacebook() {
  try {
    const url = encodeURIComponent(window.location.href);
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank');
  } catch (e) {
    console.error('Error al compartir en Facebook:', e);
  }
}

function shareOnLinkedIn() {
  try {
    const url = encodeURIComponent(window.location.href);
    window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank');
  } catch (e) {
    console.error('Error al compartir en LinkedIn:', e);
  }
}

// Smooth scroll para enlaces internos
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#' || !href) return;
      
      try {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (err) {
        console.warn('Error en smooth scroll:', err);
      }
    });
  });
});
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