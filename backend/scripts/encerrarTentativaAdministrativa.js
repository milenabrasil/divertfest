
const pagamentoRepository = require('../src/repositories/pagamentoRepository');
const pool = require('../src/config/db');

const ID_PAGAMENTO = 14;
const ID_RESERVA = 20;
const VALOR_ESPERADO = 175;

const MOTIVO =
    'Encerramento administrativo após investigação em 28/10/2026: ' +
    'reserva expirada; solicitações de Checkout rejeitadas pela Stripe; ' +
    'nenhuma sessão correspondente encontrada na busca histórica de ' +
    '19 a 20/10/2026; nenhuma transação de R$ 175,00 identificada ' +
    'na consulta ao Dashboard de testes.';

const executar = async () => {
    // Proteção contra execução em produção.
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
        throw new Error(
            'Operação permitida somente no ambiente de testes.'
        );
    }

    const pagamento =
        await pagamentoRepository.buscarTentativaPorId(ID_PAGAMENTO);

    if (!pagamento) {
        throw new Error('Pagamento não encontrado.');
    }

    // Confirma que estamos tratando exatamente o registro investigado.
    if (
        pagamento.id !== ID_PAGAMENTO ||
        pagamento.id_reserva !== ID_RESERVA ||
        Number(pagamento.valor) !== VALOR_ESPERADO ||
        pagamento.tipo !== 'ENTRADA' ||
        pagamento.status !== 'PENDENTE' ||
        pagamento.origem !== 'STRIPE' ||
        pagamento.status_reserva !== 'EXPIRADA' ||
        pagamento.stripe_checkout_session_id !== null ||
        pagamento.stripe_payment_intent_id !== null ||
        !pagamento.chave_idempotencia
    ) {
        throw new Error(
            'O pagamento não corresponde às condições investigadas.'
        );
    }

    console.log('Pagamento identificado:');
    console.log({
        id: pagamento.id,
        reserva: pagamento.id_reserva,
        valor: pagamento.valor,
        status: pagamento.status,
        statusReserva: pagamento.status_reserva
    });

    // Sem o argumento de confirmação, não altera o banco.
    if (process.argv[2] !== '--confirmar-14') {
        console.log(
            'SIMULAÇÃO: nenhuma alteração realizada.'
        );
        return;
    }

    const resultado =
        await pagamentoRepository.encerrarTentativaAdministrativamente(
            pagamento.id,
            pagamento.chave_idempotencia,
            MOTIVO
        );

    if (!resultado) {
        throw new Error(
            'Encerramento não realizado: as condições podem ter mudado.'
        );
    }

    console.log('Encerramento administrativo realizado:');
    console.log(resultado);
};

executar()
    .catch((erro) => {
        console.error('Erro:', erro.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
