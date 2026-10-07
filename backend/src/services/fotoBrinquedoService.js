const fotoBrinquedoRepository = require('../repositories/fotoBrinquedoRepository');
const brinquedoRepository = require('../repositories/brinquedoRepository');
const AppError = require('../middlewares/AppError');

const adicionarFoto = async (idBrinquedo, urlFoto) => {
    const brinquedo =
        await brinquedoRepository.buscarBrinquedoPorId(idBrinquedo);

    if (!brinquedo) {
        throw new AppError('Brinquedo não encontrado', 404);
    }

    if (!urlFoto || !urlFoto.trim()) {
        throw new AppError('A URL da foto é obrigatória', 400);
    }

    return fotoBrinquedoRepository.criarFoto(
        idBrinquedo,
        urlFoto.trim()
    );
};

const listarFotos = async (idBrinquedo) => {
    const brinquedo =
        await brinquedoRepository.buscarBrinquedoPorId(idBrinquedo);

    if (!brinquedo) {
        throw new AppError('Brinquedo não encontrado', 404);
    }

    return fotoBrinquedoRepository.buscarFotosPorBrinquedo(idBrinquedo);
};

const atualizarFoto = async (idBrinquedo, idFoto, urlFoto) => {
    const brinquedo =
        await brinquedoRepository.buscarBrinquedoPorId(idBrinquedo);

    if (!brinquedo) {
        throw new AppError('Brinquedo não encontrado', 404);
    }

    const foto =
        await fotoBrinquedoRepository.buscarFotoPorId(idFoto);

    if (!foto || foto.id_brinquedo !== Number(idBrinquedo)) {
        throw new AppError('Foto não encontrada para este brinquedo', 404);
    }

    if (!urlFoto || !urlFoto.trim()) {
        throw new AppError('A URL da foto é obrigatória', 400);
    }

    return fotoBrinquedoRepository.atualizarFoto(
        idFoto,
        urlFoto.trim()
    );
};

const excluirFoto = async (idBrinquedo, idFoto) => {
    const brinquedo =
        await brinquedoRepository.buscarBrinquedoPorId(idBrinquedo);

    if (!brinquedo) {
        throw new AppError('Brinquedo não encontrado', 404);
    }

    const foto =
        await fotoBrinquedoRepository.buscarFotoPorId(idFoto);

    if (!foto || foto.id_brinquedo !== Number(idBrinquedo)) {
        throw new AppError('Foto não encontrada para este brinquedo', 404);
    }

    return fotoBrinquedoRepository.excluirFoto(idFoto);
};

module.exports = {
    adicionarFoto,
    listarFotos,
    atualizarFoto,
    excluirFoto
};