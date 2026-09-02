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
const SCIENCE_INDEX_PATH = path.join(__dirname, '..', 'science', 'index.json');

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

// ========== FUNCIÓN PARA CARGAR NOTICIAS DE CIENCIA ==========
function loadScienceNews() {
  const allScienceNews = [];
  
  try {
    if (!fs.existsSync(SCIENCE_INDEX_PATH)) {
      console.warn('⚠️ No se encontró el índice de ciencia. Usando solo noticias internas.');
      return allScienceNews;
    }
    
    const scienceIndex = JSON.parse(fs.readFileSync(SCIENCE_INDEX_PATH, 'utf8'));
    const years = Object.keys(scienceIndex.years || {}).sort().reverse();
    
    for (const year of years) {
      const yearData = scienceIndex.years[year];
      const yearJsonPath = path.join(__dirname, '..', 'science', year, yearData.json_file);
      
      if (fs.existsSync(yearJsonPath)) {
        const yearNews = JSON.parse(fs.readFileSync(yearJsonPath, 'utf8'));
        const newsArray = yearNews.news || yearNews;
        
        newsArray.forEach(item => {
          allScienceNews.push({
            id: item.id,
            title_es: item.title?.es || '',
            title_en: item.title?.en || '',
            slug: item.slug || '',
            photo: item.photo || '',
            area_id: item.area_id || 'general',
            featured: item.featured || false,
            createdAt: item.metadata?.createdAt || '',
            timestamp: item.metadata?.createdTimestamp || 0,
            type: 'science'
          });
        });
      }
    }
    
    allScienceNews.sort((a, b) => b.timestamp - a.timestamp);
    console.log(`🔬 ${allScienceNews.length} noticias de ciencia cargadas`);
  } catch (err) {
    console.warn('⚠️ Error cargando noticias de ciencia:', err.message);
  }
  
  return allScienceNews;
}

// ========== FUNCIÓN DE RECOMENDACIONES ==========
function getRecommendations(currentItem, allInternal, allScience, lang = 'es') {
  // 1. Noticia más reciente (o segunda si la actual es la más reciente)
  const sortedInternal = [...allInternal].sort((a, b) => 
    new Date(b.fecha) - new Date(a.fecha)
  );
  
  let recent = sortedInternal[0] || null;
  if (recent && recent.slug === currentItem.slug) {
    recent = sortedInternal[1] || null;
  }

  // 2. Otras internas aleatorias (excluyendo actual y la reciente)
  const otherInternal = allInternal
    .filter(n => n.slug !== currentItem.slug && n.slug !== recent?.slug)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);

  // 3. Ciencia: priorizar featured + recientes, luego aleatorio
  const featuredScience = allScience.filter(n => n.featured).slice(0, 2);
  const otherScience = allScience
    .filter(n => !n.featured)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const scienceRecs = [...featuredScience, ...otherScience].slice(0, 3);

  return {
    recent,
    otherInternal,
    science: scienceRecs
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

// ========== FUNCIÓN PARA GENERAR HTML DE RECOMENDACIONES ==========
function generateRecommendationsHtml(recs, lang, domain) {
  const isSpanish = lang === 'es';
  const t = {
    title: isSpanish ? 'Artículos recomendados' : 'Recommended articles',
    recent: isSpanish ? 'Más reciente' : 'Most recent',
    science: isSpanish ? 'Investigación científica' : 'Scientific research',
    more: isSpanish ? 'Ver más' : 'Read more'
  };

  const card = (item, type) => {
    const title = type === 'science' 
      ? (isSpanish ? item.title_es : item.title_en)
      : (isSpanish ? item.titulo : (item.title || item.titulo));
    
    const href = type === 'science'
      ? `${domain}/science/news/${item.slug}${isSpanish ? '' : '.EN'}.html`
      : `${domain}/news/${item.slug}${isSpanish ? '' : '.EN'}.html`;
    
    const photo = item.photo || 'https://www.revistacienciasestudiantes.com/team.jpg';
    const isRecent = type === 'internal' && item.slug === recs.recent?.slug;
    
    return `
      <a href="${href}" class="rec-card">
        <div class="rec-thumb">
          <img src="${photo}" alt="${title}" loading="lazy">
        </div>
        <div class="rec-body">
          <span class="rec-label">${type === 'science' ? t.science : (isRecent ? t.recent : '')}</span>
          <h4>${title}</h4>
        </div>
      </a>`;
  };

  return `
    <div class="sidebar-section recommendations-section">
      <h3 class="sidebar-title">${t.title}</h3>
      
      ${recs.recent ? card(recs.recent, 'internal') : ''}
      ${recs.otherInternal.map(n => card(n, 'internal')).join('')}
      ${recs.science.map(n => card(n, 'science')).join('')}
    </div>`;
}

// ========== FUNCIÓN PRINCIPAL ==========
async function generateNews() {
  console.log('🚀 Generando noticias editoriales de alto nivel...');
  
  try {
    if (!fs.existsSync(NEWS_JSON)) {
      throw new Error(`No se encuentra ${NEWS_JSON}`);
    }
    
    const newsItems = JSON.parse(fs.readFileSync(NEWS_JSON, 'utf8'));
    console.log(`📄 ${newsItems.length} noticias cargadas`);

    // Cargar noticias de ciencia para recomendaciones
    const allScienceNews = loadScienceNews();

    for (const newsItem of newsItems) {
      await generateNewsHtml(newsItem, newsItems, allScienceNews);
    }

    generateIndexes(newsItems);
    console.log('🎉 ¡Proceso completado!');
    
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

async function generateNewsHtml(item, allNewsItems, allScienceNews) {
  const cuerpoDecoded = base64DecodeUnicode(item.cuerpo);
  const contentDecoded = base64DecodeUnicode(item.content);
  const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
  
  console.log(`📝 Procesando: ${item.titulo} (${slug})`);

  const processedCuerpo = await processImages(cuerpoDecoded, slug, 'es');
  const processedContent = await processImages(contentDecoded, slug, 'en');

  // Obtener recomendaciones
  const recommendationsEs = getRecommendations(item, allNewsItems, allScienceNews, 'es');
  const recommendationsEn = getRecommendations(item, allNewsItems, allScienceNews, 'en');
  
  const recommendationsHtmlEs = generateRecommendationsHtml(recommendationsEs, 'es', DOMAIN);
  const recommendationsHtmlEn = generateRecommendationsHtml(recommendationsEn, 'en', DOMAIN);

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
    authorName: item.author?.name || 'Redacción Editorial',
    recommendationsHtml: recommendationsHtmlEs
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
    authorName: item.author?.name || 'Editorial Staff',
    recommendationsHtml: recommendationsHtmlEn
  });

  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, `${slug}.EN.html`), htmlContentEn, 'utf8');
  console.log(`  ✅ Inglés: ${slug}.EN.html`);
}

function generateNewsHtmlTemplate({
  lang, title, content, fecha, slug, photo, domain, oaSvg, journalName, logo, authorName, recommendationsHtml
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
      openAccess: 'Acceso Abierto',
      newsletterTitle: 'Suscríbete al Boletín',
      newsletterText: 'Un resumen esencial de noticias científicas, opinión y análisis, entregado en tu bandeja de entrada.',
      namePlaceholder: 'Tu nombre completo',
      emailPlaceholder: 'correo@ejemplo.edu',
      newsletterBtn: 'Suscribirse',
      subscribing: 'Procesando...',
      successTitle: '¡Gracias por suscribirte!',
      successMessage: 'Recibirás noticias según tus preferencias',
      alreadySubscribed: 'Este correo ya está suscrito a nuestro boletín',
      invalidName: 'Por favor ingresa tu nombre',
      invalidEmail: 'Por favor ingresa un correo válido',
      generalError: 'Error al procesar la suscripción. Posiblemente ya estás suscrito con este correo'
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
      openAccess: 'Open Access',
      newsletterTitle: 'Sign up to the Briefing',
      newsletterText: 'An essential round-up of science news, opinion and analysis, delivered to your inbox.',
      namePlaceholder: 'Your full name',
      emailPlaceholder: 'email@example.edu',
      newsletterBtn: 'Sign Up',
      subscribing: 'Processing...',
      successTitle: 'Thank you for subscribing!',
      successMessage: 'You will receive news according to your preferences',
      alreadySubscribed: 'This email is already subscribed to our newsletter',
      invalidName: 'Please enter your name',
      invalidEmail: 'Please enter a valid email',
      generalError: 'Error processing subscription. You are likely already subscribed with this email'
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

  <!-- Firebase (newsletter) -->
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>

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
      --success: #16a34a;
      --error: #dc2626;
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

    /* ========== PROGRESS BAR ========== */
    .progress-container {
      position: fixed; top: 0; left: 0; width: 100%; height: 3px;
      background: transparent; z-index: 1002;
    }
    .progress-bar {
      height: 3px;
      background: linear-gradient(90deg, var(--accent), #f59e0b);
      width: 0%; 
      transition: width 0.12s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 0 12px rgba(234, 88, 12, 0.35);
    }

    /* ========== NAV ========== */
    .site-header {
      border-top: 4px solid var(--nyt-black);
      border-bottom: 1px solid var(--border-light);
      background: rgba(255,255,255,0.97);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      position: sticky; top: 0; z-index: 100;
      transition: box-shadow 0.3s ease;
    }
    .site-header.scrolled {
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
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
      transition: opacity 0.2s ease;
    }
    .nav-logo:hover { opacity: 0.85; }
    .nav-logo-img { height: 32px; width: auto; transition: transform 0.3s ease; }
    .nav-logo:hover .nav-logo-img { transform: scale(1.04); }
    .nav-logo-text {
      font-weight: 800; font-size: 0.85rem; letter-spacing: -0.02em;
      border-left: 1px solid var(--border-light); padding-left: 12px;
    }
    .nav-links { display: flex; gap: 1.75rem; align-items: center; }
    .nav-link {
      text-decoration: none; color: var(--text-muted);
      font-size: 0.72rem; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
      position: relative;
      transition: color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .nav-link::after {
      content: '';
      position: absolute; bottom: -3px; left: 0;
      width: 0; height: 1.5px;
      background: var(--accent);
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .nav-link:hover { color: var(--nyt-black); }
    .nav-link:hover::after { width: 100%; }

    /* ========== HERO ========== */
    .hero-header {
      height: 62vh; min-height: 420px; max-height: 620px;
      background-size: cover; background-position: center;
      position: relative; display: flex; align-items: flex-end;
      color: white;
    }
    .hero-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to bottom, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.85) 100%);
      display: flex; align-items: flex-end;
      padding: 0 24px 56px;
    }
    .hero-content { max-width: 920px; margin: 0 auto; width: 100%; }
    .kicker {
      font-family: 'Inter', sans-serif;
      font-weight: 800; text-transform: uppercase;
      font-size: 0.72rem; letter-spacing: 0.14em;
      color: #fdba74; margin-bottom: 14px;
      opacity: 0; transform: translateY(8px);
      animation: fadeUp 0.6s 0.15s forwards;
    }
    .hero-header h1, .standard-header h1 {
      font-family: 'Merriweather', Georgia, serif;
      font-size: clamp(2.1rem, 4.8vw, 3.4rem);
      line-height: 1.12; font-weight: 900;
      letter-spacing: -0.015em; margin-bottom: 18px;
      opacity: 0; transform: translateY(12px);
      animation: fadeUp 0.7s 0.25s forwards;
    }
    .hero-meta {
      font-family: 'Inter', sans-serif;
      font-size: 0.88rem; opacity: 0.92;
      display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
      opacity: 0; transform: translateY(8px);
      animation: fadeUp 0.6s 0.4s forwards;
    }
    .hero-meta .dot { opacity: 0.5; }
    .reading-badge {
      background: rgba(255,255,255,0.14);
      padding: 4px 12px; border-radius: 20px;
      font-size: 0.78rem; font-weight: 500;
      backdrop-filter: blur(4px);
      transition: background 0.25s ease;
    }
    .reading-badge:hover { background: rgba(255,255,255,0.22); }

    @keyframes fadeUp {
      to { opacity: 1; transform: translateY(0); }
    }

    /* Standard header */
    .standard-header {
      max-width: 920px; margin: 0 auto;
      padding: 72px 24px 40px; text-align: left;
    }
    .standard-header .kicker { color: var(--accent); }
    .standard-header h1 { color: var(--nyt-black); }
    .standard-header .hero-meta { color: var(--text-muted); }

    /* ========== LAYOUT ========== */
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

    /* ========== ARTICLE BODY ========== */
    .article-body {
      font-size: 1.18rem; 
      color: var(--text-body);
      max-width: 100%;
    }
    .article-body p { 
      margin-bottom: 1.7rem; 
    }

    /* ========== DROP CAP ELEGANTE Y PROFESIONAL ========== */
    .article-body > p:first-of-type::first-letter {
      float: left;
      font-family: 'Merriweather', Georgia, serif;
      font-weight: 900;
      font-size: 3.65rem;
      line-height: 0.82;
      padding-top: 0.08em;
      padding-right: 0.12em;
      padding-left: 0.02em;
      margin-right: 0.08em;
      margin-bottom: -0.08em;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }

    @supports (initial-letter: 3) or (-webkit-initial-letter: 3) {
      .article-body > p:first-of-type::first-letter {
        -webkit-initial-letter: 3;
        initial-letter: 3;
        font-size: unset;
        line-height: unset;
        padding-top: 0;
        margin-bottom: 0;
        padding-right: 0.14em;
      }
    }

    .article-body > p:first-of-type {
      margin-top: 0.15rem;
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

    /* LINKS PREMIUM */
    .article-body a {
      color: var(--link);
      text-decoration: none;
      background-image: linear-gradient(transparent 0%, transparent calc(100% - 1.5px), var(--link) calc(100% - 1.5px));
      background-size: 0% 100%;
      background-repeat: no-repeat;
      transition: background-size 0.35s cubic-bezier(0.4, 0, 0.2, 1), color 0.25s ease;
    }
    .article-body a:hover {
      color: var(--nyt-black);
      background-size: 100% 100%;
    }
    .article-body a:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
      border-radius: 2px;
    }

    /* Imágenes */
    .article-body img {
      max-width: 100%; height: auto; display: block;
      margin: 2.2rem auto; border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.07);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.4s ease;
    }
    .article-body img:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 32px rgba(0,0,0,0.1);
    }
    .article-body figure { margin: 2.5rem 0; }
    .article-body figcaption {
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem; color: var(--text-muted);
      margin-top: 0.75rem; line-height: 1.5;
    }

    /* Blockquotes */
    .article-body blockquote {
      margin: 2.6rem 0;
      padding: 1.4rem 1.8rem;
      border-left: 4px solid var(--nyt-black);
      background: var(--bg-sidebar);
      font-family: 'Merriweather', serif;
      font-style: italic; font-size: 1.22rem;
      color: #334155; border-radius: 0 6px 6px 0;
      transition: border-color 0.3s ease, background 0.3s ease;
    }
    .article-body blockquote:hover {
      border-left-color: var(--accent);
      background: #fff7ed;
    }

    /* Tablas */
    .article-body table {
      width: 100%; border-collapse: collapse;
      margin: 2.8rem 0; font-family: 'Inter', sans-serif;
      font-size: 0.9rem; display: block; overflow-x: auto;
      border-top: 2px solid var(--nyt-black);
      border-bottom: 2px solid var(--nyt-black);
      border-radius: 4px;
    }
    .article-body table th {
      font-weight: 700; text-align: left;
      padding: 14px 16px; border-bottom: 1px solid var(--nyt-black);
      text-transform: uppercase; font-size: 0.72rem;
      letter-spacing: 0.06em; color: var(--nyt-black);
      background: #f8fafc; white-space: nowrap;
    }
    .article-body table td {
      padding: 14px 16px; border-bottom: 1px solid var(--border-light);
      vertical-align: top; color: #334155;
      transition: background 0.2s ease;
    }
    .article-body table tr:hover td { background: #f8fafc; }
    .article-body table tr:last-child td { border-bottom: none; }

    /* Código */
    .article-body pre {
      background: #0f172a; color: #f1f5f9;
      padding: 1.5rem; border-radius: 8px;
      overflow-x: auto; font-family: 'JetBrains Mono', monospace;
      font-size: 0.84rem; line-height: 1.65; margin: 2rem 0;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      transition: box-shadow 0.3s ease;
    }
    .article-body pre:hover {
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(15,23,42,0.15);
    }
    .article-body code {
      font-family: 'JetBrains Mono', monospace;
      background: #f1f5f9; padding: 2px 6px; border-radius: 4px;
      font-size: 0.86em; color: #0f172a;
      transition: background 0.2s ease;
    }
    .article-body code:hover { background: #e2e8f0; }
    .article-body pre code { background: transparent; padding: 0; color: inherit; }

    /* Listas */
    .article-body ul, .article-body ol { margin: 1.5rem 0 1.5rem 1.6rem; }
    .article-body li { margin-bottom: 0.55rem; }

    /* Boxes */
    .article-body .note-box,
    .article-body .tip-box,
    .article-body .warning-box {
      margin: 2.2rem 0; padding: 1.3rem 1.6rem;
      border-radius: 6px; font-size: 1.05rem;
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }
    .article-body .note-box { background: #f0f9ff; border-left: 4px solid #0284c7; }
    .article-body .tip-box { background: #f0fdf4; border-left: 4px solid #16a34a; }
    .article-body .warning-box { background: #fff7ed; border-left: 4px solid #ea580c; }
    .article-body .note-box:hover,
    .article-body .tip-box:hover,
    .article-body .warning-box:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.06);
    }

    /* ========== SIDEBAR ========== */
    .article-sidebar {
      position: sticky; top: 92px;
      align-self: start;
      max-height: calc(100vh - 120px);
      overflow-y: auto; padding-right: 8px;
      scrollbar-width: thin;
      scrollbar-color: #cbd5e1 transparent;
    }
    .article-sidebar::-webkit-scrollbar { width: 5px; }
    .article-sidebar::-webkit-scrollbar-track { background: transparent; }
    .article-sidebar::-webkit-scrollbar-thumb {
      background: #cbd5e1; border-radius: 10px;
    }
    .article-sidebar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

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
      color: var(--nyt-black); margin-bottom: 16px;
    }

    /* TOC */
    .toc-list { list-style: none; }
    .toc-link {
      display: block; padding: 7px 12px;
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem; color: var(--text-muted);
      text-decoration: none; border-left: 2.5px solid transparent;
      border-radius: 0 4px 4px 0;
      transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      line-height: 1.4;
    }
    .toc-link:hover {
      color: var(--nyt-black);
      background: var(--bg-sidebar);
      border-left-color: #cbd5e1;
    }
    .toc-link.active {
      color: var(--nyt-black);
      border-left-color: var(--accent);
      background: #fff7ed;
      font-weight: 600;
    }
    .toc-link.toc-h3 { padding-left: 22px; font-size: 0.78rem; }
    .toc-link.toc-h4 { padding-left: 32px; font-size: 0.74rem; }

    /* ========== RECOMENDACIONES ========== */
    .recommendations-section .rec-card {
      display: flex;
      gap: 14px;
      padding: 14px 0;
      border-bottom: 1px solid var(--border-light);
      text-decoration: none;
      color: inherit;
      transition: background 0.2s ease, padding 0.2s ease;
    }
    .recommendations-section .rec-card:last-child { border-bottom: none; }
    .recommendations-section .rec-card:hover {
      background: #f8fafc;
      margin: 0 -8px;
      padding-left: 8px;
      padding-right: 8px;
      border-radius: 6px;
    }
    .rec-thumb {
      width: 72px;
      height: 72px;
      flex-shrink: 0;
      border-radius: 4px;
      overflow: hidden;
      background: #e2e8f0;
    }
    .rec-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.35s ease;
    }
    .rec-card:hover .rec-thumb img { transform: scale(1.06); }
    .rec-body { flex: 1; min-width: 0; }
    .rec-label {
      font-family: 'Inter', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--accent);
      display: block;
      margin-bottom: 4px;
    }
    .rec-body h4 {
      font-family: 'Merriweather', serif;
      font-size: 0.92rem;
      font-weight: 700;
      line-height: 1.35;
      color: var(--nyt-black);
      margin: 0;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* NEWSLETTER BOX */
    .newsletter-box {
      background: var(--bg-sidebar);
      border: 1px solid var(--border-light);
      border-radius: 8px;
      padding: 22px;
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }
    .newsletter-box:hover {
      border-color: #cbd5e1;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
    }
    .newsletter-box h4 {
      font-family: 'Merriweather', serif;
      font-size: 1.1rem; font-weight: 800;
      color: var(--nyt-black); margin-bottom: 8px;
    }
    .newsletter-box p {
      font-family: 'Inter', sans-serif;
      font-size: 0.84rem; color: var(--text-muted);
      margin-bottom: 16px; line-height: 1.5;
    }
    .newsletter-input {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid var(--border-dark);
      border-radius: 6px;
      margin-bottom: 10px;
      outline: none;
      font-family: 'Inter', sans-serif;
      font-size: 0.88rem;
      background: #fff;
      transition: border-color 0.25s ease, box-shadow 0.25s ease;
    }
    .newsletter-input:focus {
      border-color: var(--nyt-black);
      box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
    }
    .newsletter-input::placeholder { color: #94a3b8; }
    .newsletter-btn {
      width: 100%;
      padding: 12px;
      background: var(--nyt-black);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }
    .newsletter-btn:hover:not(:disabled) {
      background: var(--accent);
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(234, 88, 12, 0.25);
    }
    .newsletter-btn:active:not(:disabled) {
      transform: translateY(0);
    }
    .newsletter-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .newsletter-error {
      color: var(--error);
      font-size: 0.78rem;
      font-family: 'Inter', sans-serif;
      text-align: center;
      margin-top: 10px;
      display: none;
    }
    .newsletter-success {
      text-align: center;
      padding: 18px 0 8px;
      display: none;
    }
    .newsletter-success .check-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px; height: 48px;
      border-radius: 50%;
      background: #dcfce7;
      color: var(--success);
      margin-bottom: 12px;
      animation: scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes scaleIn {
      from { transform: scale(0.6); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    /* Meta row */
    .meta-row {
      display: flex; align-items: center; gap: 16px;
      flex-wrap: wrap; margin: 28px 0 12px;
      font-family: 'Inter', sans-serif;
    }
    .oa-badge {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--open-access); font-weight: 600; font-size: 0.85rem;
      transition: transform 0.2s ease;
    }
    .oa-badge:hover { transform: scale(1.03); }
    .share-group { display: flex; gap: 8px; }
    .share-btn {
      width: 36px; height: 36px; border-radius: 50%;
      border: 1.5px solid var(--border-dark); background: #fff;
      color: var(--nyt-black); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .share-btn:hover {
      background: var(--nyt-black);
      color: #fff;
      border-color: var(--nyt-black);
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(15, 23, 42, 0.15);
    }
    .share-btn:active { transform: translateY(0); }
    .share-btn svg { width: 14px; height: 14px; fill: currentColor; transition: fill 0.2s; }

    /* Citation */
    .citation-box {
      margin-top: 52px; padding-top: 28px;
      border-top: 1px solid var(--border-light);
      font-family: 'Inter', sans-serif;
      font-size: 0.86rem; color: var(--text-muted); line-height: 1.65;
    }
    .citation-box strong {
      display: block; font-size: 0.74rem;
      text-transform: uppercase; letter-spacing: 0.07em;
      color: var(--nyt-black); margin-bottom: 10px;
    }

    /* ========== AUDIO PLAYER ========== */
    .audio-player {
      position: fixed; bottom: 28px; right: 28px; z-index: 1000;
      background: #fff; border: 1.5px solid var(--nyt-black);
      box-shadow: 0 12px 36px rgba(0,0,0,0.12);
      padding: 11px 15px; display: flex; align-items: center; gap: 12px;
      font-family: 'Inter', sans-serif; border-radius: 10px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .audio-player:hover {
      box-shadow: 0 16px 40px rgba(0,0,0,0.16);
      transform: translateY(-2px);
    }
    .audio-player.hidden { display: none; }
    .audio-btn {
      width: 36px; height: 36px; border-radius: 50%;
      border: 1.5px solid var(--border-dark); background: transparent;
      color: var(--nyt-black); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .audio-btn:hover {
      background: var(--nyt-black);
      color: #fff;
      border-color: var(--nyt-black);
      transform: scale(1.06);
    }
    .audio-btn:active { transform: scale(0.96); }
    .audio-btn svg { width: 14px; height: 14px; fill: currentColor; }
    .audio-status {
      font-size: 0.72rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .audio-progress {
      width: 110px; height: 3px; background: var(--border-light); 
      margin-top: 6px; border-radius: 2px; overflow: hidden;
    }
    .audio-progress-bar {
      height: 100%; background: var(--accent); width: 0%;
      transition: width 0.12s linear;
      border-radius: 2px;
    }

    /* ========== FOOTER ========== */
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
    .footer-desc { font-size: 0.86rem; color: var(--text-muted); max-width: 340px; line-height: 1.6; }
    .footer-social { display: flex; gap: 16px; margin-top: 20px; }
    .footer-social a {
      color: var(--nyt-black);
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: inline-flex;
    }
    .footer-social a:hover {
      color: var(--accent);
      transform: translateY(-3px);
    }
    .footer-bottom {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 0.75rem; color: var(--text-muted);
      max-width: 1200px; margin: 0 auto; flex-wrap: wrap; gap: 12px;
    }
    .footer-bottom-links { display: flex; gap: 18px; }
    .footer-bottom-links a {
      color: var(--text-muted); text-decoration: none;
      transition: color 0.25s ease;
      position: relative;
    }
    .footer-bottom-links a::after {
      content: '';
      position: absolute; bottom: -2px; left: 0;
      width: 0; height: 1px; background: var(--accent);
      transition: width 0.3s ease;
    }
    .footer-bottom-links a:hover { color: var(--nyt-black); }
    .footer-bottom-links a:hover::after { width: 100%; }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-header { height: 52vh; min-height: 340px; }
      .article-body { font-size: 1.05rem; }
      .article-body > p:first-of-type::first-letter {
        font-size: 3.1rem;
      }
      .audio-player { bottom: 16px; right: 16px; padding: 9px 12px; }
      .nav-logo-text { display: none; }
    }

    /* Focus visible global */
    :focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
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

  <header class="site-header" id="siteHeader">
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
          <button class="share-btn" onclick="shareOnTwitter()" title="Twitter" aria-label="Share on Twitter">
            <svg viewBox="0 0 24 24"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/></svg>
          </button>
          <button class="share-btn" onclick="shareOnFacebook()" title="Facebook" aria-label="Share on Facebook">
            <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </button>
          <button class="share-btn" onclick="shareOnLinkedIn()" title="LinkedIn" aria-label="Share on LinkedIn">
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

      ${recommendationsHtml}

      <!-- NEWSLETTER -->
      <div class="sidebar-section">
        <div class="newsletter-box" id="newsletterBox">
          <h4>${t.newsletterTitle}</h4>
          <p>${t.newsletterText}</p>
          <div id="newsletterForm">
            <input type="text" id="newsletterName" class="newsletter-input" placeholder="${t.namePlaceholder}" required autocomplete="name">
            <input type="email" id="newsletterEmail" class="newsletter-input" placeholder="${t.emailPlaceholder}" required autocomplete="email">
            <button id="newsletterSubmit" class="newsletter-btn">${t.newsletterBtn}</button>
            <div id="newsletterError" class="newsletter-error"></div>
          </div>
          <div id="newsletterSuccess" class="newsletter-success">
            <div class="check-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <p style="font-family:'Inter',sans-serif; font-size:0.9rem; color:var(--success); font-weight:700; margin-bottom:4px;">${t.successTitle}</p>
            <p style="font-family:'Inter',sans-serif; font-size:0.8rem; color:var(--text-muted);">${t.successMessage}</p>
          </div>
        </div>
      </div>

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
    <button class="audio-btn" id="playPauseBtn" title="${t.listen}" aria-label="${t.listen}">
      <svg id="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <button class="audio-btn" id="stopBtn" title="${t.stop}" aria-label="${t.stop}">
      <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10"/></svg>
    </button>
    <div>
      <div class="audio-status" id="statusText">${t.listen}</div>
      <div class="audio-progress"><div class="audio-progress-bar" id="audioProgressBar"></div></div>
    </div>
    <button class="audio-btn" id="closeAudioBtn" title="${t.closeAudio}" aria-label="${t.closeAudio}" style="width:28px;height:28px;border:none;">
      <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>
    </button>
  </div>

  <footer class="footer">
    <div class="footer-container">
      <div>
        <div class="footer-brand">${journalName}</div>
        <p class="footer-desc">${t.footerDesc}</p>
        <div class="footer-social">
          <a href="${socialLinks.instagram}" title="Instagram" target="_blank" rel="noopener">${socialIcons.instagram}</a>
          <a href="${socialLinks.youtube}" title="YouTube" target="_blank" rel="noopener">${socialIcons.youtube}</a>
          <a href="${socialLinks.tiktok}" title="TikTok" target="_blank" rel="noopener">${socialIcons.tiktok}</a>
          <a href="${socialLinks.spotify}" title="Spotify" target="_blank" rel="noopener">${socialIcons.spotify}</a>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; align-items:flex-start;">
        <div>
          <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:8px;">${t.contact}</div>
          <a href="mailto:contact@revistacienciasestudiantes.com" style="color:var(--nyt-black); text-decoration:none; font-weight:600; transition:color 0.25s;">
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
    // Header shadow on scroll
    window.addEventListener('scroll', () => {
      const header = document.getElementById('siteHeader');
      if (window.scrollY > 20) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    });

    // Progress + TOC
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

    // ========== NEWSLETTER FIREBASE ==========
    document.addEventListener('DOMContentLoaded', function() {
      const firebaseConfig = {
        apiKey: "AIzaSyArr3LE_hQLZG0L5m9JND2OWVL8elnSyWk",
        authDomain: "usuarios-rnce.firebaseapp.com",
        projectId: "usuarios-rnce",
        storageBucket: "usuarios-rnce.firebasestorage.app",
        messagingSenderId: "688242139131",
        appId: "1:688242139131:web:3a98663545e73110c3f55e",
        measurementId: "G-K90MKB7BDP"
      };
      
      firebase.initializeApp(firebaseConfig);
      const db = firebase.firestore();
      const CHECK_SUBSCRIPTION_URL = 'https://us-central1-usuarios-rnce.cloudfunctions.net/checkSubscription';
      
      const nameInput = document.getElementById('newsletterName');
      const emailInput = document.getElementById('newsletterEmail');
      const submitBtn = document.getElementById('newsletterSubmit');
      const errorDiv = document.getElementById('newsletterError');
      const formDiv = document.getElementById('newsletterForm');
      const successDiv = document.getElementById('newsletterSuccess');
      
      if (!nameInput || !emailInput || !submitBtn) return;
      
      async function checkExistingSubscription(email) {
        try {
          const response = await fetch(CHECK_SUBSCRIPTION_URL + '?email=' + encodeURIComponent(email.toLowerCase()));
          if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error('HTTP ' + response.status);
          }
          const data = await response.json();
          return data.subscription || null;
        } catch (error) {
          console.error('Error checking subscription:', error);
          return null;
        }
      }
      
      submitBtn.addEventListener('click', async function() {
        const nombre = nameInput.value.trim();
        const correo = emailInput.value.trim();
        
        errorDiv.style.display = 'none';
        
        if (!nombre) {
          errorDiv.textContent = '${t.invalidName}';
          errorDiv.style.display = 'block';
          return;
        }
        if (!correo || !correo.includes('@')) {
          errorDiv.textContent = '${t.invalidEmail}';
          errorDiv.style.display = 'block';
          return;
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = '${t.subscribing}';
        
        try {
          const existing = await checkExistingSubscription(correo);
          
          if (existing && existing.active) {
            errorDiv.textContent = '${t.alreadySubscribed}';
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = '${t.newsletterBtn}';
            return;
          }
          
          const emailNormalizado = correo.toLowerCase().trim();
          const emailId = emailNormalizado.replace(/[^a-z0-9]/g, '_');
          
          const subscriptionData = {
            email: emailNormalizado,
            nombre: nombre,
            idioma: '${lang}',
            active: true,
            preferences: {
              areas: ['biologia', 'quimica', 'fisica', 'matematica', 'computacion', 'astronomia', 'geologia', 'medicina', 'ingenieria', 'ciencias_sociales', 'medio_ambiente', 'neurociencia', 'logros_estudiantiles'],
              frecuencia: 'inmediato',
              idioma: '${lang}',
              notificaciones: {
                nuevas_publicaciones: true,
                convocatorias: true,
                eventos: true,
                oportunidades: false,
                logros_estudiantiles: true
              }
            },
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSentAt: null,
            lastSentNews: [],
            welcomeEmailSentAt: null,
            welcomeEmailStatus: 'pending'
          };
          
          await db.collection('newsletter').doc(emailId).set(subscriptionData);
          
          formDiv.style.display = 'none';
          successDiv.style.display = 'block';
          
          setTimeout(() => {
            formDiv.style.display = 'block';
            successDiv.style.display = 'none';
            nameInput.value = '';
            emailInput.value = '';
          }, 5500);
          
        } catch (error) {
          console.error('Error subscribing:', error);
          errorDiv.textContent = '${t.generalError}';
          errorDiv.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = '${t.newsletterBtn}';
        }
      });
    });

    // ========== TEXT TO SPEECH ==========
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

  // Inglés
  const indexEn = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>News Archive — ${JOURNAL_NAME_EN}</title>
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
    <a href="/">${JOURNAL_NAME_EN.toUpperCase()}</a>
    <div style="font-size:0.8rem;color:#64748b;">ISSN 3087-2839</div>
  </nav>
  <div class="wrapper">
    <main class="card">
      <h1>News Archive</h1>
      <p class="desc">All editorial news from the journal, organized by year.</p>
      ${sortedYears.map(year => `
        <h2 class="year">${year}</h2>
        ${newsByYear[year].map(item => {
          const slug = item.slug || generateSlug(`${item.titulo} ${item.fecha}`);
          return `<div class="item">
            <a href="/news/${slug}.EN.html">${item.title || item.titulo}</a>
            <div class="meta">${formatDateEn(item.fecha)} · Editorial Staff</div>
          </div>`;
        }).join('')}
      `).join('')}
    </main>
  </div>
  <footer>© ${new Date().getFullYear()} ${JOURNAL_NAME_EN}</footer>
</body>
</html>`;

  fs.writeFileSync(path.join(OUTPUT_HTML_DIR, 'index.EN.html'), indexEn, 'utf8');
  console.log('✅ Índice inglés generado');

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
