
const pool = require('../config/db');
const AppError = require('../middlewares/AppError');

const contratoRepository = require('./contratoRepository');

const {
    gerarDescricaoContrato
} = require('../utils/contratoTemplate');


// CRIAR RESERVA

const criarReservaComItens = async (
    idCliente,
    idEndereco,
    dataInicio,
    dataFim,
    horaInicio,
    valorTotal,
    itens
) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Bloqueia os brinquedos em ordem fixa para evitar
        // conflitos entre reservas simultâneas.
        const itensOrdenados = [...itens].sort(
            (a, b) => a.id_brinquedo - b.id_brinquedo
        );

        for (const item of itensOrdenados) {
            const resultadoBrinquedo = await client.query(
                `SELECT id, nome, quantidade_total, ativo
                 FROM brinquedo
                 WHERE id = $1
                 FOR UPDATE`,
                [item.id_brinquedo]
            );

            const brinquedo = resultadoBrinquedo.rows[0];

            if (!brinquedo || !brinquedo.ativo) {
                throw new Error(
                    'Brinquedo não encontrado ou inativo.'
                );
            }
        }

        // 2. Verifica a disponibilidade com os bloqueios ativos.
        for (const item of itensOrdenados) {
            const resultadoEstoque = await client.query(
                `SELECT
                    b.nome,
                    b.quantidade_total,
                    COALESCE(
                    SUM(ir.quantidade) FILTER (WHERE r.id IS NOT NULL),
                    0
                    ) AS quantidade_reservada
                    FROM brinquedo b
                 LEFT JOIN item_reserva ir
                    ON ir.id_brinquedo = b.id
                 LEFT JOIN reserva r
                    ON r.id = ir.id_reserva
                    AND (
    r.status = 'CONFIRMADA'
    OR (
        r.status = 'AGUARDANDO_PAGAMENTO'
        AND (
            r.expira_em >
                (NOW() AT TIME ZONE 'America/Bahia')
            OR EXISTS (
                SELECT 1
                FROM pagamento p
                WHERE p.id_reserva = r.id
                  AND p.origem = 'STRIPE'
                  AND p.status = 'PENDENTE'
                  AND p.stripe_checkout_session_id IS NOT NULL
            )
        )
    )
)
                    AND r.data_inicio <= $2
                    AND r.data_fim >= $3
                 WHERE b.id = $1
                 GROUP BY b.id, b.nome, b.quantidade_total`,
                [
                    item.id_brinquedo,
                    dataFim,
                    dataInicio
                ]
            );

            const estoque = resultadoEstoque.rows[0];

            const quantidadeDisponivel =
                Number(estoque.quantidade_total) -
                Number(estoque.quantidade_reservada);

            if (item.quantidade > quantidadeDisponivel) {
                throw new AppError(
                    `Quantidade indisponível para ${estoque.nome}.`,
                    409
                );
            }
        }

        // 3. Cria a reserva.
        const resultadoReserva = await client.query(
            `INSERT INTO reserva (
                id_cliente,
                id_endereco,
                data_inicio,
                data_fim,
                hora_inicio,
                valor_total
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
                idCliente,
                idEndereco,
                dataInicio,
                dataFim,
                horaInicio,
                valorTotal
            ]
        );

        const reserva = resultadoReserva.rows[0];

        // 4. Insere os brinquedos da reserva.
        for (const item of itensOrdenados) {
            await client.query(
                `INSERT INTO item_reserva (
                    id_reserva,
                    id_brinquedo,
                    quantidade,
                    preco_unitario
                )
                VALUES ($1, $2, $3, $4)`,
                [
                    reserva.id,
                    item.id_brinquedo,
                    item.quantidade,
                    item.preco_unitario
                ]
            );
        }

        await client.query('COMMIT');

        return reserva;

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;

    } finally {
        client.release();
    }
};


// BUSCAR RESERVA POR ID

const buscarPorId = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT
            r.*,
            c.nome AS nome_cliente,
            c.email AS email_cliente,
            c.telefone AS telefone_cliente,
            e.cep,
            e.logradouro,
            e.numero,
            e.bairro,
            e.cidade,
            e.complemento,

            COALESCE(
                financeiro.total_pago_validado, 0
            ) AS total_pago_validado,

            GREATEST(
                r.valor_total -
                COALESCE(financeiro.total_pago_validado, 0),
                0
            ) AS saldo_restante,

            CASE
                WHEN COALESCE(
                    financeiro.pagamentos_nao_validados, 0
                ) > 0
                    THEN 'EM_ANALISE'

                WHEN COALESCE(
                    financeiro.total_pago_validado, 0
                ) >= r.valor_total
                    THEN 'QUITADA'

                WHEN COALESCE(
                    financeiro.total_pago_validado, 0
                ) > 0
                    THEN 'PARCIALMENTE_PAGA'

                ELSE 'NAO_PAGA'
            END AS situacao_financeira

         FROM reserva r

         INNER JOIN cliente c
             ON c.id = r.id_cliente

         INNER JOIN endereco e
             ON e.id = r.id_endereco

         LEFT JOIN LATERAL (
             SELECT
                 COALESCE(
                     SUM(p.valor) FILTER (
                         WHERE p.validacao_financeira = 'VALIDADO'
                     ), 0
                 ) AS total_pago_validado,

                 COUNT(*) FILTER (
                     WHERE p.validacao_financeira
                           IS DISTINCT FROM 'VALIDADO'
                 ) AS pagamentos_nao_validados

             FROM pagamento p
             WHERE p.id_reserva = r.id
               AND p.status = 'PAGO'
         ) financeiro ON TRUE

         WHERE r.id = $1`,
        [idReserva]
    );

    return resultado.rows[0];
};



// LISTAR RESERVAS DO CLIENTE

const buscarPorCliente = async (idCliente) => {
    const resultado = await pool.query(
        `SELECT
            r.*,

            COALESCE(
                financeiro.total_pago_validado, 0
            ) AS total_pago_validado,

            GREATEST(
                r.valor_total -
                COALESCE(financeiro.total_pago_validado, 0),
                0
            ) AS saldo_restante,

            CASE
                WHEN COALESCE(
                    financeiro.pagamentos_nao_validados, 0
                ) > 0
                    THEN 'EM_ANALISE'

                WHEN COALESCE(
                    financeiro.total_pago_validado, 0
                ) >= r.valor_total
                    THEN 'QUITADA'

                WHEN COALESCE(
                    financeiro.total_pago_validado, 0
                ) > 0
                    THEN 'PARCIALMENTE_PAGA'

                ELSE 'NAO_PAGA'
            END AS situacao_financeira

         FROM reserva r

         LEFT JOIN LATERAL (
             SELECT
                 COALESCE(
                     SUM(p.valor) FILTER (
                         WHERE p.validacao_financeira = 'VALIDADO'
                     ), 0
                 ) AS total_pago_validado,

                 COUNT(*) FILTER (
                     WHERE p.validacao_financeira
                           IS DISTINCT FROM 'VALIDADO'
                 ) AS pagamentos_nao_validados

             FROM pagamento p
             WHERE p.id_reserva = r.id
               AND p.status = 'PAGO'
         ) financeiro ON TRUE

         WHERE r.id_cliente = $1

         ORDER BY r.criado_em DESC, r.id DESC`,
        [idCliente]
    );

    return resultado.rows;
};



// LISTAR RESERVAS PENDENTES
const buscarReservasPendentes = async () => {
    const resultado = await pool.query(
        `SELECT
            r.id,
            r.id_cliente,
            c.nome AS nome_cliente,
            r.id_endereco,
            r.data_inicio,
            r.data_fim,
            r.valor_total,
            r.status,
            r.criado_em
         FROM reserva r
         INNER JOIN cliente c
            ON c.id = r.id_cliente
         WHERE r.status = 'PENDENTE'
         ORDER BY r.criado_em ASC, r.id ASC`
    );

    return resultado.rows;
};


// CALCULAR QUANTIDADE RESERVADA NO PERÍODO
const buscarQuantidadeReservada = async (
    idBrinquedo,
    dataInicio,
    dataFim
) => {
    const resultado = await pool.query(
        `SELECT COALESCE(
            SUM(ir.quantidade), 0
         ) AS quantidade_reservada
         FROM item_reserva ir
         INNER JOIN reserva r
            ON r.id = ir.id_reserva
         WHERE ir.id_brinquedo = $1
           AND (
    r.status = 'CONFIRMADA'
    OR (
        r.status = 'AGUARDANDO_PAGAMENTO'
        AND (
            r.expira_em >
                (NOW() AT TIME ZONE 'America/Bahia')
            OR EXISTS (
                SELECT 1
                FROM pagamento p
                WHERE p.id_reserva = r.id
                  AND p.origem = 'STRIPE'
                  AND p.status = 'PENDENTE'
                  AND p.stripe_checkout_session_id IS NOT NULL
            )
        )
    )
)
)
           AND r.data_inicio <= $3
           AND r.data_fim >= $2`,
        [
            idBrinquedo,
            dataInicio,
            dataFim
        ]
    );

    return Number(
        resultado.rows[0].quantidade_reservada
    );
};


// RECUSAR RESERVA
const recusarReserva = async (idReserva) => {
    const resultado = await pool.query(
        `UPDATE reserva
         SET status = 'RECUSADA'
         WHERE id = $1
           AND status = 'PENDENTE'
         RETURNING *`,
        [idReserva]
    );

    return resultado.rows[0];
};


// APROVAR RESERVA E GERAR CONTRATO
const aprovarReserva = async (idReserva) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Bloqueia a reserva durante a aprovação
        const resultadoReserva = await client.query(
            `SELECT *
             FROM reserva
             WHERE id = $1
             FOR UPDATE`,
            [idReserva]
        );

        const reserva = resultadoReserva.rows[0];

        if (!reserva) {
            throw new AppError(
                'Reserva não encontrada',
                404
            );
        }

        if (reserva.status !== 'PENDENTE') {
            throw new AppError(
                'Somente reservas pendentes podem ser aprovadas',
                409
            );
        }

        // Busca os brinquedos solicitados
        const resultadoItens = await client.query(
            `SELECT *
             FROM item_reserva
             WHERE id_reserva = $1
             ORDER BY id_brinquedo`,
            [idReserva]
        );

        const itens = resultadoItens.rows;

        if (itens.length === 0) {
            throw new AppError(
                'Reserva não possui brinquedos',
                409
            );
        }

        // Bloqueia os brinquedos para evitar
        // aprovações concorrentes com o mesmo estoque
        for (const item of itens) {
            await client.query(
                `SELECT id
                 FROM brinquedo
                 WHERE id = $1
                 FOR UPDATE`,
                [item.id_brinquedo]
            );
        }

        // Verifica a disponibilidade de cada brinquedo
        for (const item of itens) {
            const resultadoBrinquedo = await client.query(
                `SELECT quantidade_total, ativo
                 FROM brinquedo
                 WHERE id = $1`,
                [item.id_brinquedo]
            );

            const brinquedo = resultadoBrinquedo.rows[0];

            if (!brinquedo || !brinquedo.ativo) {
                throw new AppError(
                    'Um dos brinquedos está indisponível',
                    409
                );
            }

            const resultadoQuantidade = await client.query(
                `SELECT COALESCE(
                    SUM(ir.quantidade), 0
                 ) AS quantidade_reservada
                 FROM item_reserva ir
                 INNER JOIN reserva r
                    ON r.id = ir.id_reserva
                 WHERE ir.id_brinquedo = $1
                   AND (
    r.status = 'CONFIRMADA'
    OR (
        r.status = 'AGUARDANDO_PAGAMENTO'
        AND (
            r.expira_em >
                (NOW() AT TIME ZONE 'America/Bahia')
            OR EXISTS (
                SELECT 1
                FROM pagamento p
                WHERE p.id_reserva = r.id
                  AND p.origem = 'STRIPE'
                  AND p.status = 'PENDENTE'
                  AND p.stripe_checkout_session_id IS NOT NULL
            )
        )
    )
)
                   AND r.data_inicio <= $3
                   AND r.data_fim >= $2`,
                [
                    item.id_brinquedo,
                    reserva.data_inicio,
                    reserva.data_fim
                ]
            );

            const quantidadeReservada = Number(
                resultadoQuantidade.rows[0]
                    .quantidade_reservada
            );

            const quantidadeDisponivel =
                brinquedo.quantidade_total -
                quantidadeReservada;

            if (item.quantidade > quantidadeDisponivel) {
                throw new AppError(
                    'Quantidade indisponível para o período solicitado',
                    409
                );
            }
        }

        // Aprova a reserva e define o prazo de 1 hora
        const resultadoAtualizacao = await client.query(
            `UPDATE reserva
     SET status = 'AGUARDANDO_PAGAMENTO',
         expira_em =
             (NOW() AT TIME ZONE 'America/Bahia')
             + INTERVAL '1 hour'
     WHERE id = $1
       AND status = 'PENDENTE'
     RETURNING *`,
            [idReserva]
        );

        const reservaAtualizada =
            resultadoAtualizacao.rows[0];

        if (!reservaAtualizada) {
            throw new AppError(
                'A reserva não está mais pendente',
                409
            );
        }

        // Gera o texto do contrato
        const descricaoContrato = gerarDescricaoContrato(
            reservaAtualizada,
            itens
        );

        // Cria o contrato dentro da mesma transação
        await contratoRepository.criarContrato(
            idReserva,
            descricaoContrato,
            client
        );

        // Confirma todas as operações
        await client.query('COMMIT');

        return reservaAtualizada;

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;

    } finally {
        client.release();
    }
};



const expirarReservasVencidas = async () => {
    const resultado = await pool.query(
        `UPDATE reserva r
         SET status = 'EXPIRADA'
         WHERE r.status = 'AGUARDANDO_PAGAMENTO'
           AND r.expira_em <=
               (NOW() AT TIME ZONE 'America/Bahia')
           AND NOT EXISTS (
               SELECT 1
               FROM pagamento p
               WHERE p.id_reserva = r.id
                 AND p.status = 'PENDENTE'
                 AND p.origem = 'STRIPE'
                 AND p.stripe_checkout_session_id IS NOT NULL
           )
         RETURNING r.id, r.status, r.expira_em`
    );

    return resultado.rows;
};




const cancelarReservaCliente = async (
    idReserva,
    idCliente
) => {
    const resultado = await pool.query(
        `UPDATE reserva
         SET status = 'CANCELADA'
         WHERE id = $1
           AND id_cliente = $2
           AND status IN (
               'PENDENTE',
               'AGUARDANDO_PAGAMENTO'
           )
         RETURNING *`,
        [idReserva, idCliente]
    );

    return resultado.rows[0];
};


const concluirReserva = async (idReserva) => {
    const resultado = await pool.query(
        `UPDATE reserva
         SET status = 'CONCLUIDA'
         WHERE id = $1
           AND status = 'CONFIRMADA'
           AND data_fim < CURRENT_DATE
         RETURNING *`,
        [idReserva]
    );

    return resultado.rows[0];
};


const listarTodasReservas = async (status) => {
    const parametros = [];
    let filtro = '';

    if (status) {
        parametros.push(status);
        filtro = 'WHERE r.status = $1';
    }

    const resultado = await pool.query(
        `SELECT
            r.id,
            r.id_cliente,
            c.nome AS nome_cliente,
            c.email AS email_cliente,
            c.telefone AS telefone_cliente,
            r.data_inicio,
            r.data_fim,
            r.status,
            r.valor_total,
            r.criado_em,
            r.expira_em
         FROM reserva r
         JOIN cliente c ON c.id = r.id_cliente
         ${filtro}
         ORDER BY r.criado_em DESC, r.id DESC`,
        parametros
    );

    return resultado.rows;
};


const buscarItensPorReserva = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT
            ir.id,
            ir.id_reserva,
            ir.id_brinquedo,
            b.nome AS nome_brinquedo,
            ir.quantidade,
            ir.preco_unitario
         FROM item_reserva ir
         INNER JOIN brinquedo b
             ON b.id = ir.id_brinquedo
         WHERE ir.id_reserva = $1
         ORDER BY ir.id`,
        [idReserva]
    );

    return resultado.rows;
};



module.exports = {
    criarReservaComItens,
    buscarPorId,
    buscarItensPorReserva,
    buscarPorCliente,
    buscarReservasPendentes,
    buscarQuantidadeReservada,
    recusarReserva,
    aprovarReserva,
    expirarReservasVencidas,
    cancelarReservaCliente,
    concluirReserva,
    listarTodasReservas
};
