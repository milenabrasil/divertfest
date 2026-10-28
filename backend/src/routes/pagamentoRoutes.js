
const express = require('express');
const router = express.Router();

const pagamentoController = require(
    '../controllers/pagamentoController'
);

const authMiddleware = require(
    '../middlewares/authMiddleware'
);

// Criar Checkout para pagamento de uma reserva
router.post(
    '/reservas/:idReserva/checkout',
    authMiddleware,
    pagamentoController.criarCheckout
);

// Consultar histórico de pagamentos de uma reserva
router.get(
    '/reservas/:idReserva/pagamentos',
    authMiddleware,
    pagamentoController.listarHistoricoPorReserva
);

module.exports = router;
