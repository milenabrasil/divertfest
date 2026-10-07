const express = require('express');
const clienteController = require('../controllers/clienteController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/', clienteController.criar);
router.post('/login', clienteController.login);
router.get('/perfil', authMiddleware, clienteController.buscarPerfil
);
router.patch('/perfil', authMiddleware,
clienteController.atualizarPerfil
);

module.exports = router;