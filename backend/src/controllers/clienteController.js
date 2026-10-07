const clienteService = require('../services/clienteService');

const criar = async (req, res) => {
    const {
        nome,
        email,
        senha,
        telefone,
        cpf
    } = req.body;

    const cliente = await clienteService.criarCliente(
        nome,
        email,
        senha,
        telefone,
        cpf
    );

    return res.status(201).json(cliente);
};

const login = async (req, res) => {
    const { email, senha } = req.body;

    const resultado = await clienteService.login(
        email,
        senha
    );

    return res.status(200).json(resultado);
};

const buscarPerfil = async (req, res) => {
    const cliente = await clienteService.buscarPerfil(
        req.clienteId
    );

    return res.status(200).json(cliente);
};

const atualizarPerfil = async (req, res) => {
    const {
        nome,
        email,
        telefone,
        cpf
    } = req.body;

    const cliente = await clienteService.atualizarPerfil(
        req.clienteId,
        nome,
        email,
        telefone,
        cpf
    );

    return res.status(200).json(cliente);
};

module.exports = {
    criar,
    login,
    buscarPerfil,
    atualizarPerfil
};