
const Stripe = require('stripe');

const pagamentoRepository = require('../src/repositories/pagamentoRepository');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Sessão do pagamento #10 da reserva #15
const SESSION_ID =
  'cs_test_a1GwVla2kmVNR4caeXrJgmLHvd8wJCzOdqRKulvsyF7dxIC9mreN0pNXOZ';

async function conciliarPagamento() {
  try {
    console.log('Consultando pagamento na Stripe...');

    const sessao = await stripe.checkout.sessions.retrieve(SESSION_ID);

    // Confirma que o pagamento foi concluído
    if (
      sessao.status !== 'complete' ||
      sessao.payment_status !== 'paid' ||
      sessao.mode !== 'payment'
    ) {
      throw new Error('A sessão não possui pagamento confirmado.');
    }

    // Somente ambiente de testes
    if (sessao.livemode !== false) {
      throw new Error('Este script aceita apenas pagamentos de teste.');
    }

    // Valida moeda e valor
    if (
      sessao.currency !== 'brl' ||
      !Number.isSafeInteger(sessao.amount_total)
    ) {
      throw new Error('Moeda ou valor inválido.');
    }

    const pagamento =
      await pagamentoRepository.buscarPorCheckoutSession(sessao.id);

    if (!pagamento) {
      throw new Error('Pagamento não encontrado no PostgreSQL.');
    }

    // Verifica os identificadores do pagamento
    if (
      Number(pagamento.id) !== 10 ||
      Number(pagamento.id_reserva) !== 15 ||
      pagamento.tipo !== 'INTEGRAL' ||
      pagamento.forma_pagamento !== 'CARTAO'
    ) {
      throw new Error('Este script é exclusivo do pagamento #10.');
    }

    // Confere os metadados enviados à Stripe
    if (
      String(sessao.metadata?.id_pagamento) !== '10' ||
      String(sessao.metadata?.id_reserva) !== '15' ||
      sessao.metadata?.tipo_pagamento !== 'INTEGRAL'
    ) {
      throw new Error('Os metadados da Stripe não correspondem ao pagamento.');
    }

    // Valor integral: R$ 1.980,00
    const valorEsperado = Math.round(Number(pagamento.valor) * 100);

    if (
      valorEsperado !== 198000 ||
      sessao.amount_total !== valorEsperado
    ) {
      throw new Error('Valor recebido diferente do esperado.');
    }

    if (
      typeof sessao.payment_intent !== 'string' ||
      !sessao.payment_intent.startsWith('pi_')
    ) {
      throw new Error('PaymentIntent inválido.');
    }

    console.log('Pagamento confirmado na Stripe.');
    console.log('Valor:', (sessao.amount_total / 100).toFixed(2));
    console.log('Iniciando conciliação...');

    const resultado =
      await pagamentoRepository.confirmarPagamentoTransacional(
        sessao.id,
        sessao.payment_intent,
        sessao.amount_total
      );

    console.log('\nConciliação concluída!');
    console.log('Pagamento:', resultado.pagamento.id);
    console.log('Status:', resultado.pagamento.status);
    console.log('Reserva confirmada:', resultado.reservaConfirmada);
    console.log('Requer análise:', resultado.requerAnalise);
    console.log('Pagamento duplicado:', resultado.duplicado);

  } catch (erro) {
    console.error('Erro na conciliação:', erro.message);
    process.exitCode = 1;
  }
}

conciliarPagamento();
