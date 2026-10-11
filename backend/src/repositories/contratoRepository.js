
const pool = require('../config/db');

const criarContrato = async (
    idReserva,
    descricao,
    client = pool
) => {
    const resultado = await client.query(
        `INSERT INTO contrato (
            id_reserva,
            descricao
        )
        VALUES ($1, $2)
        RETURNING *`,
        [idReserva, descricao]
    );

    return resultado.rows[0];
};

const buscarPorReserva = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT *
         FROM contrato
         WHERE id_reserva = $1`,
        [idReserva]
    );

    return resultado.rows[0];
};


const aceitarContrato = async (idReserva, idCliente) => {
    const resultado = await pool.query(
        `UPDATE contrato c
         SET aceito = true,
             data_aceite = NOW()
         FROM reserva r
         WHERE c.id_reserva = r.id
           AND r.id = $1
           AND r.id_cliente = $2
           AND r.status = 'AGUARDANDO_PAGAMENTO'
           AND r.expira_em > NOW()
           AND c.aceito = false
         RETURNING c.*`,
        [idReserva, idCliente]
    );

    return resultado.rows[0];
};


module.exports = {
    criarContrato,
    buscarPorReserva,
    aceitarContrato
};
