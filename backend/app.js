const express = require('express');
const brinquedoRoutes = require('./src/routes/brinquedoRoutes');
const errorHandler = require('./src/middlewares/errorHandler');
const clienteRoutes = require('./src/routes/clienteRoutes');
const enderecoRoutes = require('./src/routes/enderecoRoutes');
const reservaRoutes = require('./src/routes/reservaRoutes');
const administradorRoutes =
    require('./src/routes/administradorRoutes');


const app = express();

app.use(express.json());

app.use('/brinquedos', brinquedoRoutes);
app.use('/clientes', clienteRoutes);
app.use('/enderecos', enderecoRoutes);
app.use('/reservas', reservaRoutes);
app.use('/administradores', administradorRoutes);

// tratamento de erros 
app.use(errorHandler);

module.exports = app;