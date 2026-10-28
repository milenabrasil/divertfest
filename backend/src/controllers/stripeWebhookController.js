
const Stripe = require('stripe');

const pagamentoRepository = require(
    '../repositories/pagamentoRepository'
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const receberWebhook = async (req, res) => {
    const assinatura = req.headers['stripe-signature'];

    if (!assinatura) {
        return res.status(400).json({
            mensagem: 'Assinatura Stripe não encontrada.'
        });
    }

    let evento;

    try {
        evento = stripe.webhooks.constructEvent(
            req.body,
            assinatura,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (erro) {
        console.error(
            'Falha na verificação do webhook:',
            erro.message
        );

        return res.status(400).json({
            mensagem: 'Assinatura do webhook inválida.'
        });
    }

    try {
        switch (evento.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
                const sessao = evento.data.object;

                // Checkout concluído não significa,
                // necessariamente, pagamento recebido.
                if (sessao.payment_status !== 'paid') {
                    console.log(
                        'Checkout ainda não pago:',
                        sessao.id
                    );
                    break;
                }

                // Confere se a sessão existe no banco.
                const pagamento =
                    await pagamentoRepository
                        .buscarPorCheckoutSession(sessao.id);

                if (!pagamento) {
                    console.warn(
                        'Sessão não encontrada no banco:',
                        sessao.id
                    );

                    // Não confirma uma sessão desconhecida.
                    // Retornamos erro para permitir nova tentativa.
                    return res.status(500).json({
                        mensagem: 'Sessão não localizada.'
                    });
                }

                if (
                    sessao.mode !== 'payment' ||
                    sessao.currency !== 'brl' ||
                    !Number.isInteger(sessao.amount_total) ||
                    sessao.amount_total <= 0
                ) {
                    throw new Error(
                        'Dados financeiros da sessão Stripe inválidos.'
                    );
                }

                if (
                    String(sessao.metadata?.id_pagamento) !==
                    String(pagamento.id) ||
                    String(sessao.metadata?.id_reserva) !==
                    String(pagamento.id_reserva) ||
                    sessao.metadata?.tipo_pagamento !== pagamento.tipo
                ) {
                    throw new Error(
                        'Metadados da sessão não correspondem ao pagamento.'
                    );
                }

                if (
                    typeof sessao.payment_intent !== 'string' ||
                    !sessao.payment_intent.startsWith('pi_')
                ) {
                    throw new Error(
                        'PaymentIntent inválido na sessão Stripe.'
                    );
                }

                // Consulta o PaymentIntent diretamente na Stripe.
                const paymentIntent = await stripe.paymentIntents.retrieve(
                    sessao.payment_intent
                );

                // Confere se a Stripe realmente recebeu o valor esperado.
                const valorEsperado = Math.round(
                    Number(pagamento.valor) * 100
                );

                const pagamentoConfirmado =
                    paymentIntent.id === sessao.payment_intent &&
                    paymentIntent.status === 'succeeded' &&
                    paymentIntent.currency === 'brl' &&
                    paymentIntent.amount === valorEsperado &&
                    paymentIntent.amount_received === valorEsperado &&
                    sessao.amount_total === valorEsperado;

                if (!pagamentoConfirmado) {
                    throw new Error(
                        'PaymentIntent não corresponde ao pagamento confirmado.'
                    );
                }

                // Identifica o método realmente utilizado.
                if (
                    typeof paymentIntent.payment_method !== 'string'
                ) {
                    throw new Error(
                        'PaymentIntent sem forma de pagamento identificável.'
                    );
                }

                const metodoUtilizado = await stripe.paymentMethods.retrieve(
                    paymentIntent.payment_method
                );

                const formaPagamento =
                    metodoUtilizado.type === 'pix'
                        ? 'PIX'
                        : metodoUtilizado.type === 'card'
                            ? 'CARTAO'
                            : null;

                if (!formaPagamento) {
                    throw new Error(
                        'Forma de pagamento não suportada pelo DivertFest.'
                    );
                }

                // Registra o pagamento na mesma transação utilizada
                // pela conciliação.
                const resultado =
                    await pagamentoRepository.confirmarPagamentoTransacional(
                        sessao.id,
                        paymentIntent.id,
                        sessao.amount_total,
                        formaPagamento
                    );


                if (resultado.requerAnalise) {
                    console.warn(
                        'Pagamento recebido e encaminhado para análise:',
                        pagamento.id,
                        'Reserva:',
                        pagamento.id_reserva
                    );
                } else if (resultado.duplicado) {
                    console.log(
                        'Pagamento já processado e validado:',
                        pagamento.id
                    );
                } else if (resultado.pagamentoValidado) {
                    console.log(
                        'Pagamento recebido e validado:',
                        pagamento.id,
                        'Reserva:',
                        pagamento.id_reserva
                    );
                }

                break;
            }



            case 'checkout.session.async_payment_failed': {
                const sessao = evento.data.object;

                const pagamento =
                    await pagamentoRepository.buscarPorCheckoutSession(
                        sessao.id
                    );

                if (!pagamento) {
                    throw new Error(
                        'Pagamento não encontrado para a sessão com falha.'
                    );
                }

                if (
                    sessao.mode !== 'payment' ||
                    sessao.currency !== 'brl' ||
                    sessao.payment_status !== 'unpaid' ||
                    !Number.isInteger(sessao.amount_total) ||
                    sessao.amount_total <= 0
                ) {
                    throw new Error(
                        'Dados inválidos na sessão de pagamento com falha.'
                    );
                }

                if (
                    String(sessao.metadata?.id_pagamento) !==
                    String(pagamento.id) ||
                    String(sessao.metadata?.id_reserva) !==
                    String(pagamento.id_reserva) ||
                    sessao.metadata?.tipo_pagamento !== pagamento.tipo
                ) {
                    throw new Error(
                        'Metadados da sessão com falha não correspondem ao pagamento.'
                    );
                }


                const valorRegistradoCentavos = Math.round(
                    Number(pagamento.valor) * 100
                );

                if (
                    !Number.isSafeInteger(valorRegistradoCentavos) ||
                    valorRegistradoCentavos <= 0 ||
                    sessao.amount_total !== valorRegistradoCentavos
                ) {
                    throw new Error(
                        'Valor da sessão com falha não corresponde ao pagamento registrado.'
                    );
                }


                const sessaoAtual = await stripe.checkout.sessions.retrieve(
                    sessao.id
                );

                if (
                    sessaoAtual.payment_status === 'paid' ||
                    sessaoAtual.status !== 'complete'
                ) {
                    throw new Error(
                        'Estado atual da sessão não permite registrar falha assíncrona.'
                    );
                }


                if (
                    typeof sessao.payment_intent !== 'string' ||
                    !sessao.payment_intent.startsWith('pi_') ||
                    sessaoAtual.payment_intent !== sessao.payment_intent ||
                    (
                        pagamento.stripe_payment_intent_id &&
                        pagamento.stripe_payment_intent_id !== sessao.payment_intent
                    )
                ) {
                    throw new Error(
                        'PaymentIntent da falha não corresponde à tentativa registrada.'
                    );
                }


                const paymentIntentAtual = await stripe.paymentIntents.retrieve(
                    sessao.payment_intent
                );

                if (paymentIntentAtual.status === 'succeeded') {
                    throw new Error(
                        'O pagamento já foi recebido pela Stripe e não pode ser marcado como falha.'
                    );
                }

                if (paymentIntentAtual.status === 'processing') {
                    throw new Error(
                        'O pagamento ainda está em processamento na Stripe.'
                    );
                }


                if (
                    !['requires_payment_method', 'canceled'].includes(
                        paymentIntentAtual.status
                    )
                ) {
                    throw new Error(
                        'O estado atual do PaymentIntent exige análise antes de registrar a falha.'
                    );
                }





                console.warn(
                    'Falha assíncrona identificada e vinculada ao pagamento:',
                    pagamento.id
                );


                const pagamentoComFalha =
                    await pagamentoRepository.cancelarTentativaComFalha(
                        pagamento.id,
                        sessao.id
                    );

                if (pagamentoComFalha) {
                    console.log(
                        'Tentativa de pagamento marcada como FALHOU:',
                        pagamentoComFalha.id
                    );
                } else {
                    console.log(
                        'Tentativa não alterada. O pagamento pode já ter sido processado:',
                        pagamento.id
                    );
                }


                break;
            }



            case 'checkout.session.expired':
                console.log(
                    'Checkout expirado:',
                    evento.data.object.id
                );
                break;

            default:
                console.log(
                    'Evento Stripe recebido:',
                    evento.type
                );
        }

        return res.status(200).json({
            recebido: true
        });

    } catch (erro) {
        console.error(
            'Erro ao processar webhook:',
            erro
        );

        return res.status(500).json({
            mensagem: 'Erro ao processar evento Stripe.'
        });
    }
};

module.exports = {
    receberWebhook
};
