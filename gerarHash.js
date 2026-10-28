
const bcrypt = require('bcrypt');

const gerarHash = async () => {
    const senha = process.env.SENHA_PARA_HASH;

    if (!senha) {
        console.error('Informe a senha na variável SENHA_PARA_HASH.');
        process.exitCode = 1;
        return;
    }

    const hash = await bcrypt.hash(senha, 10);

    console.log(hash);
};

gerarHash().catch((erro) => {
    console.error('Erro ao gerar o hash:', erro.message);
    process.exitCode = 1;
});
