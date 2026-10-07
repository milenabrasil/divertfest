const fotoBrinquedoService = require('../services/fotoBrinquedoService');

const adicionar = async (req, res) => {
    const idBrinquedo = req.params.id;
    const { url_foto } = req.body;

    const foto = await fotoBrinquedoService.adicionarFoto(
        idBrinquedo,
        url_foto
    );

    return res.status(201).json(foto);
};

const listar = async (req, res) => {
    const idBrinquedo = req.params.id;

    const fotos = await fotoBrinquedoService.listarFotos(idBrinquedo);

    return res.status(200).json(fotos);
};

const atualizar = async (req, res) => {
    const { id, idFoto } = req.params;
    const { url_foto } = req.body;

    const foto = await fotoBrinquedoService.atualizarFoto(
        id,
        idFoto,
        url_foto
    );

    return res.status(200).json(foto);
};

const excluir = async (req, res) => {
    const { id, idFoto } = req.params;

    await fotoBrinquedoService.excluirFoto(id, idFoto);

    return res.status(204).send();
};

module.exports = {
    adicionar,
    listar,
    atualizar,
    excluir
};