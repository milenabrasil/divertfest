
const Stripe = require('stripe');
const pool = require('../config/db');
const AppError = require('../middlewares/AppError');
const pagamentoRepository = require('../repositories/pagamentoRepository');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Busca e valida uma reserva antes do pagamento


const buscarReserva = async (idReserva, idCliente, tipo) => {
    const resultado = await pool.query(
        `SELECT
            r.id,
            r.id_cliente,
            r.valor_total,
            r.status,
            r.data_inicio,
            r.hora_inicio,
            EXTRACT(
                EPOCH FROM (
                    r.expira_em AT TIME ZONE 'America/Bahia'
                )
            )::bigint AS expira_em_unix,
            EXTRACT(

                EPOCH FROM (
                    (r.data_inicio + r.hora_inicio)
                    AT TIME ZONE 'America/Bahia'
                )
            )::bigint AS inicio_locacao_unix,
            c.aceito
         FROM reserva r
         JOIN contrato c ON c.id_reserva = r.id
         WHERE r.id = $1`,
        [idReserva]
    );

    const reserva = resultado.rows[0];

    if (!reserva) {
        throw new AppError(
            'Reserva não encontrada ou sem contrato',
            404
        );
    }

    if (reserva.id_cliente !== idCliente) {
        throw new AppError(
            'Você não tem acesso a esta reserva',
            403
        );
    }

    if (!reserva.aceito) {
        throw new AppError(
            'Aceite o contrato antes de pagar',
            400
        );
    }


    if (tipo === 'RESTANTE') {
        if (reserva.status !== 'CONFIRMADA') {
            throw new AppError(
                'O pagamento restante exige uma reserva confirmada',
                400
            );
        }

        if (reserva.inicio_locacao_unix === null) {
            throw new AppError(
                'A reserva não possui horário de início definido',
                400
            );
        }

        const agora = Math.floor(Date.now() / 1000);
        const inicioLocacao = Number(reserva.inicio_locacao_unix);

        if (
            !Number.isFinite(inicioLocacao) ||
            inicioLocacao <= agora
        ) {
            throw new AppError(
                'Não é possível pagar o restante após o início da locação',
                400
            );
        }

        return reserva;
    }


    if (reserva.status !== 'AGUARDANDO_PAGAMENTO') {
        throw new AppError(
            'Reserva não está aguardando pagamento inicial',
            400
        );
    }

    if (
        !reserva.expira_em_unix ||
        Number(reserva.expira_em_unix) <=
        Math.floor(Date.now() / 1000)
    ) {
        throw new AppError(
            'Prazo de pagamento expirado',
            400
        );
    }

    return reserva;
};


const calcularValor = (valorTotal, tipo, totalPago = 0) => {
    const totalCentavos = Math.round(Number(valorTotal) * 100);
    const pagoCentavos = Math.round(Number(totalPago) * 100);

    if (
        !Number.isSafeInteger(totalCentavos) ||
        totalCentavos <= 0
    ) {
        throw new AppError('Valor da reserva inválido', 400);
    }

    if (
        !Number.isSafeInteger(pagoCentavos) ||
        pagoCentavos < 0
    ) {
        throw new AppError('Valor pago inválido', 400);
    }

    if (tipo === 'ENTRADA') {
        return Math.round(totalCentavos / 2);
    }

    if (tipo === 'INTEGRAL') {
        return totalCentavos;
    }

    if (tipo === 'RESTANTE') {
        const saldoCentavos = totalCentavos - pagoCentavos;

        if (saldoCentavos <= 0) {
            throw new AppError(
                'Esta reserva não possui saldo pendente',
                409
            );
        }

        return saldoCentavos;
    }

    throw new AppError('Tipo de pagamento inválido', 400);
};




// Consulta uma sessão já registrada na Stripe
const consultarCheckoutPendente = async (idReserva) => {
    const pagamento =
        await pagamentoRepository.buscarPagamentoPendente(idReserva);

    if (!pagamento) {
        return null;
    }

    return pagamento;
};

// Cria ou recupera uma sessão de pagamento
const criarCheckout = async (
    idReserva,
    idCliente,
    tipo,
) => {

    if (!['INTEGRAL', 'ENTRADA', 'RESTANTE'].includes(tipo)) {
        throw new AppError('Tipo de pagamento inválido', 400);
    }

    // 1. Valida a reserva e o contrato
    const reserva = await buscarReserva(idReserva, idCliente, tipo);

    const resumoFinanceiro =
        await pagamentoRepository.calcularTotalPago(reserva.id);

    if (Number(resumoFinanceiro.total_nao_validado) > 0) {
        throw new AppError(
            'Esta reserva possui pagamentos recebidos que precisam de análise antes de uma nova cobrança.',
            409
        );
    }

    const totalPago = Number(resumoFinanceiro.total_validado);

    if (tipo !== 'RESTANTE' && totalPago > 0) {
        throw new AppError(
            'Esta reserva já possui pagamento validado.',
            409
        );
    }


    const valorCentavos = calcularValor(
        reserva.valor_total,
        tipo,
        totalPago
    );

    const valor = (valorCentavos / 100).toFixed(2);

    // 3. Procura uma tentativa já existente
    let pagamento =
        await consultarCheckoutPendente(reserva.id);

    if (pagamento) {

        const tentativaValida =
            await pagamentoRepository.validarTentativaPendente(
                pagamento.id
            );

        if (!tentativaValida) {
            throw new AppError(
                'Esta tentativa de pagamento não pode mais ser reutilizada. Verifique a situação da reserva.',
                409
            );
        }

        if (pagamento.tipo !== tipo) {
            throw new AppError(
                'Já existe uma tentativa pendente com outro tipo de pagamento.',
                409
            );
        }

        if (Math.round(Number(pagamento.valor) * 100) !== valorCentavos) {
            throw new AppError(
                'O valor da tentativa pendente não corresponde ao valor atual da reserva.',
                409
            );
        }

        if (!pagamento.chave_idempotencia) {
            throw new AppError(
                'Tentativa antiga sem chave de idempotência. É necessário verificar esse pagamento.',
                409
            );
        }
    } else {
        // 4. Registra a tentativa antes de chamar a Stripe
        pagamento = await pagamentoRepository.iniciarTentativa({
            idReserva: reserva.id,
            valor,
            tipo
        });

        // Outra requisição pode ter criado a tentativa primeiro
        if (!pagamento) {
            throw new AppError(
                'Já existe uma tentativa de pagamento em andamento. Tente novamente em instantes.',
                409
            );
        }
    }

    // 5. Recupera uma sessão Stripe já vinculada
    if (pagamento.stripe_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(
            pagamento.stripe_checkout_session_id
        );


        if (tipo === 'RESTANTE') {
            const inicioLocacao = Number(reserva.inicio_locacao_unix);
            const vencimentoSessao = Number(session.expires_at);

            if (
                !Number.isFinite(inicioLocacao) ||
                !Number.isFinite(vencimentoSessao) ||
                vencimentoSessao > inicioLocacao
            ) {
                throw new AppError(
                    'A sessão existente ultrapassa o início da locação e precisa ser revisada.',
                    409
                );
            }
        }


        if (
            session.status !== 'open' ||
            session.payment_status === 'paid'
        ) {
            throw new AppError(
                'Esta tentativa de pagamento precisa ser verificada antes de iniciar outra.',
                409
            );
        }

        if (
            Number(session.expires_at) <=
            Math.floor(Date.now() / 1000)
        ) {
            throw new AppError(
                'A sessão de pagamento já venceu.',
                409
            );
        }

        return {
            checkoutSessionId: session.id,
            url: session.url,
            valor
        };
    }




    if (!pagamento.stripe_checkout_session_id) {
        const idadeSegundos =
            await pagamentoRepository.buscarIdadeTentativa(
                pagamento.id
            );

        const limiteRecuperacao = 23 * 60 * 60;

        if (
            idadeSegundos === null ||
            !Number.isFinite(idadeSegundos) ||
            idadeSegundos < 0 ||
            idadeSegundos >= limiteRecuperacao
        ) {
            throw new AppError(
                'Esta tentativa de pagamento precisa de reconciliação antes de uma nova cobrança.',
                409
            );
        }
    }


    // 6. Confere o tempo restante


    const agora = Math.floor(Date.now() / 1000);

    const vencimento = Number(
        pagamento.stripe_checkout_expira_em
    );

    // Não reutilizamos uma chave antiga sem conhecer
    // os parâmetros originais enviados à Stripe.
    if (
        pagamento.stripe_checkout_expira_em == null ||
        !Number.isSafeInteger(vencimento)
    ) {
        throw new AppError(
            'Tentativa de pagamento sem vencimento registrado. É necessária uma reconciliação antes de continuar.',
            409
        );
    }

    // Uma sessão nova exige pelo menos 30 minutos
    // de validade no momento da solicitação.
    if (vencimento - agora < 30 * 60) {
        throw new AppError(
            'O prazo desta tentativa não permite criar uma nova sessão de pagamento.',
            409
        );
    }

    if (
        tipo === 'RESTANTE' &&
        vencimento > Number(reserva.inicio_locacao_unix)
    ) {
        throw new AppError(
            'O vencimento do Checkout ultrapassa o início da locação.',
            409
        );
    }



    // 7. Cria ou recupera a sessão usando a mesma chave
    let session;
    try {
        session = await stripe.checkout.sessions.create(
            {

                mode: 'payment',
                expires_at: vencimento,


                line_items: [
                    {
                        price_data: {
                            currency: 'brl',
                            product_data: {
                                name: `Reserva DivertFest #${reserva.id}`
                            },
                            unit_amount: valorCentavos
                        },
                        quantity: 1
                    }
                ],

                metadata: {
                    id_reserva: String(reserva.id),
                    id_pagamento: String(pagamento.id),
                    tipo_pagamento: tipo
                },

                success_url:
                    `${process.env.FRONTEND_URL}/pagamento/sucesso?session_id={CHECKOUT_SESSION_ID}`,

                cancel_url:
                    `${process.env.FRONTEND_URL}/pagamento/cancelado`
            },
            {
                idempotencyKey: pagamento.chave_idempotencia
            }
        );
    } catch (erro) {
        const rejeicaoDefinitiva =
            erro.type === 'StripeInvalidRequestError' &&
            erro.param === 'payment_method_types';

        if (rejeicaoDefinitiva) {
            await pagamentoRepository.cancelarTentativaSemSessao(
                pagamento.id,
                pagamento.chave_idempotencia
            );
        }

        throw erro;
    }


    // 8. Vincula a sessão à tentativa registrada
    const pagamentoAtualizado =
        await pagamentoRepository.associarCheckoutSession(
            pagamento.id,
            session.id
        );

    if (!pagamentoAtualizado) {
        throw new AppError(
            'Não foi possível associar a sessão Stripe ao pagamento.',
            409
        );
    }

    return {
        checkoutSessionId: session.id,
        url: session.url,
        valor
    };
};


const investigarSessaoNaoVinculada = async (idPagamento, periodo = {}) => {
    const pagamento =
        await pagamentoRepository.buscarTentativaPorId(idPagamento);

    if (!pagamento) {
        throw new AppError('Pagamento não encontrado.', 404);
    }

    if (pagamento.origem !== 'STRIPE') {
        throw new AppError(
            'Este pagamento não pertence à Stripe.',
            400
        );
    }

    if (pagamento.stripe_checkout_session_id) {
        return {
            encontrada: true,
            sessionId: pagamento.stripe_checkout_session_id,
            mensagem: 'O pagamento já possui uma sessão vinculada.'
        };
    }

    // Consulta sessões recentes na Stripe.
    // A listagem é paginada, por isso não devemos
    // interpretar uma busca incompleta como ausência.


    const correspondentes = [];

    const agora = Math.floor(Date.now() / 1000);

    // Por padrão, investiga as últimas 24 horas.
    const limiteInferior = periodo.inicio
        ? Math.floor(new Date(periodo.inicio).getTime() / 1000)
        : agora - 24 * 60 * 60;

    const limiteSuperior = periodo.fim
        ? Math.floor(new Date(periodo.fim).getTime() / 1000)
        : agora;

    if (
        !Number.isSafeInteger(limiteInferior) ||
        !Number.isSafeInteger(limiteSuperior) ||
        limiteInferior >= limiteSuperior ||
        limiteSuperior > agora
    ) {
        throw new AppError(
            'Período de investigação inválido.',
            400
        );
    }

    let ultimoId = null;
    let buscaCompleta = false;
    let paginasConsultadas = 0;

    const maximoPaginas = 20;

    while (paginasConsultadas < maximoPaginas) {
        const parametros = {
            limit: 100,
            created: {
                gte: limiteInferior,
                lte: limiteSuperior
            }
        };

        if (ultimoId) {
            parametros.starting_after = ultimoId;
        }

        const resultado = await stripe.checkout.sessions.list(
            parametros
        );

        paginasConsultadas++;

        for (const session of resultado.data) {
            if (
                session.metadata?.id_pagamento === String(pagamento.id) &&
                session.metadata?.id_reserva === String(pagamento.id_reserva) &&
                session.metadata?.tipo_pagamento === pagamento.tipo
            ) {
                correspondentes.push({
                    id: session.id,
                    status: session.status,
                    paymentStatus: session.payment_status,
                    expiresAt: session.expires_at
                });
            }
        }

        if (!resultado.has_more) {
            buscaCompleta = true;
            break;
        }

        if (resultado.data.length === 0) {
            break;
        }

        ultimoId = resultado.data[resultado.data.length - 1].id;
    }

    return {
        encontrada: correspondentes.length > 0,
        buscaCompleta,
        paginasConsultadas,
        periodoConsultado: {
            inicio: new Date(limiteInferior * 1000).toISOString(),
            fim: new Date(limiteSuperior * 1000).toISOString()
        },
        sessoes: correspondentes,
        mensagem: correspondentes.length > 0
            ? 'Foram encontradas sessões para investigação.'
            : buscaCompleta
                ? 'Nenhuma sessão correspondente foi encontrada no período consultado.'
                : 'Busca incompleta. Não é possível descartar a existência de uma sessão.'
    };


};




const verificarTentativaExpirada = async (idPagamento) => {
    const pagamento =
        await pagamentoRepository.buscarTentativaPorId(idPagamento);

    if (!pagamento) {
        throw new AppError('Pagamento não encontrado', 404);
    }

    if (pagamento.status !== 'PENDENTE') {
        return {
            podeCancelar: false,
            motivo: 'O pagamento não está pendente.'
        };
    }

    if (!pagamento.stripe_checkout_session_id) {
        return {
            podeCancelar: false,
            motivo: 'A tentativa ainda não possui sessão Stripe vinculada.'
        };
    }

    const session = await stripe.checkout.sessions.retrieve(
        pagamento.stripe_checkout_session_id
    );

    // Nunca cancelar uma sessão com pagamento recebido.
    if (session.payment_status === 'paid') {
        return {
            podeCancelar: false,
            motivo: 'O pagamento já foi recebido pela Stripe.'
        };
    }

    // Uma sessão concluída pode ter pagamento assíncrono
    // ainda em processamento.
    if (session.status === 'complete') {
        return {
            podeCancelar: false,
            motivo: 'Checkout concluído. Aguardando confirmação do pagamento.'
        };
    }

    if (
        session.status === 'expired' &&
        session.payment_status === 'unpaid'
    ) {
        return {
            podeCancelar: true,
            motivo: 'Sessão expirada e sem pagamento confirmado.'
        };
    }

    return {
        podeCancelar: false,
        motivo: 'A sessão ainda não pode ser cancelada.'
    };
};


const recuperarTentativaExpirada = async (idPagamento) => {
    const pagamento =
        await pagamentoRepository.buscarTentativaPorId(idPagamento);

    if (!pagamento) {
        throw new AppError('Pagamento não encontrado', 404);
    }

    // Consulta a Stripe antes de qualquer alteração
    const verificacao =
        await verificarTentativaExpirada(idPagamento);

    if (!verificacao.podeCancelar) {
        return {
            recuperado: false,
            mensagem: verificacao.motivo
        };
    }

    // A sessão foi identificada como expirada na Stripe
    const pagamentoCancelado =
        await pagamentoRepository.cancelarTentativaExpirada(
            pagamento.id,
            pagamento.stripe_checkout_session_id
        );

    if (!pagamentoCancelado) {
        return {
            recuperado: false,
            mensagem: 'A tentativa já foi alterada por outra operação.'
        };
    }

    return {
        recuperado: true,
        mensagem: 'Tentativa expirada cancelada no banco de dados.'
    };
};

// Consulta a Stripe para identificar pagamentos pendentes
// que já foram recebidos, mas ainda não foram conciliados.
const conciliarPagamentoPendente = async (idPagamento) => {
    const pagamento =
        await pagamentoRepository.buscarTentativaPorId(idPagamento);

    if (!pagamento) {
        throw new AppError('Pagamento não encontrado', 404);
    }

    if (
        pagamento.origem !== 'STRIPE' ||
        pagamento.status !== 'PENDENTE'
    ) {
        return {
            conciliado: false,
            mensagem: 'Pagamento não está pendente na Stripe.'
        };
    }

    if (!pagamento.stripe_checkout_session_id) {
        return {
            conciliado: false,
            mensagem: 'Pagamento sem sessão Stripe vinculada.'
        };
    }

    const session = await stripe.checkout.sessions.retrieve(
        pagamento.stripe_checkout_session_id
    );

    if (
        session.status !== 'complete' ||
        session.payment_status !== 'paid'
    ) {
        return {
            conciliado: false,
            mensagem: 'Pagamento ainda não confirmado pela Stripe.'
        };
    }

    // Confere se a sessão corresponde ao pagamento registrado.
    const valorEsperado = Math.round(Number(pagamento.valor) * 100);

    const metadata = session.metadata || {};

    const dadosValidos =
        session.mode === 'payment' &&
        session.currency === 'brl' &&
        Number.isInteger(session.amount_total) &&
        session.amount_total === valorEsperado &&
        metadata.id_pagamento === String(pagamento.id) &&
        metadata.id_reserva === String(pagamento.id_reserva) &&
        metadata.tipo_pagamento === pagamento.tipo &&
        typeof session.payment_intent === 'string' &&
        session.payment_intent.startsWith('pi_');

    if (!dadosValidos) {
        throw new AppError(
            'Dados da sessão Stripe não correspondem ao pagamento registrado.',
            409
        );
    }

    // Consulta o PaymentIntent diretamente na Stripe.
    const paymentIntent = await stripe.paymentIntents.retrieve(
        session.payment_intent
    );

    const paymentIntentValido =
        paymentIntent.id === session.payment_intent &&
        paymentIntent.status === 'succeeded' &&
        paymentIntent.currency === 'brl' &&
        paymentIntent.amount === valorEsperado &&
        paymentIntent.amount_received === valorEsperado;

    if (!paymentIntentValido) {
        throw new AppError(
            'PaymentIntent não corresponde ao pagamento confirmado.',
            409
        );
    }

    // Identifica a forma de pagamento utilizada na Stripe.
    const metodoUtilizado = paymentIntent.payment_method
        ? await stripe.paymentMethods.retrieve(
            paymentIntent.payment_method
        )
        : null;

    if (!metodoUtilizado) {
        throw new AppError(
            'Não foi possível identificar a forma de pagamento utilizada.',
            409
        );
    }

    const formaPagamento =
        metodoUtilizado.type === 'pix'
            ? 'PIX'
            : metodoUtilizado.type === 'card'
                ? 'CARTAO'
                : null;

    if (!formaPagamento) {
        throw new AppError(
            'Forma de pagamento não suportada pelo DivertFest.',
            409
        );
    }

    // Registra o pagamento usando a mesma transação do webhook.
    const resultado =
        await pagamentoRepository.confirmarPagamentoTransacional(
            session.id,
            paymentIntent.id,
            session.amount_total,
            formaPagamento
        );

    return {
        conciliado: true,
        duplicado: resultado.duplicado,
        pagamentoRecebido: true,
        pagamentoValidado: resultado.pagamentoValidado,
        requerAnalise: resultado.requerAnalise,
        mensagem: resultado.duplicado
            ? 'Pagamento já havia sido processado pelo webhook.'
            : resultado.requerAnalise
                ? 'Pagamento registrado e encaminhado para análise financeira.'
                : 'Pagamento conciliado com sucesso.'
    };
};


const listarHistoricoPorReserva = async (idReserva, idCliente) => {
    const resultado = await pool.query(
        `SELECT id, id_cliente
         FROM reserva
         WHERE id = $1`,
        [idReserva]
    );

    const reserva = resultado.rows[0];

    if (!reserva) {
        throw new AppError('Reserva não encontrada.', 404);
    }

    if (Number(reserva.id_cliente) !== Number(idCliente)) {
        throw new AppError(
            'Você não tem acesso aos pagamentos desta reserva.',
            403
        );
    }

    const pagamentos =
        await pagamentoRepository.buscarHistoricoPorReserva(idReserva);

    return {
        id_reserva: reserva.id,
        pagamentos
    };
};


module.exports = {
    criarCheckout,
    investigarSessaoNaoVinculada,
    consultarCheckoutPendente,
    verificarTentativaExpirada,
    recuperarTentativaExpirada,
    conciliarPagamentoPendente,
    listarHistoricoPorReserva
};
