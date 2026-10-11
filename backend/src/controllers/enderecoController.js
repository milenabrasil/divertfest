const enderecoService = require('../services/enderecoService');

const criar = async (req, res) => {
    const {
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        complemento
    } = req.body;

    const endereco = await enderecoService.criarEndereco(
        req.clienteId,
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        complemento
    );

    return res.status(201).json(endereco);
};

const listar = async (req, res) => {
    const enderecos = await enderecoService.listarEnderecos(
        req.clienteId
    );

    return res.status(200).json(enderecos);
};

const atualizar = async (req, res) => {
    const { id } = req.params;

    const {
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        complemento
    } = req.body;

    const endereco = await enderecoService.atualizarEndereco(
        req.clienteId,
        id,
        cep,
        logradouro,
        numero,
        bairro,
        cidade,
        complemento
    );

    return res.status(200).json(endereco);
};

module.exports = {
    criar,
    listar,
    atualizar
};