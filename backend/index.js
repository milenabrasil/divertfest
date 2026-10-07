const app = require('./app');
const pool = require('./src/config/db');

const PORT = process.env.PORT || 3000;

pool.query('SELECT 1')
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    })
    .catch((err) => {
        console.error(
            'Não foi possível conectar ao banco de dados:',
            err.message
        );
        process.exit(1);
    });

// const express = require('express');
// const pool = require('../backend/src/config/db');

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.use(express.json());

// app.get('/brinquedos', async (req, res) => {
//   const { rows } = await pool.query('SELECT * FROM brinquedo ORDER BY id');
//   res.json(rows);
// });

// app.get('/users/:id', async (req, res) => {
//   const { rows } = await pool.query(
//     'SELECT * FROM users WHERE id = $1',
//     [req.params.id]
//   );
//   if (rows.length === 0) {
//     return res.status(404).json({ erro: 'Utilizador não encontrado' });
//   }
//   res.json(rows[0]);
// });

// app.post('/users', async (req, res) => {
//   const { nome, email } = req.body;
//   const { rows } = await pool.query(
//     'INSERT INTO users (nome, email) VALUES ($1, $2) RETURNING *',
//     [nome, email]
//   );
//   res.status(201).json(rows[0]);
// });

// // Middleware de erros (o Express 5 apanha erros de rotas async sozinho)
// app.use((err, req, res, next) => {
//   console.error(err);
//   res.status(500).json({ erro: 'Erro interno do servidor' });
// });

// // Só arranca o servidor se a ligação à BD funcionar
// pool.query('SELECT 1')
//   .then(() => {
//     app.listen(PORT, () => {
//       console.log(`Servidor a correr em http://localhost:${PORT}`);
//     });
//   })
//   .catch((err) => {
//     console.error('Não foi possível ligar à base de dados:', err.message);
//     process.exit(1);
//   });