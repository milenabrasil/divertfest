const pool = require('../config/db');

// Busca somente os brinquedos ativos
// Será usado no catálogo do cliente
const buscarBrinquedo = async () => {
    const resultado = await pool.query(
        `SELECT *
         FROM brinquedo
         WHERE ativo = true
         ORDER BY id`
    );

    return resultado.rows;
};

// Busca todos os brinquedos, inclusive os inativos
// Será usado futuramente no painel do administrador
const buscarTodosBrinquedos = async () => {
    const resultado = await pool.query(
        `SELECT *
         FROM brinquedo
         ORDER BY id`
    );

    return resultado.rows;
};

const buscarBrinquedoPorId = async (id) => {
    const resultado = await pool.query(
        `SELECT *
         FROM brinquedo
         WHERE id = $1`,
        [id]
    );

    return resultado.rows[0];
};

const criarBrinquedo = async (
    nome,
    preco,
    descricao,
    dimensao,
    capacidade,
    quantidade_total
) => {
    const resultado = await pool.query(
        `INSERT INTO brinquedo
        (nome, preco, descricao, dimensao, capacidade, quantidade_total)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
            nome,
            preco,
            descricao,
            dimensao,
            capacidade,
            quantidade_total
        ]
    );

    return resultado.rows[0];
};

const atualizarBrinquedo = async (
    id,
    nome,
    preco,
    descricao,
    dimensao,
    capacidade,
    quantidade_total
) => {
    const resultado = await pool.query(
        `UPDATE brinquedo
         SET nome = $1,
             preco = $2,
             descricao = $3,
             dimensao = $4,
             capacidade = $5,
             quantidade_total = $6
         WHERE id = $7
         RETURNING *`,
        [
            nome,
            preco,
            descricao,
            dimensao,
            capacidade,
            quantidade_total,
            id
        ]
    );

    return resultado.rows[0];
};

const alterarStatus = async (id, ativo) => {
    const resultado = await pool.query(
        `UPDATE brinquedo
         SET ativo = $1
         WHERE id = $2
         RETURNING *`,
        [ativo, id]
    );

    return resultado.rows[0];
};

module.exports = {
    buscarBrinquedo,
    buscarTodosBrinquedos,
    buscarBrinquedoPorId,
    criarBrinquedo,
    atualizarBrinquedo,
    alterarStatus
};