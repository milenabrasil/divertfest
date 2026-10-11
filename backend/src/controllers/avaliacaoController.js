
const avaliacaoService = require('../services/avaliacaoService');

const criarAvaliacao = async (req, res) => {
    const idCliente = req.clienteId;
    const { id } = req.params;
    const { nota, comentario } = req.body;

    const avaliacao = await avaliacaoService.criarAvaliacao(
        idCliente,
        id,
        nota,
        comentario
    );

    return res.status(201).json({
        mensagem: 'Avaliação cadastrada com sucesso',
        avaliacao
    });
};

const listarAvaliacoes = async (req, res) => {
    const avaliacoes = await avaliacaoService.listarAvaliacoes();

    return res.status(200).json(avaliacoes);
};

module.exports = {
    criarAvaliacao,
    listarAvaliacoes
};
