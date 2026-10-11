
const contratoService = require('../services/contratoService');

const visualizarContrato = async (req, res) => {
    const { id } = req.params;
    const idCliente = req.clienteId;

    const contrato =
        await contratoService.visualizarContrato(
            id,
            idCliente
        );

    return res.status(200).json(contrato);
};


const aceitarContrato = async (req, res) => {
    const { id } = req.params;
    const idCliente = req.clienteId;

    const contrato =
        await contratoService.aceitarContrato(
            id,
            idCliente
        );

    return res.status(200).json({
        mensagem: 'Contrato aceito com sucesso',
        contrato
    });
};


module.exports = {
    visualizarContrato,
    aceitarContrato
};
