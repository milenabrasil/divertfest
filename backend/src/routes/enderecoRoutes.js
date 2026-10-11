const express = require('express');
const enderecoController = require('../controllers/enderecoController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post(
    '/',
    authMiddleware,
    enderecoController.criar
);

router.get(
    '/',
    authMiddleware,
    enderecoController.listar
);

router.patch(
    '/:id',
    authMiddleware,
    enderecoController.atualizar
);

module.exports = router;