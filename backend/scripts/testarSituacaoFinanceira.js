
const reservaRepository = require('../src/repositories/reservaRepository');
const pool = require('../src/config/db');

const executar = async () => {
    const reserva = await reservaRepository.buscarPorId(27);

    if (!reserva) {
        throw new Error('Reserva #27 não encontrada.');
    }

    console.log('SITUAÇÃO FINANCEIRA DA RESERVA:');

    console.log({
        id: reserva.id,
        status: reserva.status,
        valorTotal: reserva.valor_total,
        totalPagoValidado: reserva.total_pago_validado,
        saldoRestante: reserva.saldo_restante,
        situacaoFinanceira: reserva.situacao_financeira
    });
};

executar()
    .catch((erro) => {
        console.error('Erro:', erro.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
