const express = require('express');
const brinquedoRoutes = require('./src/routes/brinquedoRoutes');
const errorHandler = require('./src/middlewares/errorHandler');
const clienteRoutes = require('./src/routes/clienteRoutes');
const enderecoRoutes = require('./src/routes/enderecoRoutes');
const reservaRoutes = require('./src/routes/reservaRoutes');
const administradorRoutes =
    require('./src/routes/administradorRoutes');

const stripeWebhookRoutes = require('./src/routes/stripeWebhookRoutes');
const pagamentoRoutes = require('./src/routes/pagamentoRoutes');
const app = express();

app.use('/webhooks/stripe', stripeWebhookRoutes);


app.use(express.json());

app.use('/brinquedos', brinquedoRoutes);
app.use('/clientes', clienteRoutes);
app.use('/enderecos', enderecoRoutes);
app.use('/reservas', reservaRoutes);
app.use('/administradores', administradorRoutes);
app.use('/pagamentos', pagamentoRoutes);

// tratamento de erros 
app.use(errorHandler);

module.exports = app;