const brinquedoService = require('../services/brinquedoService');

const listar = async (req, res) => {
    const brinquedos = await brinquedoService.listarBrinquedos();

    return res.status(200).json(brinquedos);
};


const listarPorId = async (req, res) => {
    const id = req.params.id
    const brinquedo = await brinquedoService.listarPorId(id)

    return res.status(200).json(brinquedo)

}

const criar = async (req, res) => {
    const {
        nome,
        preco,
        descricao,
        dimensao,
        capacidade,
        quantidade_total
    } = req.body;

    const brinquedo = await brinquedoService.criarBrinquedo(
        nome,
        preco,
        descricao,
        dimensao,
        capacidade,
        quantidade_total
    );

    return res.status(201).json(brinquedo);
};

const atualizar = async (req, res) => {
    const id = req.params.id;


    const brinquedo = await brinquedoService.atualizarBrinquedo(
        id,
        req.body
    );

    return res.status(200).json(brinquedo);
};

const alterarStatus = async (req, res) => {
    const id = req.params.id;
    const { ativo } = req.body;

    const brinquedo = await brinquedoService.alterarStatus(id, ativo);

    return res.status(200).json(brinquedo);
};

module.exports = {
    listar,
    listarPorId,
    criar,
    atualizar,
    alterarStatus
};

