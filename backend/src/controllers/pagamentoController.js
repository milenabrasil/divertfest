
const pagamentoService = require('../services/pagamentoService');

const criarCheckout = async (req, res, next) => {
    try {
        const idReserva = Number(req.params.idReserva);

        const { tipo } = req.body;

        if (!Number.isSafeInteger(idReserva) || idReserva <= 0) {
            return res.status(400).json({
                mensagem: 'ID da reserva inválido.'
            });
        }

        const resultado = await pagamentoService.criarCheckout(
            idReserva,
            req.clienteId,
            tipo
        );

        return res.status(200).json({
            mensagem: 'Checkout disponibilizado com sucesso.',
            ...resultado
        });
    } catch (erro) {
        next(erro);
    }
};


const listarHistoricoPorReserva = async (req, res, next) => {
    try {
        const idReserva = Number(req.params.idReserva);

        if (!Number.isSafeInteger(idReserva) || idReserva <= 0) {
            return res.status(400).json({
                mensagem: 'ID da reserva inválido.'
            });
        }

        const resultado =
            await pagamentoService.listarHistoricoPorReserva(
                idReserva,
                req.clienteId
            );

        return res.status(200).json({
            mensagem: 'Histórico de pagamentos consultado com sucesso.',
            ...resultado
        });
    } catch (erro) {
        next(erro);
    }
};


module.exports = {
    criarCheckout,
    listarHistoricoPorReserva
};