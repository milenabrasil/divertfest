
const contratoRepository = require('../repositories/contratoRepository');

const reservaRepository = require('../repositories/reservaRepository');

const AppError = require('../middlewares/AppError');

const {
    gerarDescricaoContrato
} = require('../utils/contratoTemplate');

const gerarContrato = async (idReserva) => {
    const reserva = await reservaRepository.buscarPorId(
        idReserva
    );

    if (!reserva) {
        throw new AppError(
            'Reserva não encontrada',
            404
        );
    }

    if (reserva.status !== 'AGUARDANDO_PAGAMENTO') {
        throw new AppError(
            'O contrato só pode ser gerado para uma reserva aprovada',
            409
        );
    }

    const contratoExistente =
        await contratoRepository.buscarPorReserva(
            idReserva
        );

    if (contratoExistente) {
        throw new AppError(
            'Esta reserva já possui um contrato',
            409
        );
    }

    const itens =
        await reservaRepository.buscarItensPorReserva(
            idReserva
        );

    const descricao = gerarDescricaoContrato(
        reserva,
        itens
    );

    return await contratoRepository.criarContrato(
        idReserva,
        descricao
    );
};


const visualizarContrato = async (
    idReserva,
    idCliente
) => {
    const reserva = await reservaRepository.buscarPorId(
        idReserva
    );

    if (!reserva) {
        throw new AppError(
            'Reserva não encontrada',
            404
        );
    }

    if (Number(reserva.id_cliente) !== Number(idCliente)) {
        throw new AppError(
            'Você não tem permissão para visualizar este contrato',
            403
        );
    }

    const contrato =
        await contratoRepository.buscarPorReserva(
            idReserva
        );

    if (!contrato) {
        throw new AppError(
            'Contrato não encontrado para esta reserva',
            404
        );
    }

    return contrato;
};


const aceitarContrato = async (
    idReserva,
    idCliente
) => {
    const reserva = await reservaRepository.buscarPorId(
        idReserva
    );

    if (!reserva) {
        throw new AppError(
            'Reserva não encontrada',
            404
        );
    }

    if (Number(reserva.id_cliente) !== Number(idCliente)) {
        throw new AppError(
            'Você não tem permissão para aceitar este contrato',
            403
        );
    }

    if (reserva.status !== 'AGUARDANDO_PAGAMENTO') {
        throw new AppError(
            'A reserva não está aguardando pagamento',
            409
        );
    }

    if (
        !reserva.expira_em ||
        new Date(reserva.expira_em) <= new Date()
    ) {
        throw new AppError(
            'O prazo para pagamento desta reserva expirou',
            409
        );
    }

    const contrato =
        await contratoRepository.buscarPorReserva(
            idReserva
        );

    if (!contrato) {
        throw new AppError(
            'Contrato não encontrado',
            404
        );
    }

    if (contrato.aceito) {
        throw new AppError(
            'Este contrato já foi aceito',
            409
        );
    }

    const contratoAtualizado =
        await contratoRepository.aceitarContrato(
            idReserva,
            idCliente
        );

    if (!contratoAtualizado) {
        throw new AppError(
            'Não foi possível aceitar o contrato. Verifique o prazo e o status da reserva',
            409
        );
    }

    return contratoAtualizado;
};


module.exports = {
    gerarDescricaoContrato,
    gerarContrato,
    visualizarContrato,
    aceitarContrato
};
