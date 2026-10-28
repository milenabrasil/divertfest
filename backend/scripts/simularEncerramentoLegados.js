
const pagamentoRepository = require('../src/repositories/pagamentoRepository');
const pool = require('../src/config/db');

const registrosEsperados = [
    {
        id: 2,
        idReserva: 2,
        tipo: 'ENTRADA',
        valor: 315,
        statusReserva: 'EXPIRADA'
    },
    {
        id: 5,
        idReserva: 1,
        tipo: 'RESTANTE',
        valor: 275,
        statusReserva: 'CONCLUIDA'
    }
];

const executar = async () => {
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
        throw new Error(
            'Simulação permitida somente no ambiente de testes.'
        );
    }

    for (const esperado of registrosEsperados) {
        const pagamento =
            await pagamentoRepository.buscarTentativaPorId(esperado.id);

        if (!pagamento) {
            throw new Error(
                `Pagamento #${esperado.id} não encontrado.`
            );
        }

        const valido =
            pagamento.id === esperado.id &&
            pagamento.id_reserva === esperado.idReserva &&
            pagamento.tipo === esperado.tipo &&
            Math.round(Number(pagamento.valor) * 100) ===
                esperado.valor * 100 &&
            pagamento.status === 'PENDENTE' &&
            pagamento.origem === 'STRIPE' &&
            pagamento.status_reserva === esperado.statusReserva &&
            pagamento.chave_idempotencia == null &&
            pagamento.stripe_checkout_session_id == null &&
            pagamento.stripe_payment_intent_id == null &&
            pagamento.data_pagamento == null &&
            pagamento.validacao_financeira === 'NAO_AVALIADO';

        console.log(`\nPagamento #${esperado.id}`);
        console.log({
            reserva: pagamento.id_reserva,
            tipo: pagamento.tipo,
            valor: pagamento.valor,
            status: pagamento.status,
            statusReserva: pagamento.status_reserva,
            condicoesAtendidas: valido
        });

        if (!valido) {
            throw new Error(
                `Pagamento #${esperado.id} não atende às condições.`
            );
        }
    }

    console.log(
        '\nSIMULAÇÃO CONCLUÍDA: nenhuma alteração realizada.'
    );
};

executar()
    .catch((erro) => {
        console.error('Erro:', erro.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
