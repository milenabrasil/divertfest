
const reservaRepository = require('../repositories/reservaRepository');
const pagamentoRepository = require('../repositories/pagamentoRepository');
const pagamentoService = require('./pagamentoService');

const expirarReservas = async () => {
    // 1. Busca tentativas Stripe pendentes.
    const pagamentos =
        await pagamentoRepository.buscarTentativasPendentesExpiradas();

    // 2. Consulta a Stripe antes de cancelar cada tentativa.
    for (const pagamento of pagamentos) {
        try {
            // Primeiro tenta conciliar um pagamento recebido pela Stripe.
            const conciliacao =
                await pagamentoService.conciliarPagamentoPendente(
                    pagamento.id
                );

            if (conciliacao.conciliado) {
                console.log(
                    `Pagamento ${pagamento.id}: ${conciliacao.mensagem}`
                );

                continue;
            }

            // Se não foi recebido, verifica se a tentativa expirou.
            const resultado =
                await pagamentoService.recuperarTentativaExpirada(
                    pagamento.id
                );

            if (resultado.recuperado) {
                console.log(
                    `Pagamento ${pagamento.id} cancelado automaticamente`
                );
            } else {
                console.log(
                    `Pagamento ${pagamento.id}: ${resultado.mensagem}`
                );
            }
        } catch (erro) {
            console.error(
                `Erro ao verificar pagamento ${pagamento.id}:`,
                erro.message
            );
        }
    }

    // 3. Expira reservas vencidas que não possuem
    // tentativas Stripe pendentes.
    const reservas =
        await reservaRepository.expirarReservasVencidas();

    if (reservas.length > 0) {
        console.log(
            `${reservas.length} reserva(s) expirada(s) automaticamente`
        );
    }

    return reservas;
};

module.exports = {
    expirarReservas
};
