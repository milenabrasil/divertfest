
const expiracaoService = require('../services/expiracaoService');

const iniciarExpiracaoJob = () => {
    const executar = async () => {
        try {
            await expiracaoService.expirarReservas();
        } catch (error) {
            console.error(
                'Erro ao expirar reservas:',
                error
            );
        }
    };

    // Verifica imediatamente ao iniciar o servidor
    executar();

    // Depois verifica a cada minuto
    return setInterval(executar, 60 * 1000);
};

module.exports = {
    iniciarExpiracaoJob
};
