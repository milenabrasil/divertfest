const gerarDescricaoContrato = (reserva, itens) => {
    const brinquedos = itens.map((item) => {
        return `- Brinquedo ID ${item.id_brinquedo}: ${item.quantidade} unidade(s)`;
    }).join('\n');

    return `
CONTRATO DE LOCAÇÃO DE BRINQUEDOS - DIVERTFEST

RESERVA Nº ${reserva.id}

PERÍODO DA LOCAÇÃO
Início: ${new Date(reserva.data_inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
Fim: ${new Date(reserva.data_fim).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}

BRINQUEDOS SOLICITADOS
${brinquedos}

VALOR TOTAL
R$ ${Number(reserva.valor_total).toFixed(2).replace('.', ',')}

CONDIÇÕES
O cliente declara estar ciente das condições de locação
estabelecidas pela empresa.

A reserva somente será confirmada após a confirmação
do pagamento dentro do prazo informado.

O aceite deste contrato será registrado eletronicamente.
`.trim();
};

module.exports = {
    gerarDescricaoContrato
};