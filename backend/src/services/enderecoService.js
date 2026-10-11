const enderecoRepository = require('../repositories/enderecoRepository');
const AppError = require('../middlewares/AppError');

const criarEndereco = async (
    idCliente,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    complemento
) => {
    if (!cep || !cep.trim()) {
        throw new AppError('O CEP é obrigatório', 400);
    }

    if (!logradouro || !logradouro.trim()) {
        throw new AppError('O logradouro é obrigatório', 400);
    }

    if (!numero || !numero.trim()) {
        throw new AppError('O número é obrigatório', 400);
    }

    if (!bairro || !bairro.trim()) {
        throw new AppError('O bairro é obrigatório', 400);
    }

    if (!cidade || !cidade.trim()) {
        throw new AppError('A cidade é obrigatória', 400);
    }

    const cepNormalizado = cep.replace(/\D/g, '');

    if (cepNormalizado.length !== 8) {
        throw new AppError('O CEP deve conter 8 dígitos', 400);
    }

    return enderecoRepository.criarEndereco(
        idCliente,
        cepNormalizado,
        logradouro.trim(),
        numero.trim(),
        bairro.trim(),
        cidade.trim(),
        complemento?.trim() || null
    );
};

const listarEnderecos = async (idCliente) => {
    return enderecoRepository.buscarPorCliente(idCliente);
};

const atualizarEndereco = async (
    idCliente,
    idEndereco,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    complemento
) => {
    const enderecoAtual =
        await enderecoRepository.buscarPorId(idEndereco);

    if (!enderecoAtual) {
        throw new AppError('Endereço não encontrado', 404);
    }

    if (enderecoAtual.id_cliente !== Number(idCliente)) {
        throw new AppError(
            'Você não tem permissão para alterar este endereço',
            403
        );
    }

    const novoCep = cep
        ? cep.replace(/\D/g, '')
        : enderecoAtual.cep;

    const novoLogradouro =
        logradouro ?? enderecoAtual.logradouro;

    const novoNumero =
        numero ?? enderecoAtual.numero;

    const novoBairro =
        bairro ?? enderecoAtual.bairro;

    const novaCidade =
        cidade ?? enderecoAtual.cidade;

    const novoComplemento =
        complemento !== undefined
            ? complemento
            : enderecoAtual.complemento;

    if (novoCep.length !== 8) {
        throw new AppError('O CEP deve conter 8 dígitos', 400);
    }

    if (!novoLogradouro.trim()) {
        throw new AppError('O logradouro não pode ficar vazio', 400);
    }

    if (!novoNumero.trim()) {
        throw new AppError('O número não pode ficar vazio', 400);
    }

    if (!novoBairro.trim()) {
        throw new AppError('O bairro não pode ficar vazio', 400);
    }

    if (!novaCidade.trim()) {
        throw new AppError('A cidade não pode ficar vazia', 400);
    }

    return enderecoRepository.atualizarEndereco(
        idEndereco,
        novoCep,
        novoLogradouro.trim(),
        novoNumero.trim(),
        novoBairro.trim(),
        novaCidade.trim(),
        novoComplemento?.trim() || null
    );
};

module.exports = {
    criarEndereco,
    listarEnderecos,
    atualizarEndereco
};