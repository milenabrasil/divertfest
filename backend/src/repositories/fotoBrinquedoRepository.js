const pool = require('../config/db');

const criarFoto = async (idBrinquedo, urlFoto) => {
    const resultado = await pool.query(
        `INSERT INTO foto_brinquedo (id_brinquedo, url_foto)
         VALUES ($1, $2)
         RETURNING *`,
        [idBrinquedo, urlFoto]
    );

    return resultado.rows[0];
};

const buscarFotosPorBrinquedo = async (idBrinquedo) => {
    const resultado = await pool.query(
        `SELECT *
         FROM foto_brinquedo
         WHERE id_brinquedo = $1
         ORDER BY id`,
        [idBrinquedo]
    );

    return resultado.rows;
};

const buscarFotoPorId = async (idFoto) => {
    const resultado = await pool.query(
        `SELECT *
         FROM foto_brinquedo
         WHERE id = $1`,
        [idFoto]
    );

    return resultado.rows[0];
};

const atualizarFoto = async (idFoto, urlFoto) => {
    const resultado = await pool.query(
        `UPDATE foto_brinquedo
         SET url_foto = $1
         WHERE id = $2
         RETURNING *`,
        [urlFoto, idFoto]
    );

    return resultado.rows[0];
};

const excluirFoto = async (idFoto) => {
    const resultado = await pool.query(
        `DELETE FROM foto_brinquedo
         WHERE id = $1
         RETURNING *`,
        [idFoto]
    );

    return resultado.rows[0];
};

module.exports = {
    criarFoto,
    buscarFotosPorBrinquedo,
    buscarFotoPorId,
    atualizarFoto,
    excluirFoto
};