const pool = require('../config/db');

const buscarPorId = async (id) => {
    const resultado = await pool.query(
        `SELECT *
         FROM endereco
         WHERE id = $1`,
        [id]
    );

    return resultado.rows[0];
};

const buscarPorCliente = async (idCliente) => {
    const resultado = await pool.query(
        `SELECT *
         FROM endereco
         WHERE id_cliente = $1
         ORDER BY id`,
        [idCliente]
    );

    return resultado.rows;
};

const criarEndereco = async (
    idCliente,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    complemento
) => {
    const resultado = await pool.query(
        `INSERT INTO endereco
        (id_cliente, cep, logradouro, numero, bairro, cidade, complemento)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
            idCliente,
            cep,
            logradouro,
            numero,
            bairro,
            cidade,
            complemento
        ]
    );

    return resultado.rows[0];
};

const atualizarEndereco = async (
    id,
    cep,
    logradouro,
    numero,
    bairro,
    cidade,
    complemento
) => {
    const resultado = await pool.query(
        `UPDATE endereco
         SET cep = $1,
             logradouro = $2,
             numero = $3,
             bairro = $4,
             cidade = $5,
             complemento = $6
         WHERE id = $7
         RETURNING *`,
        [
            cep,
            logradouro,
            numero,
            bairro,
            cidade,
            complemento,
            id
        ]
    );

    return resultado.rows[0];
};

module.exports = {
    buscarPorId,
    buscarPorCliente,
    criarEndereco,
    atualizarEndereco
};