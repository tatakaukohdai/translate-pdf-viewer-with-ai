import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { translateRouter } from './routes/translate';
import { notesRouter } from './routes/notes';
import { booksRouter } from './routes/books';
import { initDb } from './db';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!IS_PROD) {
  app.use(cors({ origin: 'http://localhost:5173' }));
}

app.use(express.json({ limit: '2mb' }));

app.use('/api/translate', translateRouter);
app.use('/api/notes', notesRouter);
app.use('/api/books', booksRouter);

if (IS_PROD) {
  const clientDist = path.join(__dirname, '../../dist/client');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

(async () => {
  await initDb();

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!IS_PROD) {
      console.log('Development mode: frontend served by Vite at http://localhost:5173');
    }
  });
})();
