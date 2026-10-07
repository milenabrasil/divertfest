const brinquedoRepository = require('../repositories/brinquedoRepository');
const AppError = require('../middlewares/AppError');
const fotoBrinquedoRepository = require('../repositories/fotoBrinquedoRepository');

const listarBrinquedos = async () => {
    const resultado = await brinquedoRepository.buscarBrinquedo();
    return resultado;
};

const listarPorId = async (id) => {
    const brinquedo = await brinquedoRepository.buscarBrinquedoPorId(id);

    if (!brinquedo) {
        throw new AppError('Brinquedo não encontrado', 404);
    }

    const fotos =
        await fotoBrinquedoRepository.buscarFotosPorBrinquedo(id);

    return {
        ...brinquedo,
        fotos
    };
};

const criarBrinquedo = async (
    nome,
    preco,
    descricao,
    dimensao,
    capacidade,
    quantidade_total
) => {
    if (!nome || !nome.trim()) {
        throw new AppError('O nome do brinquedo é obrigatório', 400);
    }

    if (preco === undefined || preco === null) {
        throw new AppError('O preço do brinquedo é obrigatório', 400);
    }

    if (Number(preco) < 0) {
        throw new AppError('O preço não pode ser negativo', 400);
    }

    if (quantidade_total === undefined || quantidade_total === null) {
        throw new AppError('A quantidade total é obrigatória', 400);
    }

    if (Number(quantidade_total) <= 0) {
        throw new AppError('A quantidade total deve ser maior que zero', 400);
    }

    if (
        capacidade !== undefined &&
        capacidade !== null &&
        Number(capacidade) <= 0
    ) {
        throw new AppError('A capacidade deve ser maior que zero', 400);
    }

    const brinquedo = await brinquedoRepository.criarBrinquedo(
        nome.trim(),
        preco,
        descricao,
        dimensao,
        capacidade,
        quantidade_total
    );

    return brinquedo;
};

const atualizarBrinquedo = async (id, dados) => {
    const brinquedoAtual = await brinquedoRepository.buscarBrinquedoPorId(id);

    if (!brinquedoAtual) {
        throw new AppError('Brinquedo não encontrado', 404);
    }

    //O que nao foi alterado continua a mesma coisa
    const nome = dados.nome ?? brinquedoAtual.nome;
    const preco = dados.preco ?? brinquedoAtual.preco;
    const descricao = dados.descricao ?? brinquedoAtual.descricao;
    const dimensao = dados.dimensao ?? brinquedoAtual.dimensao;
    const capacidade = dados.capacidade ?? brinquedoAtual.capacidade;
    const quantidade_total =
        dados.quantidade_total ?? brinquedoAtual.quantidade_total;

    if (!nome || !nome.trim()) {
        throw new AppError('O nome do brinquedo é obrigatório', 400);
    }

    if (Number(preco) < 0) {
        throw new AppError('O preço não pode ser negativo', 400);
    }

    if (Number(quantidade_total) <= 0) {
        throw new AppError(
            'A quantidade total deve ser maior que zero',
            400
        );
    }

    if (
        capacidade !== null &&
        capacidade !== undefined &&
        Number(capacidade) <= 0
    ) {
        throw new AppError(
            'A capacidade deve ser maior que zero',
            400
        );
    }

    return brinquedoRepository.atualizarBrinquedo(
        id,
        nome.trim(),
        preco,
        descricao,
        dimensao,
        capacidade,
        quantidade_total
    );
};

//desativar o brinquedo
const alterarStatus = async (id, ativo) => {
    const brinquedo = await brinquedoRepository.buscarBrinquedoPorId(id);

    if (!brinquedo) {
        throw new AppError('Brinquedo não encontrado', 404);
    }

    if (typeof ativo !== 'boolean') {
        throw new AppError(
            'O campo ativo deve ser verdadeiro ou falso',
            400
        );
    }

    return brinquedoRepository.alterarStatus(id, ativo);
};

module.exports = {
    listarBrinquedos,
    listarPorId,
    criarBrinquedo,
    atualizarBrinquedo,
    alterarStatus
};