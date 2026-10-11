
const avaliacaoRepository = require('../repositories/avaliacaoRepository');
const reservaRepository = require('../repositories/reservaRepository');
const AppError = require('../middlewares/AppError');

const criarAvaliacao = async (idCliente, idReserva, nota, comentario) => {

    // 1. Validar o ID da reserva
    if (!Number.isInteger(Number(idReserva)) || Number(idReserva) <= 0) {
        throw new AppError('ID da reserva inválido', 400);
    }

    // 2. Validar a nota
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
        throw new AppError('A nota deve ser um número inteiro de 1 a 5', 400);
    }

    // 3. Validar o comentário
    if (
        comentario !== undefined &&
        comentario !== null &&
        typeof comentario !== 'string'
    ) {
        throw new AppError('O comentário deve ser um texto', 400);
    }

    // 4. Buscar a reserva
    const reserva = await reservaRepository.buscarPorId(idReserva);

    if (!reserva) {
        throw new AppError('Reserva não encontrada', 404);
    }

    // 5. Verificar se pertence ao cliente
    if (Number(reserva.id_cliente) !== Number(idCliente)) {
        throw new AppError(
            'Você não tem permissão para avaliar esta reserva',
            403
        );
    }

    // 6. Verificar se a locação foi concluída
    if (reserva.status !== 'CONCLUIDA') {
        throw new AppError(
            'Apenas reservas concluídas podem ser avaliadas',
            409
        );
    }

    // 7. Verificar se já existe uma avaliação
    const avaliacaoExistente =
        await avaliacaoRepository.buscarPorReserva(idReserva);

    if (avaliacaoExistente) {
        throw new AppError(
            'Esta reserva já possui uma avaliação',
            409
        );
    }

    // 8. Cadastrar a avaliação
    try {
        return await avaliacaoRepository.criarAvaliacao(
            idReserva,
            nota,
            comentario ?? null
        );
    } catch (error) {
        // Proteção contra avaliações simultâneas
        if (error.code === '23505') {
            throw new AppError(
                'Esta reserva já possui uma avaliação',
                409
            );
        }

        throw error;
    }
};

const listarAvaliacoes = async () => {
    return await avaliacaoRepository.listarAvaliacoes();
};

module.exports = {
    criarAvaliacao,
    listarAvaliacoes
};
