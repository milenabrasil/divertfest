
const expiracaoService = require('../services/expiracaoService');

let executando = false;

const iniciarExpiracaoJob = () => {
    const executar = async () => {
        // Impede duas execuções simultâneas
        if (executando) {
            console.log(
                'Verificação de expiração já está em andamento.'
            );
            return;
        }

        executando = true;

        try {
            await expiracaoService.expirarReservas();
        } catch (error) {
            console.error(
                'Erro ao expirar reservas:',
                error
            );
        } finally {
            // Libera a próxima execução mesmo se ocorrer erro
            executando = false;
        }
    };

    // Executa imediatamente ao iniciar o servidor
    executar();

    // Repete a verificação a cada minuto
    return setInterval(executar, 60 * 1000);
};

module.exports = {
    iniciarExpiracaoJob
};
