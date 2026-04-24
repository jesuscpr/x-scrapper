// Importamos playwright
import { chromium } from 'playwright';
import dotenv from 'dotenv';
dotenv.config();
// ========================================
// CONFIGURACIÓN DE PROXIES
// ========================================

const ROTATING_PROXY = {
  enabled: true,
  server: process.env.SERVER,
  username: process.env.USER,
  password: process.env.PASSWORD
};

/**
 * Configuración de límites para evitar bloqueos
 */
const LIMITS = {
  // Pausa mínima entre solicitudes (en milisegundos)
  minPauseBetweenRequests: 3000,  // 3 segundos
  
  // Pausa máxima entre solicitudes
  maxPauseBetweenRequests: 7000,  // 7 segundos
};

// Contador de requests
let requestCount = 0;

/**
 * Pausa aleatoria para simular comportamiento humano
 */
async function randomPause() {
  const pauseTime = Math.floor(
    Math.random() * (LIMITS.maxPauseBetweenRequests - LIMITS.minPauseBetweenRequests) 
    + LIMITS.minPauseBetweenRequests
  );
  console.log(`⏳ Pausa de ${(pauseTime / 1000).toFixed(1)} segundos...`);
  await new Promise(resolve => setTimeout(resolve, pauseTime));
}

// ========================================
// SCRAPER CON ROTATING PROXY
// ========================================

/**
 * Función principal que hace el scraping de un perfil de Twitter
 * @param {string} username - El nombre de usuario sin el @
 * @param {Object} options - Opciones de configuración
 * @param {boolean} options.includeTweets - Si debe extraer tweets (default: true)
 * @returns {Object|null} Datos del perfil y tweets o null si hay error
 */
async function scrapeTwitterProfile(username, options = { includeTweets: true }) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🚀 Iniciando scraper para @${username}...`);
  console.log('='.repeat(70));
  
  let browser;
  
  try {
    // Pausa antes de la solicitud (simular comportamiento humano)
    if (requestCount > 0) {
      await randomPause();
    }

    requestCount++;
    
    // Configurar proxy
    if (ROTATING_PROXY.enabled) {
      console.log(`🌐 Usando Rotating Proxy de Webshare (request #${requestCount})`);
      console.log(`   El proxy rotará automáticamente en cada request`);
    } else {
      console.log(`🌐 Sin proxy - IP directa (request #${requestCount})`);
    }
    
    // PASO 1: Lanzar el navegador con proxy
    // ======================================
    const launchOptions = {
      headless: true,
      slowMo: 0
    };
    
    // Agregar configuración de proxy si está habilitado
    if (ROTATING_PROXY.enabled) {
      launchOptions.proxy = {
        server: ROTATING_PROXY.server,
        username: ROTATING_PROXY.username,
        password: ROTATING_PROXY.password
      };
    }
    
    browser = await chromium.launch(launchOptions);
    
    const page = await browser.newPage();
    page.setDefaultTimeout(20000); // 20 segundos (más tiempo por si el proxy es lento)
    
    // PASO 2: Navegar a la URL del perfil
    // ====================================
    const url = `https://x.com/${username}`;
    console.log(`📱 Navegando a ${url}...`);

    // Intentar navegar a la página
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000  // Más tiempo con proxy
      });
    } catch (error) {
      throw new Error(`No se pudo cargar la página: ${error.message}`);
    }

    // PASO 3: Detectar si el perfil existe
    // =====================================
    console.log('🔍 Verificando si el perfil existe...');

    // Esperar a que cargue la página
    await page.waitForTimeout(3000);

    // Twitter muestra errores en un div con data-testid="empty_state_header_text"
    const emptyStateText = await page.evaluate(() => {
      const element = document.querySelector('[data-testid="empty_state_header_text"]');
      return element ? element.innerText.toLowerCase() : '';
    });

    // Si encontramos texto en el área de errores, determinar qué tipo de error es
    if (emptyStateText) {
      console.log(`📝 Mensaje detectado: "${emptyStateText}"`);

      // Perfil no existe
      if (emptyStateText.includes('existe') || emptyStateText.includes('exist')) {
        throw new Error('PERFIL_NO_EXISTE');
      }

      // Perfil protegido/privado
      if (emptyStateText.includes('proteg') || emptyStateText.includes('protect')) {
        throw new Error('PERFIL_PRIVADO');
      }

      // Perfil suspendido
      if (emptyStateText.includes('suspend')) {
        throw new Error('PERFIL_SUSPENDIDO');
      }

      // Si hay texto de error pero no coincide con ninguno conocido
      console.warn(`⚠️  Mensaje de error desconocido: "${emptyStateText}"`);
      throw new Error('ERROR_DESCONOCIDO');
    }

    console.log('⏳ Esperando a que cargue el contenido del perfil...');

    try {
      // Esperamos a que aparezca el enlace de "following"
      // Si no aparece en 10 segundos, probablemente el perfil es privado o hay un problema
      await page.waitForSelector('a[href*="following"]', { timeout: 15000 });
      console.log('✅ Perfil público detectado!');
    } catch (error) {
      // Si después de todo no aparece el botón, es un timeout
      throw new Error('TIMEOUT_CARGA_PERFIL');
    }

    // PASO 4: Extraer los tweets (si está habilitado)
    // ================================================
    let tweets = [];

    if (options.includeTweets) {
      console.log('📱 Extrayendo tweets...');

      tweets = await page.evaluate(() => {
        // Función auxiliar para extraer números
        function extractNumber(text) {
          if (!text) return 0;

          const match = text.match(/(\d+)/);

          let number = parseFloat(match[1], 12) || 0;

          return Math.round(number);
        }

        // Seleccionar todos los tweets
        const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');

        const extractedTweets = [];

        tweetElements.forEach((tweetEl, index) => {
          try {
            // Extraer texto del tweet
            const textElement = tweetEl.querySelector('[data-testid="tweetText"]');
            const text = textElement ? textElement.innerText : '';

            // Extraer likes
            const likeButton = tweetEl.querySelector('[data-testid="like"]');
            const likeText = likeButton ? likeButton.getAttribute('aria-label') || likeButton.innerText : '0';
            const likes = extractNumber(likeText);

            // Extraer retweets
            const retweetButton = tweetEl.querySelector('[data-testid="retweet"]');
            const retweetText = retweetButton ? retweetButton.getAttribute('aria-label') || retweetButton.innerText : '0';
            const retweets = extractNumber(retweetText);

            // Extraer respuestas
            const replyButton = tweetEl.querySelector('[data-testid="reply"]');
            const replyText = replyButton ? replyButton.getAttribute('aria-label') || replyButton.innerText : '0';
            const replies = extractNumber(replyText);

            // Extraer fecha (usamos datetime que es más confiable)
            const timeElement = tweetEl.querySelector('time');
            const datetime = timeElement ? timeElement.getAttribute('datetime') : null;
            const displayDate = timeElement ? timeElement.innerText : 'Fecha desconocida';

            // Extraer alcance/reproducciones (views)
            const analyticsLink = tweetEl.querySelector('a[href*="/analytics"]');
            const viewsText = analyticsLink ? analyticsLink.getAttribute('aria-label') || analyticsLink.innerText : '0';
            const views = extractNumber(viewsText);

            // Extraer imágenes si existen
            const imageElements = tweetEl.querySelectorAll('[data-testid="tweetPhoto"] img');
            const images = Array.from(imageElements).map(img => img.src);

            // Detectar si tiene botón "mostrar más"
            const hasShowMore = !!tweetEl.querySelector('[data-testid="tweet-text-show-more-link"]');

            // Extraer el ID del tweet desde la URL
            const tweetLinks = tweetEl.querySelectorAll('a[href*="/status/"]');
            let tweetId = null;
            if (tweetLinks.length > 0) {
              const href = tweetLinks[0].getAttribute('href');
              const match = href.match(/\/status\/(\d+)/);
              if (match) {
                tweetId = match[1];
              }
            }

            // Construir objeto del tweet
            extractedTweets.push({
              id: tweetId,
              text: text,
              likes: likes,
              retweets: retweets,
              replies: replies,
              views: views,
              date: datetime,
              displayDate: displayDate,
              images: images,
              hasMoreText: hasShowMore,
              position: index + 1  // Posición en el timeline
            });

          } catch (error) {
            console.error(`Error extrayendo tweet ${index + 1}:`, error);
          }
        });

        return extractedTweets;
      });

      console.log(`✅ Extraídos ${tweets.length} tweets`);
    }

    // PASO 5: Extraer información del perfil
    // =======================================
    console.log('📊 Extrayendo información del perfil...');

    const profileData = await page.evaluate(() => {
      // ESTE CÓDIGO SE EJECUTA EN EL NAVEGADOR, NO EN NODE.JS

      // Función auxiliar para extraer números de texto
      function extractNumber(text) {
        if (!text) return 0;

        // Detectar multiplicadores
        const hasMil = text.toLowerCase().includes('mil');
        const hasK = text.toUpperCase().includes('K');
        const hasM = text.toUpperCase().includes('M');

        // Eliminar todo excepto números, puntos y comas
        text = text.replace(/[^\d.,]/g, '');

        // Si algún perfil tuviese más de mil millones de seguidores puede que hubiese que separar el hasM
        if (hasMil || hasK || hasM) {
          // CON abreviación: determinar formato (español vs inglés)
          text = text.includes(',')
            ? text.replace(/\./g, '').replace(',', '.') // Español
            : text.replace(/,/g, '');                   // Inglés
        } else {
          // SIN abreviación: eliminar separadores
          text = text.replace(/[.,]/g, '');
        }

        let number = parseFloat(text) || 0;

        // Aplicar multiplicador
        if (hasMil || hasK) {
          number *= 1000;
        } else if (hasM) {
          number *= 1000000;
        }

        return Math.round(number);
      }

      // Función auxiliar segura para obtener texto
      function safeGetText(selector) {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : null;
      }

      // Función auxiliar segura para obtener atributo
      function safeGetAttribute(selector, attribute) {
        const element = document.querySelector(selector);
        return element ? element.getAttribute(attribute) : null;
      }

      // Extraer nombre del perfil
      const nameElement = document.querySelector('[data-testid="UserName"]');
      let name = 'No encontrado';
      if (nameElement) {
        const fullText = nameElement.textContent;
        // El formato suele ser "Nombre@username"
        name = fullText.split('@')[0].trim();
      }

      // Extraer siguiendo (following)
      const followingText = safeGetText('a[href*="/following"]');
      const following = extractNumber(followingText || '0');

      // Extraer seguidores (followers)
      const followersText = safeGetText('a[href*="verified_followers"]');
      const followers = extractNumber(followersText || '0');

      // Extraer foto de perfil (versión mejorada)
      const profilePicture = safeGetAttribute(
        '[data-testid^="UserAvatar-Container-"] img[src*="profile_images"]',
        'src'
      ) || 'No encontrada';

      // Extraer bio (descripción del perfil)
      const bio = safeGetText('[data-testid="UserDescription"]') || 'Sin descripción';

      // Extraer ubicación si existe
      const location = safeGetText('[data-testid="UserLocation"]') || 'No especificada';

      // Extraer fecha de registro
      const joinDateElement = document.querySelector('[data-testid="UserJoinDate"]');
      let joinDate = 'No disponible';
      if (joinDateElement) {
        joinDate = joinDateElement.textContent.replace('Se unió en ', '')
          .replace('Joined ', '');
      }

      // Devolver objeto con toda la información
      return {
        name,
        following,
        followers,
        profilePicture,
        bio,
        location,
        joinDate,
        // Metadata útil
        scrapedAt: new Date().toISOString(),
        username: window.location.pathname.replace('/', '')
      };
    });
    
    // Validamos que hemos extraido el nombre
    if (!profileData.name || profileData.name === 'No encontrado') {
      throw new Error('NO_SE_PUDO_EXTRAER_NOMBRE');
    }

    // PASO 6: Combinar datos
    // =======================
    const result = {
      profile: profileData,
      tweets: tweets,
      stats: {
        totalTweetsExtracted: tweets.length,
        totalLikes: tweets.reduce((sum, t) => sum + t.likes, 0),
        totalRetweets: tweets.reduce((sum, t) => sum + t.retweets, 0),
        totalReplies: tweets.reduce((sum, t) => sum + t.replies, 0),
        totalViews: tweets.reduce((sum, t) => sum + t.views, 0)
      }
    };

    // PASO 7: Mostrar resultados
    // ===========================
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESULTADOS DEL SCRAPING');
    console.log('='.repeat(60));
    console.log(`👤 Usuario: @${profileData.username}`);
    console.log(`📝 Nombre: ${profileData.name}`);
    console.log(`👥 Siguiendo: ${profileData.following.toLocaleString()}`);
    console.log(`❤️  Seguidores: ${profileData.followers.toLocaleString()}`);
    console.log(`📍 Ubicación: ${profileData.location}`);
    console.log(`📅 Se unió: ${profileData.joinDate}`);
    console.log(`📄 Bio: ${profileData.bio.substring(0, 80)}${profileData.bio.length > 80 ? '...' : ''}`);

    if (options.includeTweets && tweets.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log(`📊 Tweets: ${tweets.length} | ❤️  Likes: ${result.stats.totalLikes.toLocaleString()} | ` +
                  `🔁 Retweets: ${result.stats.totalRetweets.toLocaleString()} | ` +
                  `💬 Comentarios: ${result.stats.totalReplies.toLocaleString()} | ` +
                  `👁️  Views: ${result.stats.totalViews.toLocaleString()}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // Cerrar el navegador
    await browser.close();
    console.log('✅ Scraper finalizado exitosamente!\n');

    return result;

  } catch (error) {
    // Manejo de errores
    console.error('\n' + '❌'.repeat(25));

    // Errores personalizados con mensajes claros
    if (error.message === 'PERFIL_NO_EXISTE') {
      console.error(`❌ ERROR: El perfil @${username} no existe`);
      console.error('💡 Verifica que el nombre de usuario sea correcto');
    } else if (error.message === 'PERFIL_SUSPENDIDO') {
      console.error(`❌ ERROR: La cuenta @${username} está suspendida`);
    } else if (error.message === 'PERFIL_PRIVADO') {
      console.error(`❌ ERROR: El perfil @${username} está protegido/privado`);
      console.error('💡 Solo los seguidores aprobados pueden ver este perfil');
    } else if (error.message === 'TIMEOUT_CARGA_PERFIL') {
      console.error(`❌ ERROR: Timeout esperando que cargue el perfil`);
      console.error('💡 Posibles causas: Internet lento, Twitter caído, o cambios en la estructura');
    } else if (error.message === 'NO_SE_PUDO_EXTRAER_NOMBRE') {
      console.error(`❌ ERROR: No se pudo extraer información del perfil`);
      console.error('💡 Posible causa: Twitter cambió la estructura de su HTML');
    } else if (error.message === 'ERROR_DESCONOCIDO') {
      console.error(`❌ ERROR: Twitter mostró un mensaje de error desconocido`);
      console.error('💡 Revisa manualmente el perfil en el navegador para ver qué sucede');
    } else {
      // Error genérico
      console.error(`❌ ERROR INESPERADO: ${error.message}`);
      console.error('💡 Stack trace:', error.stack);
    }

    console.error('❌'.repeat(25) + '\n');

    // Cerrar navegador si está abierto
    if (browser) {
      await browser.close();
    }

    return null;
  }
}

/**
 * Guarda los datos en un archivo JSON
 * @param {Object} data - Datos a guardar
 * @param {string} filename - Nombre del archivo
 */
async function saveToJSON(data, filename = 'scraped_data.json') {
  const fs = await import('fs/promises');
  await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`💾 Datos guardados en ${filename}`);
}

// Scrapear un perfil
scrapeTwitterProfile('Simon_Hypixel', { includeTweets: true })
  .then(async (data) => {
    if (data) {
      console.log("Datos extraidos correctamente")
      // Guardamos los datos en un archivo json
      await saveToJSON(data, 'extracted_data.json');
    }
  })
  .catch(error => {
    console.error('No se han podido extraer los datos:', error);
  });
