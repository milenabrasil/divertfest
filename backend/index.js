const app = require('./app');
const pool = require('./src/config/db');

const {
    iniciarExpiracaoJob
} = require('./src/jobs/expiracaoJob');

const PORT = process.env.PORT || 3000;

pool.query('SELECT 1')
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
            // Inicia a verificação automática de reservas vencidas
            iniciarExpiracaoJob();
        });
    })
    .catch((err) => {
        console.error(
            'Não foi possível conectar ao banco de dados:',
            err.message
        );
        process.exit(1);
    });

