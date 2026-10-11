const express = require('express');
const reservaController = require('../controllers/reservaController');
const authMiddleware = require('../middlewares/authMiddleware');

const contratoController = require('../controllers/contratoController');


const avaliacaoController = require('../controllers/avaliacaoController');


const router = express.Router();

router.post(
    '/',
    authMiddleware,
    reservaController.criar
);

router.get(
    '/minhas',
    authMiddleware,
    reservaController.listarMinhas
);

router.get(
    '/:id',
    authMiddleware,
    reservaController.buscarDetalhes
);


router.get(
    '/:id/contrato',
    authMiddleware,
    contratoController.visualizarContrato
);

router.patch(
    '/:id/contrato/aceitar',
    authMiddleware,
    contratoController.aceitarContrato
);


router.patch(
    '/:id/cancelar',
    authMiddleware,
    reservaController.cancelarReservaCliente
);


router.post(
    '/:id/avaliacao',
    authMiddleware,
    avaliacaoController.criarAvaliacao
);


module.exports = router;