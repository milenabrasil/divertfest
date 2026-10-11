const reservaRepository = require('../repositories/reservaRepository');
const brinquedoRepository = require('../repositories/brinquedoRepository');
const enderecoRepository = require('../repositories/enderecoRepository');
const AppError = require('../middlewares/AppError');
const contratoRepository = require('../repositories/contratoRepository');

const criarReserva = async (
    idCliente,
    idEndereco,
    dataInicio,
    dataFim,
    itens
) => {
    if (!idEndereco) {
        throw new AppError('O endereço é obrigatório', 400);
    }

    if (!dataInicio || !dataFim) {
        throw new AppError(
            'As datas de início e fim são obrigatórias',
            400
        );
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        throw new AppError(
            'A reserva deve possuir pelo menos um brinquedo',
            400
        );
    }

    const inicio = new Date(`${dataInicio}T00:00:00`);
    const fim = new Date(`${dataFim}T00:00:00`);

    if (
        Number.isNaN(inicio.getTime()) ||
        Number.isNaN(fim.getTime())
    ) {
        throw new AppError('Data inválida', 400);
    }

    if (fim < inicio) {
        throw new AppError(
            'A data final não pode ser anterior à data inicial',
            400
        );
    }

    const endereco =
        await enderecoRepository.buscarPorId(idEndereco);

    if (!endereco) {
        throw new AppError('Endereço não encontrado', 404);
    }

    if (endereco.id_cliente !== Number(idCliente)) {
        throw new AppError(
            'O endereço informado não pertence ao cliente',
            403
        );
    }

    const idsBrinquedos = new Set();
    const itensPreparados = [];
    let valorTotal = 0;

    for (const item of itens) {
        const idBrinquedo = Number(item.id_brinquedo);
        const quantidade = Number(item.quantidade);

        if (
            !Number.isInteger(idBrinquedo) ||
            idBrinquedo <= 0
        ) {
            throw new AppError(
                'Brinquedo inválido',
                400
            );
        }

        if (
            !Number.isInteger(quantidade) ||
            quantidade <= 0
        ) {
            throw new AppError(
                'A quantidade deve ser maior que zero',
                400
            );
        }

        if (idsBrinquedos.has(idBrinquedo)) {
            throw new AppError(
                'O mesmo brinquedo não pode aparecer mais de uma vez na reserva',
                400
            );
        }

        idsBrinquedos.add(idBrinquedo);

        const brinquedo =
            await brinquedoRepository.buscarBrinquedoPorId(
                idBrinquedo
            );

        if (!brinquedo || !brinquedo.ativo) {
            throw new AppError(
                'Brinquedo não encontrado ou indisponível',
                404
            );
        }

        if (quantidade > brinquedo.quantidade_total) {
            throw new AppError(
                `Quantidade solicitada de ${brinquedo.nome} é maior que a quantidade existente`,
                400
            );
        }

        const precoUnitario = Number(brinquedo.preco);

        valorTotal += precoUnitario * quantidade;

        itensPreparados.push({
            id_brinquedo: idBrinquedo,
            quantidade,
            preco_unitario: precoUnitario
        });
    }

    return reservaRepository.criarReservaComItens(
        idCliente,
        idEndereco,
        dataInicio,
        dataFim,
        valorTotal,
        itensPreparados
    );
};

const listarMinhasReservas = async (idCliente) => {
    const reservas =
        await reservaRepository.buscarPorCliente(idCliente);

    for (const reserva of reservas) {
        reserva.itens =
            await reservaRepository.buscarItensPorReserva(
                reserva.id
            );
    }

    return reservas;
};

const buscarDetalhes = async (idCliente, idReserva) => {
    const reserva = await reservaRepository.buscarPorId(
        idReserva
    );

    if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
    }

    if (reserva.id_cliente !== Number(idCliente)) {
        throw new AppError(
            'Você não tem permissão para visualizar esta reserva',
            403
        );
    }

    const itens =
        await reservaRepository.buscarItensPorReserva(
            idReserva
        );

    return {
        ...reserva,
        itens
    };
};

const verificarDisponibilidade = async (
    idBrinquedo,
    quantidadeSolicitada,
    dataInicio,
    dataFim
) => {
    const brinquedo =
        await brinquedoRepository.buscarBrinquedoPorId(
            idBrinquedo
        );

    if (!brinquedo || !brinquedo.ativo) {
        throw new AppError(
            'Brinquedo não encontrado ou inativo',
            404
        );
    }

    const quantidadeReservada =
        await reservaRepository.buscarQuantidadeReservada(
            idBrinquedo,
            dataInicio,
            dataFim
        );

    const quantidadeDisponivel =
        brinquedo.quantidade_total - quantidadeReservada;

    return {
        disponivel:
            quantidadeSolicitada <= quantidadeDisponivel,
        quantidade_total: brinquedo.quantidade_total,
        quantidade_reservada: quantidadeReservada,
        quantidade_disponivel: quantidadeDisponivel
    };
};


const listarReservasPendentes = async () => {
    const reservas =
        await reservaRepository.buscarReservasPendentes();

    for (const reserva of reservas) {
        reserva.itens =
            await reservaRepository.buscarItensPorReserva(
                reserva.id
            );
    }

    return reservas;
};


const buscarDetalhesAdministrador = async (idReserva) => {
    const reserva = await reservaRepository.buscarPorId(idReserva);

    if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
    }

    const itens = await reservaRepository.buscarItensPorReserva(idReserva);

    const contrato = await contratoRepository.buscarPorReserva(idReserva);

    return {
        ...reserva,
        itens,
        contrato: contrato || null
    };
};



const recusarReserva = async (idReserva) => {
    const reserva = await reservaRepository.buscarPorId(
        idReserva
    );

    if (!reserva) {
        throw new AppError(
            'Reserva não encontrada',
            404
        );
    }

    if (reserva.status !== 'PENDENTE') {
        throw new AppError(
            'Somente reservas pendentes podem ser recusadas',
            409
        );
    }

    const reservaAtualizada =
        await reservaRepository.recusarReserva(idReserva);

    if (!reservaAtualizada) {
        throw new AppError(
            'A reserva não está mais pendente',
            409
        );
    }

    return reservaAtualizada;
};


const aprovarReserva = async (idReserva) => {
    return await reservaRepository.aprovarReserva(
        idReserva
    );
};


const cancelarReservaCliente = async (
    idReserva,
    idCliente
) => {
    const reserva = await reservaRepository.buscarPorId(
        idReserva
    );

    if (!reserva) {
        throw new AppError(
            'Reserva não encontrada',
            404
        );
    }

    if (Number(reserva.id_cliente) !== Number(idCliente)) {
        throw new AppError(
            'Você não tem permissão para cancelar esta reserva',
            403
        );
    }

    if (
        !['PENDENTE', 'AGUARDANDO_PAGAMENTO']
            .includes(reserva.status)
    ) {
        throw new AppError(
            'Esta reserva não pode ser cancelada',
            409
        );
    }

    const reservaCancelada =
        await reservaRepository.cancelarReservaCliente(
            idReserva,
            idCliente
        );

    if (!reservaCancelada) {
        throw new AppError(
            'A reserva não está mais disponível para cancelamento',
            409
        );
    }

    return reservaCancelada;
};


const concluirReserva = async (idReserva) => {
    const reserva = await reservaRepository.buscarPorId(idReserva);

    if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
    }

    if (reserva.status !== 'CONFIRMADA') {
        throw new AppError(
            'Apenas reservas confirmadas podem ser concluídas',
            409
        );
    }

    const reservaConcluida =
        await reservaRepository.concluirReserva(idReserva);

    if (!reservaConcluida) {
        throw new AppError(
            'A reserva só pode ser concluída após a data final do evento',
            409
        );
    }

    return reservaConcluida;
};


const listarTodasReservas = async (status) => {
    const statusPermitidos = [
        'PENDENTE',
        'AGUARDANDO_PAGAMENTO',
        'CONFIRMADA',
        'RECUSADA',
        'CANCELADA',
        'EXPIRADA',
        'CONCLUIDA'
    ];

    // Se um status foi informado, verificar se é válido
    if (status !== undefined) {
        if (
            typeof status !== 'string' ||
            !statusPermitidos.includes(status)
        ) {
            throw new AppError(
                'Status de reserva inválido',
                400
            );
        }
    }

    // Buscar as reservas no banco
    return await reservaRepository.listarTodasReservas(status);
};



module.exports = {
    criarReserva,
    listarMinhasReservas,
    buscarDetalhes,
    verificarDisponibilidade,
    listarReservasPendentes,
    buscarDetalhesAdministrador,
    recusarReserva,
    aprovarReserva,
    cancelarReservaCliente,
    concluirReserva,
    listarTodasReservas
};