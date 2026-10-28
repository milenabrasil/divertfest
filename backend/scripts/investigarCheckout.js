
const pagamentoService = require('../src/services/pagamentoService');
const pool = require('../src/config/db');

const executar = async () => {
    const idPagamento = Number(process.argv[2]);
    const inicio = process.argv[3];
    const fim = process.argv[4];

    if (!Number.isSafeInteger(idPagamento) || idPagamento <= 0) {
        throw new Error('Informe um ID de pagamento válido.');
    }

    if ((inicio && !fim) || (!inicio && fim)) {
        throw new Error(
            'Informe as duas datas ou nenhuma delas.'
        );
    }

    const periodo = inicio && fim
        ? { inicio, fim }
        : {};

    console.log(`Investigando pagamento #${idPagamento}...`);

    const resultado =
        await pagamentoService.investigarSessaoNaoVinculada(
            idPagamento,
            periodo
        );

    console.log(JSON.stringify(resultado, null, 2));
};

executar()
    .catch((erro) => {
        console.error('Erro na investigação:', erro.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
