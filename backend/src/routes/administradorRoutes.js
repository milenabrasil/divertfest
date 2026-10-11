
const express = require('express');

const administradorController =
    require('../controllers/administradorController');

const adminAuthMiddleware =
    require('../middlewares/adminAuthMiddleware');


const avaliacaoController = require('../controllers/avaliacaoController');


const router = express.Router();

router.post(
    '/login',
    administradorController.login
);

router.get(
    '/reservas/pendentes',
    adminAuthMiddleware,
    administradorController.listarReservasPendentes
);

router.get(
    '/reservas/:id',
    adminAuthMiddleware,
    administradorController.buscarDetalhesReserva
);


router.patch(
    '/reservas/:id/recusar',
    adminAuthMiddleware,
    administradorController.recusarReserva
);


router.patch(
    '/reservas/:id/aprovar',
    adminAuthMiddleware,
    administradorController.aprovarReserva
);


router.patch(
    '/reservas/:id/concluir',
    adminAuthMiddleware,
    administradorController.concluirReserva
);


router.get(
    '/avaliacoes',
    adminAuthMiddleware,
    avaliacaoController.listarAvaliacoes
);



router.get(
    '/reservas',
    adminAuthMiddleware,
    administradorController.listarTodasReservas
);



module.exports = router;
