const pool = require('../config/db');

const buscarPorUsuario = async (usuario) => {
    const resultado = await pool.query(
        `SELECT *
         FROM administrador
         WHERE usuario = $1`,
        [usuario]
    );

    return resultado.rows[0];
};

module.exports = {
    buscarPorUsuario
};