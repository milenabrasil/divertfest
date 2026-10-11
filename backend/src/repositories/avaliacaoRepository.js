
const pool = require('../config/db');

const buscarPorReserva = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT *
         FROM avaliacao
         WHERE id_reserva = $1`,
        [idReserva]
    );

    return resultado.rows[0];
};

const criarAvaliacao = async (idReserva, nota, comentario) => {
    const resultado = await pool.query(
        `INSERT INTO avaliacao (
            id_reserva,
            nota,
            comentario
         )
         VALUES ($1, $2, $3)
         RETURNING *`,
        [idReserva, nota, comentario]
    );

    return resultado.rows[0];
};

const listarAvaliacoes = async () => {
    const resultado = await pool.query(
        `SELECT
            a.id,
            a.id_reserva,
            a.nota,
            a.comentario,
            a.criado_em,
            c.nome AS nome_cliente
         FROM avaliacao a
         JOIN reserva r ON r.id = a.id_reserva
         JOIN cliente c ON c.id = r.id_cliente
         ORDER BY a.criado_em DESC`
    );

    return resultado.rows;
};

module.exports = {
    buscarPorReserva,
    criarAvaliacao,
    listarAvaliacoes
};
