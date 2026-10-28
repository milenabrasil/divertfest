
const Stripe = require('stripe');

const pagamentoRepository = require('../src/repositories/pagamentoRepository');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SESSION_ID =
  'cs_test_a1RHPn5rLoH0QPvTN23MA2P1hrzBrKYnigVSrZQ7S1JMmJ32c32w7dM3Fv';

async function testarDuplicidade() {
  try {
    console.log('Consultando sessão original na Stripe...');

    const sessao = await stripe.checkout.sessions.retrieve(SESSION_ID);

    if (
      sessao.livemode !== false ||
      sessao.mode !== 'payment' ||
      sessao.status !== 'complete' ||
      sessao.payment_status !== 'paid' ||
      sessao.currency !== 'brl' ||
      !Number.isInteger(sessao.amount_total)
    ) {
      throw new Error('Sessão de teste inválida ou não paga.');
    }

    const pagamento =
      await pagamentoRepository.buscarPorCheckoutSession(sessao.id);

    if (!pagamento) {
      throw new Error('Pagamento não encontrado no banco.');
    }

    if (
      Number(pagamento.id) !== 9 ||
      Number(pagamento.id_reserva) !== 14 ||
      String(sessao.metadata?.id_pagamento) !== '9' ||
      String(sessao.metadata?.id_reserva) !== '14' ||
      sessao.metadata?.tipo_pagamento !== pagamento.tipo
    ) {
      throw new Error('Dados da sessão não correspondem ao pagamento #9.');
    }

    if (
      Math.round(Number(pagamento.valor) * 100) !== sessao.amount_total ||
      typeof sessao.payment_intent !== 'string'
    ) {
      throw new Error('Valor ou PaymentIntent inválido.');
    }

    console.log('Reprocessando a confirmação já registrada...');

    const resultado =
      await pagamentoRepository.confirmarPagamentoTransacional(
        sessao.id,
        sessao.payment_intent,
        sessao.amount_total
      );

    console.log('Resultado do teste:');
    console.log('Pagamento:', resultado.pagamento.id);
    console.log('Status:', resultado.pagamento.status);
    console.log('Duplicado:', resultado.duplicado);
    console.log('Reserva confirmada:', resultado.reservaConfirmada);

    if (
      resultado.duplicado !== true ||
      resultado.pagamento.status !== 'PAGO' ||
      resultado.reservaConfirmada !== true
    ) {
      throw new Error('A proteção contra duplicidade falhou.');
    }

    console.log('TESTE APROVADO: pagamento duplicado reconhecido!');
  } catch (erro) {
    console.error('Erro no teste:', erro.message);
    process.exitCode = 1;
  }
}

testarDuplicidade();
