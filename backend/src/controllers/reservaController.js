const reservaService = require('../services/reservaService');

const criar = async (req, res) => {
    const {
        id_endereco,
        data_inicio,
        data_fim,
        itens
    } = req.body;

    const reserva = await reservaService.criarReserva(
        req.clienteId,
        id_endereco,
        data_inicio,
        data_fim,
        itens
    );

    return res.status(201).json(reserva);
};

const listarMinhas = async (req, res) => {
    const reservas =
        await reservaService.listarMinhasReservas(
            req.clienteId
        );

    return res.status(200).json(reservas);
};

const buscarDetalhes = async (req, res) => {
    const { id } = req.params;

    const reserva = await reservaService.buscarDetalhes(
        req.clienteId,
        id
    );

    return res.status(200).json(reserva);
};


const cancelarReservaCliente = async (req, res) => {
    const { id } = req.params;
    const idCliente = req.clienteId;

    const reserva =
        await reservaService.cancelarReservaCliente(
            id,
            idCliente
        );

    return res.status(200).json({
        mensagem: 'Reserva cancelada com sucesso',
        reserva
    });
};


module.exports = {
    criar,
    listarMinhas,
    buscarDetalhes,
    cancelarReservaCliente
};