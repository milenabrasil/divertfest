
const pool = require('../config/db');
const { randomUUID } = require('node:crypto');

// Cria uma tentativa pendente, sem duplicar outra já existente.

const iniciarTentativa = async ({
    idReserva,
    valor,
    tipo,
}) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Bloqueia a reserva antes de verificar seus dados.

        const reservaResultado = await client.query(
            `SELECT
        id,
        status,
        valor_total,
        expira_em,
        data_inicio,
        hora_inicio,

        EXTRACT(
            EPOCH FROM (
                expira_em AT TIME ZONE 'America/Bahia'
            )
        )::bigint AS expira_em_unix,

        EXTRACT(
            EPOCH FROM (
                (data_inicio + hora_inicio)
                AT TIME ZONE 'America/Bahia'
            )
        )::bigint AS inicio_locacao_unix

     FROM reserva
     WHERE id = $1
     FOR UPDATE`,
            [idReserva]
        );


        const reserva = reservaResultado.rows[0];

        if (!reserva) {
            throw new Error('Reserva não encontrada.');
        }

        // 2. Consulta os pagamentos já recebidos.
        const financeiroResultado = await client.query(
            `SELECT
                COALESCE(
                    SUM(valor) FILTER (
                        WHERE validacao_financeira = 'VALIDADO'
                    ), 0
                ) AS total_validado,

                COUNT(*) FILTER (
                    WHERE validacao_financeira <> 'VALIDADO'
                ) AS pagamentos_nao_validados,

                COUNT(*) FILTER (
                    WHERE tipo = 'ENTRADA'
                      AND validacao_financeira = 'VALIDADO'
                ) AS entradas_validadas

             FROM pagamento
             WHERE id_reserva = $1
               AND status = 'PAGO'`,
            [idReserva]
        );

        const financeiro = financeiroResultado.rows[0];

        if (Number(financeiro.pagamentos_nao_validados) > 0) {
            throw new Error(
                'Existem pagamentos recebidos que precisam de análise.'
            );
        }

        const totalCentavos = Math.round(
            Number(reserva.valor_total) * 100
        );

        const pagoCentavos = Math.round(
            Number(financeiro.total_validado) * 100
        );

        const valorCentavos = Math.round(
            Number(valor) * 100
        );

        if (
            !Number.isSafeInteger(totalCentavos) ||
            !Number.isSafeInteger(pagoCentavos) ||
            !Number.isSafeInteger(valorCentavos) ||
            totalCentavos <= 0 ||
            valorCentavos <= 0
        ) {
            throw new Error('Valores financeiros inválidos.');
        }

        // 3. Valida o tipo e o valor da tentativa.
        if (tipo === 'ENTRADA' || tipo === 'INTEGRAL') {
            const esperado = tipo === 'ENTRADA'
                ? Math.round(totalCentavos / 2)
                : totalCentavos;


            const prazoResultado = await client.query(
                `SELECT
        expira_em IS NOT NULL
        AND expira_em > (NOW() AT TIME ZONE 'America/Bahia')
        AS dentro_do_prazo
     FROM reserva
     WHERE id = $1`,
                [idReserva]
            );


            if (
                reserva.status !== 'AGUARDANDO_PAGAMENTO' ||
                !reserva.expira_em ||
                prazoResultado.rows[0].dentro_do_prazo !== true ||
                pagoCentavos !== 0 ||
                valorCentavos !== esperado
            ) {
                throw new Error(
                    'Pagamento inicial não permitido para esta reserva.'
                );
            }
        } else if (tipo === 'RESTANTE') {

            const inicioResultado = await client.query(
                `SELECT
        hora_inicio IS NOT NULL
        AND (data_inicio + hora_inicio) >
            (NOW() AT TIME ZONE 'America/Bahia')
        AS ainda_nao_iniciou
     FROM reserva
     WHERE id = $1`,
                [idReserva]
            );


            if (
                reserva.status !== 'CONFIRMADA' ||
                Number(financeiro.entradas_validadas) !== 1 ||
                inicioResultado.rows[0].ainda_nao_iniciou !== true ||
                pagoCentavos <= 0 ||
                valorCentavos !== totalCentavos - pagoCentavos
            ) {
                throw new Error(
                    'Pagamento restante não permitido para esta reserva.'
                );
            }
        } else {
            throw new Error('Tipo de pagamento inválido.');
        }

        // 4. Registra a tentativa com chave de idempotência.

        const chaveIdempotencia = randomUUID();

        const agora = Math.floor(Date.now() / 1000);

        const vencimento = tipo === 'RESTANTE'
            ? Math.min(
                agora + 60 * 60,
                Number(reserva.inicio_locacao_unix)
            )
            : Number(reserva.expira_em_unix);

        // A Stripe exige que a sessão tenha pelo menos
        // 30 minutos de validade no momento da criação.
        if (
            !Number.isSafeInteger(vencimento) ||
            vencimento - agora < 30 * 60
        ) {
            throw new Error(
                'Não há prazo suficiente para criar a sessão de pagamento.'
            );
        }

        const resultado = await client.query(
            `INSERT INTO pagamento (
        id_reserva,
        valor,
        tipo,
        status,
        forma_pagamento,
        origem,
        chave_idempotencia,
        stripe_checkout_expira_em
    )
    VALUES (
        $1, $2, $3,
        'PENDENTE',
        NULL,
        'STRIPE',
        $4,
        $5
    )
    ON CONFLICT (id_reserva)
    WHERE status = 'PENDENTE'
      AND origem = 'STRIPE'
    DO NOTHING
    RETURNING *`,
            [
                idReserva,
                valor,
                tipo,
                chaveIdempotencia,
                vencimento
            ]
        );


        await client.query('COMMIT');

        return resultado.rows[0] || null;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
    } finally {
        client.release();
    }
};


// Busca a tentativa pendente de uma reserva.
const buscarPagamentoPendente = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT *
         FROM pagamento
         WHERE id_reserva = $1
           AND status = 'PENDENTE'
           AND origem = 'STRIPE'
         ORDER BY criado_em DESC, id DESC
         LIMIT 1`,
        [idReserva]
    );

    return resultado.rows[0] || null;
};


const validarTentativaPendente = async (idPagamento) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reservaResultado = await client.query(
            `SELECT r.id, r.status, r.valor_total,
                    r.expira_em, r.data_inicio, r.hora_inicio
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.id = $1
             FOR UPDATE OF r`,
            [idPagamento]
        );

        const reserva = reservaResultado.rows[0];

        if (!reserva) {
            await client.query('ROLLBACK');
            return false;
        }

        const pagamentoResultado = await client.query(
            `SELECT *
             FROM pagamento
             WHERE id = $1
             FOR UPDATE`,
            [idPagamento]
        );

        const pagamento = pagamentoResultado.rows[0];

        if (
            !pagamento ||
            pagamento.status !== 'PENDENTE' ||
            pagamento.origem !== 'STRIPE'
        ) {
            await client.query('ROLLBACK');
            return false;
        }

        const financeiroResultado = await client.query(
            `SELECT
                COALESCE(SUM(valor) FILTER (
                    WHERE validacao_financeira = 'VALIDADO'
                ), 0) AS total_validado,
                COUNT(*) FILTER (
                    WHERE validacao_financeira <> 'VALIDADO'
                ) AS nao_validados,
                COUNT(*) FILTER (
                    WHERE tipo = 'ENTRADA'
                      AND validacao_financeira = 'VALIDADO'
                ) AS entradas_validadas
             FROM pagamento
             WHERE id_reserva = $1
               AND status = 'PAGO'`,
            [reserva.id]
        );

        const financeiro = financeiroResultado.rows[0];

        const total = Math.round(Number(reserva.valor_total) * 100);
        const pago = Math.round(Number(financeiro.total_validado) * 100);
        const valor = Math.round(Number(pagamento.valor) * 100);

        let permitido = false;

        if (
            Number(financeiro.nao_validados) === 0 &&
            Number.isSafeInteger(total) &&
            Number.isSafeInteger(pago) &&
            Number.isSafeInteger(valor) &&
            total > 0 &&
            valor > 0
        ) {
            if (pagamento.tipo === 'ENTRADA' ||
                pagamento.tipo === 'INTEGRAL') {
                const esperado = pagamento.tipo === 'ENTRADA'
                    ? Math.round(total / 2)
                    : total;

                const prazo = await client.query(
                    `SELECT expira_em IS NOT NULL
                        AND expira_em >
                        (NOW() AT TIME ZONE 'America/Bahia')
                        AS valido
                     FROM reserva
                     WHERE id = $1`,
                    [reserva.id]
                );

                permitido =
                    reserva.status === 'AGUARDANDO_PAGAMENTO' &&
                    prazo.rows[0].valido === true &&
                    pago === 0 &&
                    valor === esperado;
            } else if (pagamento.tipo === 'RESTANTE') {
                const inicio = await client.query(
                    `SELECT hora_inicio IS NOT NULL
                        AND (data_inicio + hora_inicio) >
                        (NOW() AT TIME ZONE 'America/Bahia')
                        AS valido
                     FROM reserva
                     WHERE id = $1`,
                    [reserva.id]
                );

                permitido =
                    reserva.status === 'CONFIRMADA' &&
                    Number(financeiro.entradas_validadas) === 1 &&
                    inicio.rows[0].valido === true &&
                    pago > 0 &&
                    valor === total - pago;
            }
        }

        await client.query('COMMIT');
        return permitido;
    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
    } finally {
        client.release();
    }
};



const associarCheckoutSession = async (idPagamento, sessionId) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Bloqueia primeiro a reserva para manter
        // a ordem de bloqueio utilizada no sistema.
        const reservaResultado = await client.query(
            `SELECT r.id
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.id = $1
               AND p.origem = 'STRIPE'
             FOR UPDATE OF r`,
            [idPagamento]
        );

        if (reservaResultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        // Associa a sessão somente se o pagamento
        // ainda estiver pendente e não possuir
        // outra sessão diferente vinculada.
        const resultado = await client.query(
            `UPDATE pagamento
             SET stripe_checkout_session_id = $2
             WHERE id = $1
               AND status = 'PENDENTE'
               AND origem = 'STRIPE'
               AND (
                   stripe_checkout_session_id IS NULL
                   OR stripe_checkout_session_id = $2
               )
             RETURNING *`,
            [idPagamento, sessionId]
        );

        await client.query('COMMIT');

        return resultado.rows[0] || null;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;

    } finally {
        client.release();
    }
};


// Busca todos os pagamentos de uma reserva.
const buscarPorReserva = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT *
         FROM pagamento
         WHERE id_reserva = $1
         ORDER BY criado_em DESC, id DESC`,
        [idReserva]
    );

    return resultado.rows;
};

// Busca um pagamento pela sessão Stripe.
const buscarPorCheckoutSession = async (sessionId) => {
    const resultado = await pool.query(
        `SELECT *
         FROM pagamento
         WHERE stripe_checkout_session_id = $1`,
        [sessionId]
    );

    return resultado.rows[0] || null;
};

// Busca uma tentativa pelo ID.
const buscarTentativaPorId = async (idPagamento) => {
    const resultado = await pool.query(
        `SELECT
            p.*,
            r.status AS status_reserva,
            r.expira_em
         FROM pagamento p
         JOIN reserva r ON r.id = p.id_reserva
         WHERE p.id = $1`,
        [idPagamento]
    );

    return resultado.rows[0] || null;
};

// Cancela uma tentativa expirada.
// Esta função só deve ser chamada após consultar
// e confirmar a expiração da sessão na Stripe.
const cancelarTentativaExpirada = async (
    idPagamento,
    stripeCheckoutSessionId
) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Bloqueia primeiro a reserva.
        const reservaResultado = await client.query(
            `SELECT r.id
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.id = $1
               AND p.stripe_checkout_session_id = $2
             FOR UPDATE OF r`,
            [idPagamento, stripeCheckoutSessionId]
        );

        if (reservaResultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        // Atualiza somente pagamentos ainda pendentes.
        const resultado = await client.query(
            `UPDATE pagamento
             SET status = 'CANCELADO'
             WHERE id = $1
               AND stripe_checkout_session_id = $2
               AND status = 'PENDENTE'
               AND origem = 'STRIPE'
             RETURNING *`,
            [idPagamento, stripeCheckoutSessionId]
        );

        await client.query('COMMIT');

        return resultado.rows[0] || null;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;

    } finally {
        client.release();
    }
};


const cancelarTentativaComFalha = async (
    idPagamento,
    stripeCheckoutSessionId
) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Mantém a mesma ordem de bloqueios:
        // primeiro reserva, depois pagamento.
        const reservaResultado = await client.query(
            `SELECT r.id
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.id = $1
               AND p.stripe_checkout_session_id = $2
             FOR UPDATE OF r`,
            [idPagamento, stripeCheckoutSessionId]
        );

        if (reservaResultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }


        const pagamentoResultado = await client.query(
            `SELECT status
     FROM pagamento
     WHERE id = $1
       AND stripe_checkout_session_id = $2
     FOR UPDATE`,
            [idPagamento, stripeCheckoutSessionId]
        );

        if (
            pagamentoResultado.rows.length === 0 ||
            pagamentoResultado.rows[0].status !== 'PENDENTE'
        ) {
            await client.query('ROLLBACK');
            return null;
        }


        const resultado = await client.query(
            `UPDATE pagamento
             SET status = 'FALHOU'
             WHERE id = $1
               AND stripe_checkout_session_id = $2
               AND status = 'PENDENTE'
               AND origem = 'STRIPE'
             RETURNING *`,
            [idPagamento, stripeCheckoutSessionId]
        );

        await client.query('COMMIT');

        return resultado.rows[0] || null;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;

    } finally {
        client.release();
    }
};


// Confirma o pagamento e, quando permitido,
// confirma a reserva dentro da mesma transação.
const confirmarPagamentoTransacional = async (
    sessionId,
    paymentIntentId,
    valorRecebido,
    formaPagamento
) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Valida a forma de pagamento identificada pela Stripe.
        if (!['PIX', 'CARTAO'].includes(formaPagamento)) {
            throw new Error(
                'Forma de pagamento não reconhecida.'
            );
        }

        // 1. Bloqueia a reserva.
        const reservaResultado = await client.query(
            `SELECT r.*
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.stripe_checkout_session_id = $1
             FOR UPDATE OF r`,
            [sessionId]
        );

        const reserva = reservaResultado.rows[0];

        if (!reserva) {
            throw new Error(
                'Reserva não encontrada para esta sessão.'
            );
        }

        // 2. Bloqueia o pagamento.
        const pagamentoResultado = await client.query(
            `SELECT *
             FROM pagamento
             WHERE stripe_checkout_session_id = $1
             FOR UPDATE`,
            [sessionId]
        );

        const pagamento = pagamentoResultado.rows[0];

        if (!pagamento) {
            throw new Error(
                'Pagamento não encontrado para esta sessão.'
            );
        }

        // 3. Confere a origem.
        if (pagamento.origem !== 'STRIPE') {
            throw new Error(
                'Pagamento não pertence à Stripe.'
            );
        }

        // 4. Valida o PaymentIntent.
        if (
            typeof paymentIntentId !== 'string' ||
            !paymentIntentId.startsWith('pi_')
        ) {
            throw new Error(
                'Identificador do PaymentIntent inválido.'
            );
        }

        if (
            pagamento.stripe_payment_intent_id &&
            pagamento.stripe_payment_intent_id !== paymentIntentId
        ) {
            throw new Error(
                'PaymentIntent diferente do pagamento registrado.'
            );
        }

        // 5. Confere o valor recebido.
        const valorEsperado = Math.round(
            Number(pagamento.valor) * 100
        );

        if (
            !Number.isInteger(valorRecebido) ||
            valorEsperado !== valorRecebido
        ) {
            throw new Error(
                'Valor recebido diferente do esperado.'
            );
        }

        // 6. Evita processar o mesmo pagamento duas vezes.



        if (pagamento.status === 'PAGO') {
            await client.query('COMMIT');

            const pagamentoValidado =
                pagamento.validacao_financeira === 'VALIDADO';

            return {
                pagamento,
                duplicado: true,
                reservaConfirmada:
                    reserva.status === 'CONFIRMADA',
                pagamentoValidado,
                requerAnalise: !pagamentoValidado
            };
        }


        if (
            !['PENDENTE', 'CANCELADO', 'FALHOU'].includes(
                pagamento.status
            )
        ) {
            throw new Error(
                'Status do pagamento não permitido.'
            );
        }


        // 8. Valida o tipo de pagamento.

        if (
            !['ENTRADA', 'INTEGRAL', 'RESTANTE'].includes(pagamento.tipo)
        ) {
            throw new Error(
                'Tipo de pagamento não permitido neste fluxo.'
            );
        }


        // 9. Verifica se já existe outro pagamento
        // confirmado para esta reserva.


        const pagamentosConfirmadosResultado = await client.query(
            `SELECT
        COALESCE(
            SUM(valor) FILTER (
                WHERE validacao_financeira = 'VALIDADO'
            ), 0
        ) AS total_pago,

        COUNT(*) FILTER (
            WHERE tipo = 'ENTRADA'
              AND validacao_financeira = 'VALIDADO'
        ) AS entradas_pagas,

        COUNT(*) FILTER (
            WHERE validacao_financeira <> 'VALIDADO'
        ) AS pagamentos_nao_validados

     FROM pagamento
     WHERE id_reserva = $1
       AND status = 'PAGO'
       AND id <> $2`,
            [reserva.id, pagamento.id]
        );


        const totalPagoCentavos = Math.round(
            Number(pagamentosConfirmadosResultado.rows[0].total_pago) * 100
        );

        const totalReservaCentavos = Math.round(
            Number(reserva.valor_total) * 100
        );

        const valorAtualCentavos = Math.round(
            Number(pagamento.valor) * 100
        );

        const possuiEntradaPaga =
            Number(pagamentosConfirmadosResultado.rows[0].entradas_pagas) > 0;


        const existeOutroPagamento = totalPagoCentavos > 0;

        const possuiPagamentosNaoValidados =
            Number(
                pagamentosConfirmadosResultado.rows[0].pagamentos_nao_validados
            ) > 0;

        const saldoSuficiente =
            totalPagoCentavos + valorAtualCentavos <= totalReservaCentavos;

        const situacaoFinanceiraRegular =
            !possuiPagamentosNaoValidados &&
            saldoSuficiente;


        const valorInicialCorreto =
            pagamento.tipo === 'ENTRADA'
                ? valorAtualCentavos ===
                Math.round(totalReservaCentavos / 2)
                : pagamento.tipo === 'INTEGRAL'
                    ? valorAtualCentavos === totalReservaCentavos
                    : true;

        // 10. Confere a validade da reserva
        // usando o horário da Bahia.
        const validadeResultado = await client.query(
            `SELECT
                status = 'AGUARDANDO_PAGAMENTO'
                AND expira_em IS NOT NULL
                AND expira_em >
                    (NOW() AT TIME ZONE 'America/Bahia')
                    AS reserva_valida
             FROM reserva
             WHERE id = $1`,
            [reserva.id]
        );

        const reservaValida =
            validadeResultado.rows[0].reserva_valida;

        // A reserva só poderá ser confirmada se:
        // - estiver dentro do prazo;
        // - estiver aguardando pagamento;
        // - não houver outro pagamento confirmado.

        const pagamentoInicial =
            pagamento.tipo === 'ENTRADA' ||
            pagamento.tipo === 'INTEGRAL';

        const pagamentoRestante =
            pagamento.tipo === 'RESTANTE';

        const inicioLocacaoResultado = await client.query(
            `SELECT
        hora_inicio IS NOT NULL
        AND (data_inicio + hora_inicio) >
            (NOW() AT TIME ZONE 'America/Bahia')
        AS ainda_nao_iniciou
     FROM reserva
     WHERE id = $1`,
            [reserva.id]
        );

        const aindaNaoIniciou =
            inicioLocacaoResultado.rows[0].ainda_nao_iniciou === true;

        // Apenas uma tentativa ainda pendente pode ser validada automaticamente.
        const tentativaAindaPendente =
            pagamento.status === 'PENDENTE';

        const podeConfirmarReserva =
            tentativaAindaPendente &&
            pagamentoInicial &&
            reservaValida &&
            !existeOutroPagamento &&
            situacaoFinanceiraRegular &&
            valorInicialCorreto;

        const pagamentoRestanteValido =
            tentativaAindaPendente &&
            pagamentoRestante &&
            reserva.status === 'CONFIRMADA' &&
            possuiEntradaPaga &&
            aindaNaoIniciou &&
            situacaoFinanceiraRegular &&
            totalPagoCentavos + valorAtualCentavos === totalReservaCentavos;


        // 11. Registra o dinheiro recebido,
        // mesmo que a reserva precise de análise.
        const pagamentoValidado =
            podeConfirmarReserva || pagamentoRestanteValido;

        const validacaoFinanceira = pagamentoValidado
            ? 'VALIDADO'
            : 'REQUER_ANALISE';

        const motivosAnalise = [];

        if (!pagamentoValidado) {
            if (!tentativaAindaPendente) {
                motivosAnalise.push(
                    'Tentativa de pagamento não estava pendente'
                );
            }

            if (pagamentoInicial) {
                if (!reservaValida) {
                    motivosAnalise.push(
                        'Reserva fora do prazo ou não aguardando pagamento'
                    );
                }

                if (existeOutroPagamento) {
                    motivosAnalise.push(
                        'Já existe outro pagamento validado para a reserva'
                    );
                }

                if (!valorInicialCorreto) {
                    motivosAnalise.push(
                        'Valor do pagamento inicial diferente do esperado'
                    );
                }
            }

            if (pagamentoRestante) {
                if (reserva.status !== 'CONFIRMADA') {
                    motivosAnalise.push(
                        'Reserva não está confirmada'
                    );
                }

                if (!possuiEntradaPaga) {
                    motivosAnalise.push(
                        'Não existe entrada validada'
                    );
                }

                if (!aindaNaoIniciou) {
                    motivosAnalise.push(
                        'Locação já iniciada ou sem horário de início'
                    );
                }

                if (
                    totalPagoCentavos + valorAtualCentavos !==
                    totalReservaCentavos
                ) {
                    motivosAnalise.push(
                        'Pagamento restante não corresponde ao saldo esperado'
                    );
                }
            }

            if (possuiPagamentosNaoValidados) {
                motivosAnalise.push(
                    'Existem outros pagamentos recebidos que precisam de análise'
                );
            }

            if (!saldoSuficiente) {
                motivosAnalise.push(
                    'Valor recebido ultrapassa o total da reserva'
                );
            }

            if (!pagamentoInicial && !pagamentoRestante) {
                motivosAnalise.push(
                    'Tipo de pagamento não reconhecido'
                );
            }
        }

        const motivoAnaliseFinanceira = pagamentoValidado
            ? null
            : motivosAnalise.join('; ') ||
            'Pagamento não atende às condições de validação automática';

        const pagamentoAtualizado = await client.query(
            `UPDATE pagamento
     SET status = 'PAGO',
         stripe_payment_intent_id = $2,
         data_pagamento = NOW(),
         validacao_financeira = $3,
         motivo_analise_financeira = $4,
         forma_pagamento = $5
     WHERE id = $1
     RETURNING *`,
            [
                pagamento.id,
                paymentIntentId,
                validacaoFinanceira,
                motivoAnaliseFinanceira,
                formaPagamento
            ]
        );

        // 12. Confirma a reserva somente quando permitido.
        if (podeConfirmarReserva) {
            await client.query(
                `UPDATE reserva
                 SET status = 'CONFIRMADA'
                 WHERE id = $1`,
                [reserva.id]
            );
        }

        await client.query('COMMIT');

        return {
            pagamento: pagamentoAtualizado.rows[0],
            duplicado: false,
            reservaConfirmada:
                podeConfirmarReserva ||
                reserva.status === 'CONFIRMADA',
            pagamentoValidado,
            requerAnalise: !pagamentoValidado
        };

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;

    } finally {
        client.release();
    }
};




const buscarTentativasPendentesExpiradas = async () => {
    const resultado = await pool.query(
        `SELECT
            p.id,
            p.id_reserva,
            p.stripe_checkout_session_id
         FROM pagamento p
         WHERE p.status = 'PENDENTE'
           AND p.origem = 'STRIPE'
           AND p.stripe_checkout_session_id IS NOT NULL
         ORDER BY p.id`
    );

    return resultado.rows;
};
/**
 * O que essa função faz?
 *
 * Busca tentativas de pagamento que:
 * 1. Continuam PENDENTE.
 * 2. Foram criadas pela integração Stripe.
 * 3. Possuem uma sessão Checkout registrada.
 *
 * A consulta não exige que a reserva esteja expirada.
 * Também não cancela pagamentos.
 *
 * A verificação do estado da sessão na Stripe
 * é realizada por recuperarTentativaExpirada().
 */




const calcularTotalPago = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT
            COALESCE(
                SUM(valor) FILTER (
                    WHERE validacao_financeira = 'VALIDADO'
                ), 0
            ) AS total_validado,

            COALESCE(
                SUM(valor) FILTER (
                    WHERE validacao_financeira <> 'VALIDADO'
                ), 0
            ) AS total_nao_validado

         FROM pagamento
         WHERE id_reserva = $1
           AND status = 'PAGO'`,
        [idReserva]
    );

    return resultado.rows[0];
};

const listarPagamentosParaAnalise = async () => {
    const resultado = await pool.query(
        `SELECT
            p.id,
            p.id_reserva,
            p.tipo,
            p.valor,
            p.status,
            p.origem,
            p.forma_pagamento,
            p.validacao_financeira,
            p.motivo_analise_financeira,
            p.stripe_payment_intent_id,
            p.data_pagamento,
            r.status AS status_reserva,
            r.valor_total AS valor_total_reserva
         FROM pagamento p
         INNER JOIN reserva r
             ON r.id = p.id_reserva
         WHERE p.status = 'PAGO'
           AND p.validacao_financeira = 'REQUER_ANALISE'
         ORDER BY p.data_pagamento DESC NULLS LAST, p.id DESC`
    );

    return resultado.rows;
};

const buscarPagamentoParaAnalisePorId = async (idPagamento) => {
    const resultado = await pool.query(
        `SELECT
            p.id,
            p.id_reserva,
            p.tipo,
            p.valor,
            p.status,
            p.origem,
            p.forma_pagamento,
            p.validacao_financeira,
            p.motivo_analise_financeira,
            p.stripe_payment_intent_id,
            p.stripe_checkout_session_id,
            p.criado_em,
            p.data_pagamento,
            r.id_cliente,
            r.status AS status_reserva,
            r.valor_total AS valor_total_reserva,
            r.data_inicio,
            r.data_fim,
            r.hora_inicio,
            r.expira_em
         FROM pagamento p
         INNER JOIN reserva r
             ON r.id = p.id_reserva
         WHERE p.id = $1
           AND p.status = 'PAGO'
           AND p.validacao_financeira = 'REQUER_ANALISE'`,
        [idPagamento]
    );

    return resultado.rows[0] || null;
};


const cancelarTentativaSemSessao = async (
    idPagamento,
    chaveIdempotencia
) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Bloqueia a reserva primeiro.
        const reservaResultado = await client.query(
            `SELECT r.id
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.id = $1
             FOR UPDATE OF r`,
            [idPagamento]
        );

        if (reservaResultado.rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        // Cancela apenas a tentativa correspondente.
        const resultado = await client.query(
            `UPDATE pagamento
             SET status = 'CANCELADO'
             WHERE id = $1
               AND chave_idempotencia = $2
               AND status = 'PENDENTE'
               AND origem = 'STRIPE'
               AND stripe_checkout_session_id IS NULL
               AND stripe_payment_intent_id IS NULL
             RETURNING *`,
            [idPagamento, chaveIdempotencia]
        );

        await client.query('COMMIT');

        return resultado.rows[0] || null;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
    } finally {
        client.release();
    }
};



const buscarIdadeTentativa = async (idPagamento) => {
    const resultado = await pool.query(
        `SELECT
            EXTRACT(
                EPOCH FROM (
                    (NOW() AT TIME ZONE 'America/Bahia')
                    - criado_em
                )
            ) AS idade_segundos
         FROM pagamento
         WHERE id = $1
           AND status = 'PENDENTE'
           AND origem = 'STRIPE'`,
        [idPagamento]
    );

    if (resultado.rows.length === 0) {
        return null;
    }

    return Number(resultado.rows[0].idade_segundos);
};


const encerrarTentativaAdministrativamente = async (
    idPagamento,
    chaveIdempotencia,
    motivo
) => {
    if (
        !Number.isSafeInteger(idPagamento) ||
        idPagamento <= 0 ||
        typeof chaveIdempotencia !== 'string' ||
        !chaveIdempotencia.trim() ||
        typeof motivo !== 'string' ||
        motivo.trim().length < 20
    ) {
        throw new Error('Dados inválidos para encerramento administrativo.');
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Mantém a ordem de bloqueio: reserva antes de pagamento.
        const reservaResultado = await client.query(
            `SELECT r.id, r.status
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.id = $1
             FOR UPDATE OF r`,
            [idPagamento]
        );

        if (
            reservaResultado.rows.length === 0 ||
            reservaResultado.rows[0].status !== 'EXPIRADA'
        ) {
            await client.query('ROLLBACK');
            return null;
        }

        // Encerra somente a tentativa previamente investigada.
        const resultado = await client.query(
            `UPDATE pagamento
             SET status = 'CANCELADO',
                 motivo_cancelamento = $3,
                 cancelado_em = NOW()
             WHERE id = $1
               AND chave_idempotencia = $2
               AND status = 'PENDENTE'
               AND origem = 'STRIPE'
               AND tipo = 'ENTRADA'
               AND stripe_checkout_session_id IS NULL
               AND stripe_payment_intent_id IS NULL
             RETURNING id, id_reserva, status,
                       motivo_cancelamento, cancelado_em`,
            [
                idPagamento,
                chaveIdempotencia,
                motivo.trim()
            ]
        );

        await client.query('COMMIT');

        return resultado.rows[0] || null;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
    } finally {
        client.release();
    }
};


const encerrarPagamentoLegado = async (
    idPagamento,
    motivo
) => {
    const registrosPermitidos = {
        2: {
            idReserva: 2,
            tipo: 'ENTRADA',
            valor: 315,
            statusReserva: 'EXPIRADA'
        },
        5: {
            idReserva: 1,
            tipo: 'RESTANTE',
            valor: 275,
            statusReserva: 'CONCLUIDA'
        }
    };

    const esperado = registrosPermitidos[idPagamento];

    if (
        !esperado ||
        typeof motivo !== 'string' ||
        motivo.trim().length < 20
    ) {
        throw new Error(
            'Pagamento legado ou justificativa inválidos.'
        );
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Bloqueia a reserva antes do pagamento.
        const reservaResultado = await client.query(
            `SELECT r.id, r.status
             FROM reserva r
             JOIN pagamento p ON p.id_reserva = r.id
             WHERE p.id = $1
             FOR UPDATE OF r`,
            [idPagamento]
        );

        const reserva = reservaResultado.rows[0];

        if (
            !reserva ||
            reserva.id !== esperado.idReserva ||
            reserva.status !== esperado.statusReserva
        ) {
            await client.query('ROLLBACK');
            return null;
        }

        // Bloqueia o pagamento e confere os dados.
        const pagamentoResultado = await client.query(
            `SELECT *
             FROM pagamento
             WHERE id = $1
             FOR UPDATE`,
            [idPagamento]
        );

        const pagamento = pagamentoResultado.rows[0];

        if (
            !pagamento ||
            pagamento.id_reserva !== esperado.idReserva ||
            pagamento.tipo !== esperado.tipo ||
            Math.round(Number(pagamento.valor) * 100) !==
                esperado.valor * 100 ||
            pagamento.status !== 'PENDENTE' ||
            pagamento.origem !== 'STRIPE' ||
            pagamento.chave_idempotencia !== null ||
            pagamento.stripe_checkout_session_id !== null ||
            pagamento.stripe_payment_intent_id !== null ||
            pagamento.data_pagamento !== null ||
            pagamento.validacao_financeira !== 'NAO_AVALIADO'
        ) {
            await client.query('ROLLBACK');
            return null;
        }

        const resultado = await client.query(
            `UPDATE pagamento
             SET status = 'CANCELADO',
                 motivo_cancelamento = $2,
                 cancelado_em = NOW()
             WHERE id = $1
               AND status = 'PENDENTE'
             RETURNING
                 id,
                 id_reserva,
                 status,
                 motivo_cancelamento,
                 cancelado_em`,
            [idPagamento, motivo.trim()]
        );

        await client.query('COMMIT');

        return resultado.rows[0] || null;

    } catch (erro) {
        await client.query('ROLLBACK');
        throw erro;
    } finally {
        client.release();
    }
};


const buscarHistoricoPorReserva = async (idReserva) => {
    const resultado = await pool.query(
        `SELECT
            id,
            id_reserva,
            tipo,
            valor,
            status,
            forma_pagamento,
            validacao_financeira,
            criado_em,
            data_pagamento
         FROM pagamento
         WHERE id_reserva = $1
         ORDER BY criado_em DESC, id DESC`,
        [idReserva]
    );

    return resultado.rows;
};



module.exports = {
    iniciarTentativa,
    buscarPagamentoPendente,
    associarCheckoutSession,
    buscarPorReserva,
    buscarPorCheckoutSession,
    buscarTentativaPorId,
    cancelarTentativaExpirada,
    cancelarTentativaComFalha,
    confirmarPagamentoTransacional,
    buscarTentativasPendentesExpiradas,
    calcularTotalPago,
    validarTentativaPendente,
    listarPagamentosParaAnalise,
    buscarPagamentoParaAnalisePorId,
    cancelarTentativaSemSessao,
    buscarIdadeTentativa,
    encerrarTentativaAdministrativamente,
    encerrarPagamentoLegado,
    buscarHistoricoPorReserva
};
