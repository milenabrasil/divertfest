const administradorService =
    require('../services/administradorService');

const AppError = require('../middlewares/AppError');
const login = async (req, res) => {
    const { usuario, senha } = req.body;

    const resultado =
        await administradorService.login(
            usuario,
            senha
        );

    return res.status(200).json(resultado);
};


const reservaService =
    require('../services/reservaService');

const listarReservasPendentes = async (req, res) => {
    const reservas =
        await reservaService.listarReservasPendentes();

    return res.status(200).json(reservas);
};


const buscarDetalhesReserva = async (req, res) => {
    const { id } = req.params;

    const reserva =
        await reservaService.buscarDetalhesAdministrador(
            id
        );

    return res.status(200).json(reserva);
};


const recusarReserva = async (req, res) => {
    const { id } = req.params;

    const reserva =
        await reservaService.recusarReserva(id);

    return res.status(200).json({
        mensagem: 'Reserva recusada com sucesso',
        reserva
    });
};


const aprovarReserva = async (req, res) => {
    const { id } = req.params;

    const reserva =
        await reservaService.aprovarReserva(id);

    return res.status(200).json({
        mensagem: 'Reserva aprovada com sucesso',
        reserva
    });
};


const concluirReserva = async (req, res) => {
    const { id } = req.params;

    const reserva = await reservaService.concluirReserva(id);

    return res.status(200).json({
        mensagem: 'Reserva concluída com sucesso',
        reserva
    });
};


const listarTodasReservas = async (req, res) => {
    const { status } = req.query;

    const reservas = await reservaService.listarTodasReservas(status);

    return res.status(200).json({
        total: reservas.length,
        reservas
    });
};

const pagamentoRepository =
    require('../repositories/pagamentoRepository');

const listarPagamentosParaAnalise = async (req, res) => {
    const pagamentos =
        await pagamentoRepository.listarPagamentosParaAnalise();

    return res.status(200).json({
        total: pagamentos.length,
        pagamentos
    });
};



const buscarDetalhesPagamentoParaAnalise = async (req, res) => {
    const { id } = req.params;

    if (!/^[1-9]\d*$/.test(id)) {
        throw new AppError('ID do pagamento inválido', 400);
    }

    const pagamento =
        await pagamentoRepository.buscarPagamentoParaAnalisePorId(id);

    if (!pagamento) {
        throw new AppError(
            'Pagamento para análise não encontrado',
            404
        );
    }

    return res.status(200).json(pagamento);
};

module.exports = {
    login,
    listarReservasPendentes,
    buscarDetalhesReserva,
    recusarReserva,
    aprovarReserva,
    concluirReserva,
    listarTodasReservas,
    listarPagamentosParaAnalise,
    buscarDetalhesPagamentoParaAnalise
    
};