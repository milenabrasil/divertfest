const bcrypt = require('bcrypt');

const jwt = require('jsonwebtoken');

const clienteRepository = require('../repositories/clienteRepository');
const AppError = require('../middlewares/AppError');

const criarCliente = async (
    nome,
    email,
    senha,
    telefone,
    cpf
) => {
    if (!nome || !nome.trim()) {
        throw new AppError('O nome é obrigatório', 400);
    }

    if (!email || !email.trim()) {
        throw new AppError('O e-mail é obrigatório', 400);
    }

    if (!senha || !senha.trim()) {
        throw new AppError('A senha é obrigatória', 400);
    }

    if (!telefone || !telefone.trim()) {
        throw new AppError('O telefone é obrigatório', 400);
    }

    if (!cpf || !cpf.trim()) {
        throw new AppError('O CPF é obrigatório', 400);
    }

    const emailNormalizado = email.trim().toLowerCase();
    const telefoneNormalizado = telefone.trim();
    const cpfNormalizado = cpf.trim();

    const emailExistente =
        await clienteRepository.buscarPorEmail(emailNormalizado);

    if (emailExistente) {
        throw new AppError('E-mail já cadastrado', 409);
    }

    const cpfExistente =
        await clienteRepository.buscarPorCpf(cpfNormalizado);

    if (cpfExistente) {
        throw new AppError('CPF já cadastrado', 409);
    }

    const telefoneExistente =
        await clienteRepository.buscarPorTelefone(telefoneNormalizado);

    if (telefoneExistente) {
        throw new AppError('Telefone já cadastrado', 409);
    }

    const senhaCriptografada = await bcrypt.hash(senha, 10);

    return clienteRepository.criarCliente(
        nome.trim(),
        emailNormalizado,
        senhaCriptografada,
        telefoneNormalizado,
        cpfNormalizado
    );
};

const login = async (email, senha) => {
    if (!email || !email.trim()) {
        throw new AppError('O e-mail é obrigatório', 400);
    }

    if (!senha || !senha.trim()) {
        throw new AppError('A senha é obrigatória', 400);
    }

    const emailNormalizado = email.trim().toLowerCase();

    const cliente =
        await clienteRepository.buscarPorEmail(emailNormalizado);

    if (!cliente) {
        throw new AppError('E-mail ou senha inválidos', 401);
    }

    const senhaCorreta = await bcrypt.compare(
        senha,
        cliente.senha
    );

    if (!senhaCorreta) {
        throw new AppError('E-mail ou senha inválidos', 401);
    }


    const token = jwt.sign(
        {
            id: cliente.id,
            tipo: 'cliente'
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '1d'
        }
    );


    return {
        token,
        cliente: {
            id: cliente.id,
            nome: cliente.nome,
            email: cliente.email
        }
    };
};

const buscarPerfil = async (id) => {
    const cliente = await clienteRepository.buscarPorId(id);

    if (!cliente) {
        throw new AppError('Cliente não encontrado', 404);
    }

    return {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
        cpf: cliente.cpf,
        criado_em: cliente.criado_em
    };
};

const atualizarPerfil = async (
    id,
    nome,
    email,
    telefone,
    cpf
) => {
    const clienteAtual = await clienteRepository.buscarPorId(id);

    if (!clienteAtual) {
        throw new AppError('Cliente não encontrado', 404);
    }

    const novoNome = nome ?? clienteAtual.nome;
    const novoEmail = email
        ? email.trim().toLowerCase()
        : clienteAtual.email;

    const novoTelefone = telefone
        ? telefone.replace(/\D/g, '')
        : clienteAtual.telefone;

    const novoCpf = cpf
        ? cpf.replace(/\D/g, '')
        : clienteAtual.cpf;

    if (!novoNome.trim()) {
        throw new AppError('O nome não pode ficar vazio', 400);
    }

    const clienteComEmail =
        await clienteRepository.buscarPorEmail(novoEmail);

    if (
        clienteComEmail &&
        clienteComEmail.id !== Number(id)
    ) {
        throw new AppError('E-mail já cadastrado', 409);
    }

    const clienteComTelefone =
        await clienteRepository.buscarPorTelefone(novoTelefone);

    if (
        clienteComTelefone &&
        clienteComTelefone.id !== Number(id)
    ) {
        throw new AppError('Telefone já cadastrado', 409);
    }

    const clienteComCpf =
        await clienteRepository.buscarPorCpf(novoCpf);

    if (
        clienteComCpf &&
        clienteComCpf.id !== Number(id)
    ) {
        throw new AppError('CPF já cadastrado', 409);
    }

    return clienteRepository.atualizarCliente(
        id,
        novoNome.trim(),
        novoEmail,
        novoTelefone,
        novoCpf
    );
};

module.exports = {
    criarCliente,
    login,
    buscarPerfil,
    atualizarPerfil

};