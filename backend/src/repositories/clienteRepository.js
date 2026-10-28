const pool = require('../config/db');

const buscarPorId = async (id) => {
    const resultado = await pool.query(
        `SELECT *
         FROM cliente
         WHERE id = $1`,
        [id]
    );

    return resultado.rows[0];
};

const buscarPorEmail = async (email) => {
    const resultado = await pool.query(
        `SELECT *
         FROM cliente
         WHERE email = $1`,
        [email]
    );

    return resultado.rows[0];
};

const buscarPorCpf = async (cpf) => {
    const resultado = await pool.query(
        `SELECT *
         FROM cliente
         WHERE cpf = $1`,
        [cpf]
    );

    return resultado.rows[0];
};

const buscarPorTelefone = async (telefone) => {
    const resultado = await pool.query(
        `SELECT *
         FROM cliente
         WHERE telefone = $1`,
        [telefone]
    );

    return resultado.rows[0];
};

const criarCliente = async (
    nome,
    email,
    senha,
    telefone,
    cpf
) => {
    const resultado = await pool.query(
        `INSERT INTO cliente
        (nome, email, senha, telefone, cpf)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, nome, email, telefone, cpf, criado_em`,
        [nome, email, senha, telefone, cpf]
    );

    return resultado.rows[0];
};

const atualizarCliente = async (
    id,
    nome,
    email,
    telefone,
    cpf
) => {
    const resultado = await pool.query(
        `UPDATE cliente
         SET nome = $1,
             email = $2,
             telefone = $3,
             cpf = $4
         WHERE id = $5
         RETURNING id, nome, email, telefone, cpf, criado_em`,
        [nome, email, telefone, cpf, id]
    );

    return resultado.rows[0];
};


const atualizarSenha = async (idCliente, senhaCriptografada) => {
    const resultado = await pool.query(
        `UPDATE cliente
         SET senha = $1
         WHERE id = $2
         RETURNING id`,
        [senhaCriptografada, idCliente]
    );

    return resultado.rows[0];
};


module.exports = {
    buscarPorId,
    buscarPorEmail,
    buscarPorCpf,
    buscarPorTelefone,
    criarCliente,
    atualizarCliente,
    atualizarSenha
};