import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { scrapeTwitterProfile } from './scraper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/scrape', async (req, res) => {
  const username = (req.body.username || '')
    .trim()
    .replace(/^@/, '');

  if (!username) {
    return res.status(400).json({ error: 'Introduce un nombre de usuario válido.' });
  }

  if (!/^[a-zA-Z0-9_]{1,15}$/.test(username)) {
    return res.status(400).json({ error: 'El usuario solo puede contener letras, números y guiones bajos (máx. 15 caracteres).' });
  }

  try {
    const data = await scrapeTwitterProfile(username, { includeTweets: true });

    if (!data) {
      return res.status(422).json({
        error: 'No se pudo scrapear el perfil. Comprueba que existe, es público y tiene algún tweet. Además, ya que no iniciamos sesión al scrapear para no sobrepasar los límites de twitter es posible que no detecte publicaciones recientes; por ello para probar la funcionalidad es mejor buscar un perfil con muchas publicaciones y que no todas sean recientes.',
      });
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`X Scraper disponible en http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ El puerto ${PORT} ya está en uso.`);
    console.error('   Cierra la otra instancia del servidor o usa otro puerto:');
    console.error(`   PORT=3001 npm start\n`);
    process.exit(1);
  }
  throw err;
});
