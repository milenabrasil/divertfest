
const pagamentoService = require('../src/services/pagamentoService');
const pool = require('../src/config/db');

const executar = async () => {
    try {
        const resultado =
            await pagamentoService.recuperarTentativaExpirada(12);

        console.log('Resultado da recuperação:', resultado);
    } catch (error) {
        console.error('Erro:', error.message);
    } finally {
        await pool.end();
    }
};

executar();
